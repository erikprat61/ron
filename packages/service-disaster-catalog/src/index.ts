import { createHash } from "node:crypto";
import type {
  DisasterCategory,
  DisasterEvent,
  DisasterMatchKind,
  DisasterSeverity,
  DisasterSnapshot,
  DisasterSourceKind,
  DisasterStatus,
  EndTimeConfidence,
  GeoPoint,
  GeoPolygon,
  RonConfig,
  SourceHealthSnapshot
} from "@ron/contract";
import { cloneDisasterEvent, compareDisasterEvents } from "@ron/contract";
import type { EonetClient, EonetEvent } from "@ron/api-eonet";
import type { OpenFemaClient, OpenFemaDeclarationRecord } from "@ron/api-openfema";
import type { UsgsClient, UsgsFeature } from "@ron/api-usgs";
import type { WeatherGovAlertFeature, WeatherGovClient } from "@ron/api-weather-gov";
import { calculateCentroid, collectGeoJsonPoints, haversineDistanceKm, parseGeoJsonPolygons } from "@ron/geo";
import { ResourceImpactService } from "@ron/service-resource-impact";

export interface DisasterCatalogDependencies {
  config: RonConfig;
  weatherGovClient: WeatherGovClient;
  openFemaClient: OpenFemaClient;
  usgsClient: UsgsClient;
  eonetClient: EonetClient;
  resourceImpactService: ResourceImpactService;
}

type CachedSourceData = {
  refreshedAt: string;
  events: DisasterEvent[];
};

type SourceRefreshResult = {
  events: DisasterEvent[];
  health: SourceHealthSnapshot;
};

export class DisasterCatalogService {
  private snapshot?: DisasterSnapshot;
  private refreshPromise?: Promise<DisasterSnapshot>;
  private readonly cachedSourceData = new Map<DisasterSourceKind, CachedSourceData>();

  constructor(private readonly dependencies: DisasterCatalogDependencies) {}

  async getSnapshot(forceRefresh = false): Promise<DisasterSnapshot> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.snapshot &&
      now - Date.parse(this.snapshot.generatedAt) < this.dependencies.config.disasterRefresh.cacheDurationMs
    ) {
      return this.snapshot;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.buildSnapshot().finally(() => {
      this.refreshPromise = undefined;
    });

    const snapshot = await this.refreshPromise;
    this.snapshot = snapshot;
    return snapshot;
  }

  async refresh(): Promise<DisasterSnapshot> {
    return this.getSnapshot(true);
  }

  private async buildSnapshot(): Promise<DisasterSnapshot> {
    const generatedAt = new Date().toISOString();
    const refreshResults = await Promise.all([
      this.refreshSource("nws"),
      this.refreshSource("fema"),
      this.refreshSource("usgs"),
      this.refreshSource("eonet")
    ]);

    const events = refreshResults.flatMap((result) => result.events).sort(compareDisasterEvents);
    const resourceImpacts = this.dependencies.resourceImpactService.analyze(events);
    const impactsByEventId = new Map<string, typeof resourceImpacts>();

    for (const signal of resourceImpacts) {
      for (const eventId of signal.matchedEventIds) {
        const existing = impactsByEventId.get(eventId) ?? [];
        existing.push(signal);
        impactsByEventId.set(eventId, existing);
      }
    }

    const hydratedEvents = events.map((event) => ({
      ...event,
      impactedResources: impactsByEventId.get(event.id) ?? []
    }));

    return {
      generatedAt,
      events: hydratedEvents,
      sourceHealth: refreshResults.map((result) => result.health),
      resourceImpacts
    };
  }

  private async refreshSource(source: DisasterSourceKind): Promise<SourceRefreshResult> {
    const attemptedAt = new Date().toISOString();

    try {
      const events = await this.fetchSource(source);
      this.cachedSourceData.set(source, {
        refreshedAt: attemptedAt,
        events: events.map(cloneDisasterEvent)
      });

      return {
        events,
        health: {
          source,
          status: "healthy",
          lastAttemptedRefreshUtc: attemptedAt,
          lastSuccessfulRefreshUtc: attemptedAt,
          eventCount: events.length
        }
      };
    } catch (error) {
      const cached = this.cachedSourceData.get(source);
      if (cached && Date.now() - Date.parse(cached.refreshedAt) <= this.dependencies.config.disasterRefresh.maxHealthyStalenessMs) {
        return {
          events: cached.events.map(cloneDisasterEvent),
          health: {
            source,
            status: "degraded",
            lastAttemptedRefreshUtc: attemptedAt,
            lastSuccessfulRefreshUtc: cached.refreshedAt,
            eventCount: cached.events.length,
            errorMessage: `Serving stale cached data because refresh failed: ${error instanceof Error ? error.message : String(error)}`
          }
        };
      }

      return {
        events: [],
        health: {
          source,
          status: "unhealthy",
          lastAttemptedRefreshUtc: attemptedAt,
          lastSuccessfulRefreshUtc: cached?.refreshedAt,
          eventCount: 0,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  private async fetchSource(source: DisasterSourceKind): Promise<DisasterEvent[]> {
    switch (source) {
      case "nws":
        return this.fetchWeatherGovEvents();
      case "fema":
        return this.fetchFemaEvents();
      case "usgs":
        return this.fetchUsgsEvents();
      case "eonet":
        return this.fetchEonetEvents();
    }
  }

  private async fetchWeatherGovEvents(): Promise<DisasterEvent[]> {
    if (!this.dependencies.config.nationalWeatherService.enabled) {
      return [];
    }

    const response = await this.dependencies.weatherGovClient.getActiveAlerts();
    return (response.features ?? [])
      .map((feature) => normalizeWeatherGovAlert(feature))
      .filter((event): event is DisasterEvent => event !== undefined);
  }

  private async fetchFemaEvents(): Promise<DisasterEvent[]> {
    if (!this.dependencies.config.fema.enabled) {
      return [];
    }

    const response = await this.dependencies.openFemaClient.getDisasterDeclarations();
    return (response.DisasterDeclarationsSummaries ?? [])
      .map((record) => normalizeFemaRecord(record))
      .filter((event): event is DisasterEvent => event !== undefined);
  }

  private async fetchUsgsEvents(): Promise<DisasterEvent[]> {
    if (!this.dependencies.config.usgs.enabled) {
      return [];
    }

    const response = await this.dependencies.usgsClient.getAllDayEarthquakes();
    return (response.features ?? [])
      .map((feature) =>
        normalizeUsgsFeature(
          feature,
          this.dependencies.config.usgs.minimumMagnitude,
          this.dependencies.config.usgs.minimumSignificance
        )
      )
      .filter((event): event is DisasterEvent => event !== undefined);
  }

  private async fetchEonetEvents(): Promise<DisasterEvent[]> {
    if (!this.dependencies.config.eonet.enabled) {
      return [];
    }

    const response = await this.dependencies.eonetClient.getOpenEvents();
    return (response.events ?? [])
      .map((event) => normalizeEonetEvent(event))
      .filter((event): event is DisasterEvent => event !== undefined);
  }
}

function normalizeWeatherGovAlert(feature: WeatherGovAlertFeature): DisasterEvent | undefined {
  const properties = asObject(feature.properties);
  if (!properties) {
    return undefined;
  }

  if (readString(properties.status)?.toUpperCase() !== "ACTUAL") {
    return undefined;
  }

  const sourceEventId = readString(properties.id) ?? readString(feature.id);
  if (!sourceEventId) {
    return undefined;
  }

  const startedAt = readDate(properties.effective) ?? readDate(properties.sent);
  if (!startedAt) {
    return undefined;
  }

  const title = readString(properties.event) ?? "Weather alert";
  const ends = readDate(properties.ends);
  const expires = readDate(properties.expires);
  const zoneIds = parseZoneIds(properties);
  const countyFipsCodes = parseCountyFipsCodes(properties, zoneIds);
  const footprintPolygons = parseGeoJsonPolygons(feature.geometry);
  const stateCodes = normalizeIdentifiers(zoneIds.map(extractStateCodeFromZoneId));

  const expectedEndAt = ends ?? expires;
  const endTimeConfidence: EndTimeConfidence = ends
    ? "high"
    : expires
      ? "medium"
      : "none";
  const endTimeExplanation = ends
    ? "Provided by the National Weather Service alert ends field."
    : expires
      ? "Provided by the National Weather Service alert expires field."
      : "The National Weather Service alert does not publish an expected end time.";

  return {
    id: createStableId("nws", sourceEventId),
    source: "nws",
    sourceEventId,
    title,
    category: mapWeatherCategory(title, readString(properties.category)),
    severity: mapWeatherSeverity(readString(properties.severity)),
    status: "active",
    startedAt,
    expectedEndAt,
    endTimeConfidence,
    endTimeExplanation,
    summary: readString(properties.headline) ?? title,
    description: readString(properties.description),
    instruction: readString(properties.instruction),
    sourceUrl: readString(properties["@id"]),
    areaDescription: readString(properties.areaDesc),
    stateCodes,
    countyFipsCodes,
    zoneIds,
    footprintPolygons,
    impactedResources: []
  };
}

function normalizeFemaRecord(record: OpenFemaDeclarationRecord): DisasterEvent | undefined {
  const sourceEventId = readString(record.id) ?? readString(record.femaDeclarationString);
  if (!sourceEventId) {
    return undefined;
  }

  const declarationDate = readDate(record.declarationDate);
  const incidentBeginDate = readDate(record.incidentBeginDate);
  const incidentEndDate = readDate(record.incidentEndDate);
  if (!declarationDate && !incidentBeginDate) {
    return undefined;
  }

  const stateCode = normalizeStateCode(readString(record.state));
  const countyFips = normalizeCountyFips(readString(record.fipsCountyCode));
  const declarationType = readString(record.declarationType);
  const title = readString(record.declarationTitle) ?? readString(record.incidentType) ?? "FEMA disaster declaration";
  const designatedArea = readString(record.designatedArea);
  const disasterNumber = readNumber(record.disasterNumber);
  const startedAt = incidentBeginDate ?? declarationDate!;

  return {
    id: createStableId("fema", sourceEventId),
    source: "fema",
    sourceEventId,
    title,
    category: mapFemaCategory(readString(record.incidentType)),
    severity: mapFemaSeverity(declarationType),
    status: incidentEndDate ? "resolved" : "active",
    startedAt,
    endedAt: incidentEndDate,
    expectedEndAt: incidentEndDate,
    endTimeConfidence: incidentEndDate ? "high" : "none",
    endTimeExplanation: incidentEndDate
      ? "Provided by the FEMA incident end date field."
      : "FEMA has not published an incident end date for this open declaration.",
    summary: buildFemaSummary(readString(record.incidentType), designatedArea, stateCode),
    description: readString(record.femaDeclarationString),
    sourceUrl: disasterNumber ? `https://www.fema.gov/disaster/${disasterNumber}` : undefined,
    areaDescription: designatedArea ? `${designatedArea}, ${stateCode ?? ""}`.trim() : stateCode,
    stateCodes: stateCode ? [stateCode] : [],
    countyFipsCodes: countyFips ? [countyFips] : [],
    zoneIds: [],
    footprintPolygons: [],
    impactedResources: []
  };
}

function normalizeUsgsFeature(feature: UsgsFeature, minimumMagnitude: number, minimumSignificance: number): DisasterEvent | undefined {
  const properties = asObject(feature.properties);
  const geometry = asObject(feature.geometry);
  if (!properties || !geometry) {
    return undefined;
  }

  const sourceEventId = readString(feature.id);
  const occurredAt = readUnixDate(properties.time);
  const magnitude = readNumber(properties.mag);
  if (!sourceEventId || !occurredAt || magnitude === undefined) {
    return undefined;
  }

  const point = tryParsePoint(geometry.coordinates);
  if (!point || !isWithinUnitedStates(point)) {
    return undefined;
  }

  const significance = readNumber(properties.sig) ?? 0;
  const tsunami = readNumber(properties.tsunami) ?? 0;
  const alertLevel = readString(properties.alert);
  if (magnitude < minimumMagnitude && significance < minimumSignificance && tsunami === 0 && !alertLevel) {
    return undefined;
  }

  const place = readString(properties.place);
  const stateCode = tryResolveStateCode(place, point);
  const title = readString(properties.title) ?? `M ${magnitude.toFixed(1)} earthquake`;

  return {
    id: createStableId("usgs", sourceEventId),
    source: "usgs",
    sourceEventId,
    title,
    category: "earthquake",
    severity: mapUsgsSeverity(magnitude, alertLevel),
    status: "monitoring",
    startedAt: occurredAt,
    endedAt: occurredAt,
    expectedEndAt: occurredAt,
    endTimeConfidence: "high",
    endTimeExplanation: "Earthquakes are point-in-time events, so the recorded occurrence time is treated as the event end time.",
    summary: place ?? title,
    sourceUrl: readString(properties.url) ?? readString(properties.detail),
    areaDescription: place,
    stateCodes: stateCode ? [stateCode] : [],
    countyFipsCodes: [],
    zoneIds: [],
    centroid: point,
    radiusKm: computeImpactRadiusKm(magnitude, significance),
    footprintPolygons: [],
    magnitude,
    magnitudeUnit: readString(properties.magType),
    impactedResources: []
  };
}

function normalizeEonetEvent(rawEvent: EonetEvent): DisasterEvent | undefined {
  const sourceEventId = readString(rawEvent.id);
  if (!sourceEventId) {
    return undefined;
  }

  const title = readString(rawEvent.title) ?? "EONET event";
  const categories = Array.isArray(rawEvent.categories) ? rawEvent.categories : [];
  const categoryElement = asObject(categories[0]);
  const categoryId = readString(categoryElement?.id);
  const categoryTitle = readString(categoryElement?.title);
  const disasterCategory = mapEonetCategory(categoryId, categoryTitle, title);

  const geometryEntries = Array.isArray(rawEvent.geometry) ? rawEvent.geometry.map(asObject).filter(Boolean) : [];
  const timestamps = geometryEntries
    .map((entry) => readDate(entry?.date))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right));

  if (timestamps.length === 0) {
    return undefined;
  }

  const latestGeometry = geometryEntries
    .map((entry) => ({ entry, date: readDate(entry?.date) ?? "" }))
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
    .map(({ entry }) => tryParseEonetGeometry(entry, disasterCategory))
    .find((entry): entry is EonetGeometrySnapshot => Boolean(entry));

  const stateCode = tryResolveStateCode(title, latestGeometry?.centroid);
  const closedAt = readDate(rawEvent.closed);

  return {
    id: createStableId("eonet", sourceEventId),
    source: "eonet",
    sourceEventId,
    title,
    category: disasterCategory,
    severity: mapEonetSeverity(disasterCategory, latestGeometry?.magnitude, latestGeometry?.magnitudeUnit),
    status: closedAt ? "resolved" : "active",
    startedAt: timestamps[0]!,
    endedAt: closedAt,
    expectedEndAt: closedAt,
    endTimeConfidence: closedAt ? "high" : "none",
    endTimeExplanation: closedAt
      ? "NASA EONET marked this event as closed."
      : "NASA EONET marks this event as open and does not publish a predicted end time.",
    summary: categoryTitle ? `${categoryTitle}: ${title}` : title,
    description: readString(rawEvent.description),
    sourceUrl: readString(rawEvent.link) ?? getFirstEonetSourceUrl(rawEvent),
    areaDescription: title,
    stateCodes: stateCode ? [stateCode] : [],
    countyFipsCodes: [],
    zoneIds: [],
    centroid: latestGeometry?.centroid,
    radiusKm: latestGeometry?.radiusKm,
    footprintPolygons: latestGeometry?.polygons ?? [],
    magnitude: latestGeometry?.magnitude,
    magnitudeUnit: latestGeometry?.magnitudeUnit,
    impactedResources: []
  };
}

function parseZoneIds(properties: Record<string, unknown>): string[] {
  const geocode = asObject(properties.geocode);
  const ugcCodes = Array.isArray(geocode?.UGC)
    ? geocode!.UGC.map(readString).filter((value): value is string => Boolean(value))
    : [];

  const affectedZones = Array.isArray(properties.affectedZones)
    ? properties.affectedZones.map(readString).map(extractTrailingSegment).filter((value): value is string => Boolean(value))
    : [];

  return normalizeIdentifiers([...ugcCodes, ...affectedZones]);
}

function parseCountyFipsCodes(properties: Record<string, unknown>, zoneIds: string[]): string[] {
  const geocode = asObject(properties.geocode);
  const sameCodes = Array.isArray(geocode?.SAME)
    ? geocode!.SAME.map(readString).map(normalizeCountyFips).filter((value): value is string => Boolean(value))
    : [];
  const zoneDerived = zoneIds.map(extractCountyFipsFromZoneId).filter((value): value is string => Boolean(value));
  return normalizeIdentifiers([...sameCodes, ...zoneDerived]);
}

function mapWeatherCategory(eventName: string, sourceCategory?: string): DisasterCategory {
  const normalized = `${sourceCategory ?? ""} ${eventName}`.toUpperCase();
  if (normalized.includes("FIRE")) return "fire";
  if (normalized.includes("FLOOD")) return "flood";
  if (normalized.includes("HURRICANE") || normalized.includes("TROPICAL")) return "hurricane";
  if (normalized.includes("STORM") || normalized.includes("TORNADO") || normalized.includes("THUNDER") || normalized.includes("WIND")) return "storm";
  if (normalized.includes("DROUGHT")) return "drought";
  return "weather";
}

function mapWeatherSeverity(severity?: string): DisasterSeverity {
  switch ((severity ?? "").trim().toUpperCase()) {
    case "EXTREME":
      return "extreme";
    case "SEVERE":
      return "severe";
    case "MODERATE":
      return "moderate";
    case "MINOR":
      return "minor";
    default:
      return "unknown";
  }
}

function mapFemaCategory(incidentType?: string): DisasterCategory {
  const normalized = (incidentType ?? "").trim().toUpperCase();
  if (normalized.includes("FIRE")) return "fire";
  if (normalized.includes("FLOOD")) return "flood";
  if (normalized.includes("HURRICANE") || normalized.includes("TROPICAL")) return "hurricane";
  if (normalized.includes("STORM") || normalized.includes("TORNADO") || normalized.includes("WIND")) return "storm";
  if (normalized.includes("DROUGHT")) return "drought";
  if (normalized.includes("EARTHQUAKE")) return "earthquake";
  return "other";
}

function mapFemaSeverity(declarationType?: string): DisasterSeverity {
  switch ((declarationType ?? "").trim().toUpperCase()) {
    case "DR":
    case "FM":
      return "severe";
    default:
      return "moderate";
  }
}

function buildFemaSummary(incidentType?: string, designatedArea?: string, stateCode?: string): string {
  const incident = incidentType && incidentType.trim() !== "" ? incidentType : "Disaster declaration";
  return designatedArea ? `${incident} declaration for ${designatedArea}, ${stateCode}` : `${incident} declaration in ${stateCode}`;
}

function mapUsgsSeverity(magnitude: number, alertLevel?: string): DisasterSeverity {
  const normalizedAlert = alertLevel?.trim().toUpperCase();
  if (normalizedAlert === "RED" || magnitude >= 7.0) return "extreme";
  if (normalizedAlert === "ORANGE" || magnitude >= 6.0) return "severe";
  if (normalizedAlert === "YELLOW" || magnitude >= 4.5) return "moderate";
  return "minor";
}

function computeImpactRadiusKm(magnitude: number, significance: number): number {
  let radius = 20 + magnitude * 15;
  if (significance >= 400) {
    radius += 40;
  }

  return Math.max(20, Math.min(300, radius));
}

function mapEonetCategory(categoryId?: string, categoryTitle?: string, title?: string): DisasterCategory {
  const normalized = `${categoryId ?? ""} ${categoryTitle ?? ""} ${title ?? ""}`.toUpperCase();
  if (normalized.includes("WILDFIRE") || normalized.includes("FIRE")) return "fire";
  if (normalized.includes("FLOOD")) return "flood";
  if (normalized.includes("HURRICANE") || normalized.includes("TYPHOON") || normalized.includes("CYCLONE") || normalized.includes("TROPICAL")) return "hurricane";
  if (normalized.includes("STORM")) return "storm";
  if (normalized.includes("DROUGHT")) return "drought";
  if (normalized.includes("EARTHQUAKE")) return "earthquake";
  return "weather";
}

function mapEonetSeverity(category: DisasterCategory, magnitude?: number, magnitudeUnit?: string): DisasterSeverity {
  const areaKm2 = tryConvertAreaToSquareKilometers(magnitude, magnitudeUnit);
  if (areaKm2 !== undefined) {
    if (areaKm2 >= 5000) return "extreme";
    if (areaKm2 >= 500) return "severe";
    if (areaKm2 >= 50) return "moderate";
    return "minor";
  }

  switch (category) {
    case "hurricane":
      return "severe";
    case "storm":
    case "flood":
    case "drought":
    case "fire":
      return "moderate";
    default:
      return "minor";
  }
}

type EonetGeometrySnapshot = {
  centroid: GeoPoint;
  radiusKm: number;
  polygons: GeoPolygon[];
  magnitude?: number;
  magnitudeUnit?: string;
};

function tryParseEonetGeometry(geometry: Record<string, unknown> | undefined, category: DisasterCategory): EonetGeometrySnapshot | undefined {
  if (!geometry) {
    return undefined;
  }

  const polygons = parseGeoJsonPolygons(geometry);
  const points = collectGeoJsonPoints(geometry.coordinates);
  if (points.length === 0) {
    return undefined;
  }

  const centroid = calculateCentroid(points);
  const footprintRadiusKm =
    points.length === 1 ? undefined : Math.max(...points.map((point) => haversineDistanceKm(centroid, point)));
  const magnitude = readNumber(geometry.magnitudeValue);
  const magnitudeUnit = readString(geometry.magnitudeUnit);
  const areaRadiusKm = tryConvertAreaToRadiusKm(magnitude, magnitudeUnit);
  const defaultRadiusKm = getDefaultRadiusKm(category);
  const radiusKm = footprintRadiusKm !== undefined
    ? Math.max(footprintRadiusKm, areaRadiusKm ?? 0)
    : Math.max(defaultRadiusKm, areaRadiusKm ?? defaultRadiusKm);

  return {
    centroid,
    radiusKm: Math.max(2, Math.min(800, radiusKm)),
    polygons,
    magnitude,
    magnitudeUnit
  };
}

function getDefaultRadiusKm(category: DisasterCategory): number {
  switch (category) {
    case "fire":
      return 10;
    case "flood":
      return 60;
    case "hurricane":
      return 200;
    case "storm":
      return 120;
    case "drought":
      return 250;
    case "earthquake":
      return 50;
    default:
      return 30;
  }
}

function tryConvertAreaToRadiusKm(magnitude?: number, magnitudeUnit?: string): number | undefined {
  const areaKm2 = tryConvertAreaToSquareKilometers(magnitude, magnitudeUnit);
  return areaKm2 === undefined ? undefined : Math.sqrt(areaKm2 / Math.PI);
}

function tryConvertAreaToSquareKilometers(magnitude?: number, magnitudeUnit?: string): number | undefined {
  if (magnitude === undefined || !magnitudeUnit) {
    return undefined;
  }

  const normalizedUnit = magnitudeUnit.trim().toUpperCase();
  if (normalizedUnit.includes("ACRE")) return magnitude * 0.0040468564224;
  if (normalizedUnit.includes("HECT")) return magnitude * 0.01;
  if ((normalizedUnit.includes("KM") && normalizedUnit.includes("2")) || normalizedUnit.includes("SQ KM") || normalizedUnit.includes("SQUARE KILOMETER")) {
    return magnitude;
  }
  if ((normalizedUnit.includes("MI") && normalizedUnit.includes("2")) || normalizedUnit.includes("SQ MI") || normalizedUnit.includes("SQUARE MILE")) {
    return magnitude * 2.5899881103;
  }

  return undefined;
}

function getFirstEonetSourceUrl(rawEvent: EonetEvent): string | undefined {
  const sources = Array.isArray(rawEvent.sources) ? rawEvent.sources : [];
  for (const source of sources) {
    const sourceObject = asObject(source);
    const url = readString(sourceObject?.url);
    if (url) {
      return url;
    }
  }
  return undefined;
}

function createStableId(source: string, sourceEventId: string): string {
  return createHash("sha256").update(`${source}:${sourceEventId}`).digest("hex").slice(0, 24);
}

function normalizeIdentifiers(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim().toUpperCase()))];
}

function extractTrailingSegment(rawValue?: string): string | undefined {
  if (!rawValue) {
    return undefined;
  }
  const trimmed = rawValue.trim().replace(/\/+$/, "");
  const separatorIndex = trimmed.lastIndexOf("/");
  const segment = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed;
  return segment.trim().toUpperCase();
}

function extractStateCodeFromZoneId(zoneId?: string): string | undefined {
  if (!zoneId || zoneId.length < 2) {
    return undefined;
  }
  const prefix = zoneId.slice(0, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(prefix) ? prefix : undefined;
}

function extractCountyFipsFromZoneId(zoneId?: string): string | undefined {
  if (!zoneId) {
    return undefined;
  }

  const normalized = zoneId.trim().toUpperCase();
  if (normalized.length < 6 || normalized[2] !== "C") {
    return undefined;
  }

  return normalized.slice(-3);
}

function normalizeStateCode(stateCode?: string): string | undefined {
  return stateCode && stateCode.trim() !== "" ? stateCode.trim().toUpperCase() : undefined;
}

function normalizeCountyFips(countyFips?: string): string | undefined {
  if (!countyFips) {
    return undefined;
  }

  const digits = countyFips.replace(/\D/g, "");
  if (digits === "") {
    return undefined;
  }

  return digits.length > 3 ? digits.slice(-3) : digits.padStart(3, "0");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function readDate(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

function readUnixDate(value: unknown): string | undefined {
  const milliseconds = readNumber(value);
  return milliseconds === undefined ? undefined : new Date(milliseconds).toISOString();
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function tryParsePoint(coordinates: unknown): GeoPoint | undefined {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return undefined;
  }

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return undefined;
  }

  return { latitude, longitude };
}

const usStateNames: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  "American Samoa": "AS",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Guam: "GU",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  "Northern Mariana Islands": "MP",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Puerto Rico": "PR",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  "Virgin Islands": "VI",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY"
};

const usStateCodes = new Set(Object.values(usStateNames));

function isWithinUnitedStates(point: GeoPoint): boolean {
  return (
    isWithin(point, 24.396308, 49.384358, -124.848974, -66.885444) ||
    isWithin(point, 51.214183, 71.365162, -179.148909, -129.9795) ||
    isWithin(point, 18.86546, 22.2356, -160.2471, -154.806773) ||
    isWithin(point, 17.8, 18.6, -67.3, -65.2) ||
    isWithin(point, 17.5, 18.5, -65.2, -64.3) ||
    isWithin(point, 13.1, 13.8, 144.4, 145.1) ||
    isWithin(point, 14.0, 20.7, 144.7, 146.2) ||
    isWithin(point, -14.5, -10.9, -171.1, -168.0)
  );
}

function tryResolveStateCode(place?: string, point?: GeoPoint): string | undefined {
  if (place && place.trim() !== "") {
    const token = place.split(",").map((value) => value.trim()).filter(Boolean).at(-1);
    const stateCode = tryNormalizeStateCode(token);
    if (stateCode) {
      return stateCode;
    }

    if (point && isWithinUnitedStates(point)) {
      for (const value of place.split(/[,\-;/()]/).map((part) => part.trim()).filter(Boolean)) {
        const normalized = tryNormalizeStateCode(value);
        if (normalized) {
          return normalized;
        }
      }

      for (const [stateName, resolvedStateCode] of Object.entries(usStateNames).sort((left, right) => right[0].length - left[0].length)) {
        if (place.toUpperCase().includes(stateName.toUpperCase())) {
          return resolvedStateCode;
        }
      }
    }
  }

  if (!point) {
    return undefined;
  }

  if (isWithin(point, 13.1, 13.8, 144.4, 145.1)) return "GU";
  if (isWithin(point, 17.8, 18.6, -67.3, -65.2)) return "PR";
  if (isWithin(point, 17.5, 18.5, -65.2, -64.3)) return "VI";
  if (isWithin(point, -14.5, -10.9, -171.1, -168.0)) return "AS";
  if (isWithin(point, 18.86546, 22.2356, -160.2471, -154.806773)) return "HI";
  if (isWithin(point, 51.214183, 71.365162, -179.148909, -129.9795)) return "AK";
  return undefined;
}

function tryNormalizeStateCode(rawValue?: string): string | undefined {
  if (!rawValue || rawValue.trim() === "") {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase();
    if (usStateCodes.has(upper)) {
      return upper;
    }
  }

  return usStateNames[trimmed];
}

function isWithin(point: GeoPoint, minLatitude: number, maxLatitude: number, minLongitude: number, maxLongitude: number): boolean {
  return (
    point.latitude >= minLatitude &&
    point.latitude <= maxLatitude &&
    point.longitude >= minLongitude &&
    point.longitude <= maxLongitude
  );
}
