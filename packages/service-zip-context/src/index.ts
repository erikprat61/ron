import type {
  DisasterEvent,
  DisasterSourceKind,
  MatchConfidence,
  RonConfig,
  ZipCodeImpactMatch,
  ZipCodeLocation
} from "@ron/contract";
import { circleIntersectsPolygons, haversineDistanceKm, intersects, parseGeoJsonPolygons } from "@ron/geo";
import { NotFoundError, UpstreamHealthMonitor } from "@ron/http";
import type { NwsPointsClient } from "@ron/api-nws-points";
import type { TigerWebClient } from "@ron/api-census-tigerweb";
import type { ZippopotamClient } from "@ron/api-zippopotam";

export interface ZipContextServiceDependencies {
  config: RonConfig;
  zippopotamClient: ZippopotamClient;
  nwsPointsClient: NwsPointsClient;
  tigerWebClient: TigerWebClient;
  healthMonitor: UpstreamHealthMonitor;
}

type CachedZipContext = {
  expiresAt: number;
  location: ZipCodeLocation;
};

export class ZipContextService {
  private readonly cache = new Map<string, CachedZipContext>();

  constructor(private readonly dependencies: ZipContextServiceDependencies) {}

  async resolve(zipCode: string): Promise<ZipCodeLocation> {
    const normalizedZipCode = normalizeZipCode(zipCode);
    const cached = this.cache.get(normalizedZipCode);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.location;
    }

    const zipLookup = await this.dependencies.zippopotamClient.getZip(normalizedZipCode).catch((error) => {
      this.dependencies.healthMonitor.recordFailure("zippopotam", error);
      throw error;
    });
    this.dependencies.healthMonitor.recordSuccess("zippopotam", 1);

    const primaryPlace = zipLookup.places?.[0];
    if (!primaryPlace) {
      throw new NotFoundError(`ZIP code '${normalizedZipCode}' was not found.`, normalizedZipCode);
    }

    const latitude = Number(primaryPlace.latitude);
    const longitude = Number(primaryPlace.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new Error(`ZIP lookup response for '${normalizedZipCode}' did not contain valid coordinates.`);
    }

    const [points, boundaryPolygons] = await Promise.all([
      this.dependencies.nwsPointsClient.getPoint(latitude, longitude).catch((error) => {
        this.dependencies.healthMonitor.recordFailure("nws-points", error);
        throw error;
      }),
      this.loadBoundaryPolygons(normalizedZipCode)
    ]);
    this.dependencies.healthMonitor.recordSuccess("nws-points", 1);

    const properties = points.properties ?? {};
    const forecastZoneId = extractTrailingSegment(readString(properties.forecastZone));
    const fireWeatherZoneId = extractTrailingSegment(readString(properties.fireWeatherZone));
    const countyZoneId = extractTrailingSegment(readString(properties.county));
    const sameCode =
      properties.nwr && typeof properties.nwr === "object"
        ? readString((properties.nwr as Record<string, unknown>).sameCode)
        : undefined;

    const location: ZipCodeLocation = {
      zipCode: normalizedZipCode,
      city: readString(primaryPlace["place name"]) ?? "Unknown",
      stateCode: (readString(primaryPlace["state abbreviation"]) ?? "").toUpperCase(),
      countyZoneId,
      forecastZoneId,
      fireWeatherZoneId,
      countyFipsCode: countyZoneId ? extractCountyFipsFromZoneId(countyZoneId) : undefined,
      sameCode,
      zoneIds: normalizeIdentifiers([forecastZoneId, fireWeatherZoneId, countyZoneId]),
      centroid: {
        latitude,
        longitude
      },
      boundaryPolygons
    };

    this.cache.set(normalizedZipCode, {
      expiresAt: Date.now() + this.dependencies.config.zipCodeLookup.cacheDurationMs,
      location
    });

    return location;
  }

  match(location: ZipCodeLocation, events: DisasterEvent[], source?: DisasterSourceKind): ZipCodeImpactMatch[] {
    const filteredEvents = source ? events.filter((event) => event.source === source) : events;

    return filteredEvents
      .map((event) => matchEvent(location, event))
      .filter((match): match is ZipCodeImpactMatch => match !== undefined)
      .sort((left, right) => {
        const confidence = confidenceRank[right.confidence] - confidenceRank[left.confidence];
        if (confidence !== 0) {
          return confidence;
        }

        const severity = severityRank(right.event?.severity) - severityRank(left.event?.severity);
        if (severity !== 0) {
          return severity;
        }

        return Date.parse(right.event?.startedAt ?? "") - Date.parse(left.event?.startedAt ?? "");
      });
  }

  private async loadBoundaryPolygons(zipCode: string) {
    if (!this.dependencies.config.zipBoundary.enabled) {
      return [];
    }

    try {
      const response = await this.dependencies.tigerWebClient.getZipBoundary(zipCode);
      const geometry = response.features?.[0]?.geometry;
      const polygons = parseGeoJsonPolygons(geometry);
      this.dependencies.healthMonitor.recordSuccess("tigerweb", polygons.length);
      return polygons;
    } catch (error) {
      this.dependencies.healthMonitor.recordDegraded("tigerweb", error, 0);
      return [];
    }
  }
}

const confidenceRank: Record<MatchConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

function severityRank(severity?: DisasterEvent["severity"]): number {
  return severity === "extreme" ? 4 : severity === "severe" ? 3 : severity === "moderate" ? 2 : severity === "minor" ? 1 : 0;
}

function matchEvent(location: ZipCodeLocation, event: DisasterEvent): ZipCodeImpactMatch | undefined {
  switch (event.source) {
    case "nws":
      return matchNwsEvent(location, event);
    case "fema":
      return matchFemaEvent(location, event);
    case "usgs":
      return matchRadiusEvent(location, event, "earthquake");
    case "eonet":
      return matchRadiusEvent(location, event, "EONET event");
    default:
      return undefined;
  }
}

function matchNwsEvent(location: ZipCodeLocation, event: DisasterEvent): ZipCodeImpactMatch | undefined {
  const boundaryMatch = matchPublishedBoundary(
    location,
    event,
    "The ZIP boundary intersects the National Weather Service alert geometry."
  );
  if (boundaryMatch) {
    return boundaryMatch;
  }

  const matchingZones = event.zoneIds.filter((zoneId) =>
    location.zoneIds.some((locationZoneId) => locationZoneId.toUpperCase() === zoneId.toUpperCase())
  );

  if (matchingZones.length > 0) {
    return {
      disasterId: event.id,
      title: event.title,
      event,
      matchKind: "zone",
      confidence: "high",
      reason: `The ZIP code belongs to NWS zone(s) ${matchingZones.join(", ")}, which this alert explicitly covers.`
    };
  }

  if (
    location.countyFipsCode &&
    event.countyFipsCodes.some((countyFipsCode) => countyFipsCode.toUpperCase() === location.countyFipsCode!.toUpperCase())
  ) {
    return {
      disasterId: event.id,
      title: event.title,
      event,
      matchKind: "county",
      confidence: "medium",
      reason: "The alert includes the same county FIPS code resolved from the ZIP code."
    };
  }

  return undefined;
}

function matchFemaEvent(location: ZipCodeLocation, event: DisasterEvent): ZipCodeImpactMatch | undefined {
  if (
    !event.stateCodes.some((stateCode) => stateCode.toUpperCase() === location.stateCode.toUpperCase()) ||
    !location.countyFipsCode
  ) {
    return undefined;
  }

  if (!event.countyFipsCodes.some((countyFipsCode) => countyFipsCode.toUpperCase() === location.countyFipsCode!.toUpperCase())) {
    return undefined;
  }

  return {
    disasterId: event.id,
    title: event.title,
    event,
    matchKind: "county",
    confidence: "medium",
    reason: "The FEMA declaration applies to the county resolved from the ZIP code."
  };
}

function matchRadiusEvent(location: ZipCodeLocation, event: DisasterEvent, eventTypeLabel: string): ZipCodeImpactMatch | undefined {
  const boundaryMatch = matchPublishedBoundary(
    location,
    event,
    `The ZIP boundary intersects the published ${eventTypeLabel} footprint.`
  );
  if (boundaryMatch) {
    return boundaryMatch;
  }

  if (!event.centroid || event.radiusKm === undefined) {
    return undefined;
  }

  const distance = haversineDistanceKm(location.centroid, event.centroid);
  const intersectsZipBoundary =
    location.boundaryPolygons.length > 0 &&
    circleIntersectsPolygons(event.centroid, event.radiusKm, location.boundaryPolygons);

  if (!intersectsZipBoundary && distance > event.radiusKm) {
    return undefined;
  }

  const confidence =
    intersectsZipBoundary || distance <= event.radiusKm / 3 ? "high" : distance <= event.radiusKm * 0.75 ? "medium" : "low";

  const reason = intersectsZipBoundary
    ? `The ${eventTypeLabel} footprint radius intersects the ZIP boundary, and the event centroid is ${distance.toFixed(1)} km away.`
    : `The ${eventTypeLabel} centroid is ${distance.toFixed(1)} km away and inside the ${event.radiusKm.toFixed(1)} km footprint radius used for ZIP lookups.`;

  return {
    disasterId: event.id,
    title: event.title,
    event,
    matchKind: "radius",
    confidence,
    reason,
    distanceKm: Math.round(distance * 10) / 10
  };
}

function matchPublishedBoundary(location: ZipCodeLocation, event: DisasterEvent, reason: string): ZipCodeImpactMatch | undefined {
  if (location.boundaryPolygons.length === 0 || event.footprintPolygons.length === 0) {
    return undefined;
  }

  if (!intersects(location.boundaryPolygons, event.footprintPolygons)) {
    return undefined;
  }

  return {
    disasterId: event.id,
    title: event.title,
    event,
    matchKind: "boundary",
    confidence: "high",
    reason,
    distanceKm: event.centroid ? Math.round(haversineDistanceKm(location.centroid, event.centroid) * 10) / 10 : undefined
  };
}

export function normalizeZipCode(rawZipCode: string): string {
  if (!rawZipCode || rawZipCode.trim() === "") {
    throw new Error("A ZIP code is required.");
  }

  const digits = rawZipCode.replace(/\D/g, "");
  if (digits.length < 5) {
    throw new Error("ZIP codes must contain at least five digits.");
  }

  return digits.slice(0, 5);
}

function normalizeIdentifiers(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim().toUpperCase()))];
}

function extractTrailingSegment(rawValue?: string): string | undefined {
  if (!rawValue || rawValue.trim() === "") {
    return undefined;
  }

  const trimmed = rawValue.trim().replace(/\/+$/, "");
  const separatorIndex = trimmed.lastIndexOf("/");
  const segment = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed;
  return segment.trim().toUpperCase();
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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
