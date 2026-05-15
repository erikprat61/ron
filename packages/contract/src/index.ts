import { z } from "zod";

export const disasterSourceKinds = ["nws", "fema", "usgs", "eonet"] as const;
export type DisasterSourceKind = (typeof disasterSourceKinds)[number];

export const upstreamSourceKinds = [
  "nws",
  "fema",
  "usgs",
  "eonet",
  "zippopotam",
  "nws-points",
  "tigerweb"
] as const;
export type UpstreamSourceKind = (typeof upstreamSourceKinds)[number];

export const disasterCategories = [
  "weather",
  "fire",
  "flood",
  "storm",
  "hurricane",
  "earthquake",
  "drought",
  "other"
] as const;
export type DisasterCategory = (typeof disasterCategories)[number];

export const disasterSeverities = ["unknown", "minor", "moderate", "severe", "extreme"] as const;
export type DisasterSeverity = (typeof disasterSeverities)[number];

export const disasterStatuses = ["active", "monitoring", "resolved"] as const;
export type DisasterStatus = (typeof disasterStatuses)[number];

export const endTimeConfidences = ["none", "low", "medium", "high"] as const;
export type EndTimeConfidence = (typeof endTimeConfidences)[number];

export const sourceHealthStatuses = ["healthy", "degraded", "unhealthy"] as const;
export type SourceHealthStatus = (typeof sourceHealthStatuses)[number];

export const matchConfidences = ["low", "medium", "high"] as const;
export type MatchConfidence = (typeof matchConfidences)[number];

export const disasterMatchKinds = ["boundary", "zone", "county", "radius"] as const;
export type DisasterMatchKind = (typeof disasterMatchKinds)[number];

export const impactConfidences = ["low", "medium", "high"] as const;
export type ImpactConfidence = (typeof impactConfidences)[number];

export const disasterSeverityRank: Record<DisasterSeverity, number> = {
  unknown: 0,
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4
};

export const disasterStatusRank: Record<DisasterStatus, number> = {
  active: 2,
  monitoring: 1,
  resolved: 0
};

export const matchConfidenceRank: Record<MatchConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

export const impactConfidenceRank: Record<ImpactConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeoPolygon {
  coordinates: GeoPoint[];
}

export interface GeoBoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export interface DisasterEvent {
  id: string;
  source: DisasterSourceKind;
  sourceEventId: string;
  title: string;
  category: DisasterCategory;
  severity: DisasterSeverity;
  status: DisasterStatus;
  startedAt: string;
  endedAt?: string;
  expectedEndAt?: string;
  endTimeConfidence: EndTimeConfidence;
  endTimeExplanation: string;
  summary: string;
  description?: string;
  instruction?: string;
  sourceUrl?: string;
  areaDescription?: string;
  stateCodes: string[];
  countyFipsCodes: string[];
  zoneIds: string[];
  centroid?: GeoPoint;
  radiusKm?: number;
  footprintPolygons: GeoPolygon[];
  magnitude?: number;
  magnitudeUnit?: string;
  impactedResources: ResourceImpactSignal[];
}

export interface SourceHealthSnapshot {
  source: UpstreamSourceKind;
  status: SourceHealthStatus;
  lastAttemptedRefreshUtc?: string;
  lastSuccessfulRefreshUtc?: string;
  eventCount: number;
  errorMessage?: string;
}

export interface DisasterSnapshot {
  generatedAt: string;
  events: DisasterEvent[];
  sourceHealth: SourceHealthSnapshot[];
  resourceImpacts: ResourceImpactSignal[];
}

export interface ZipCodeLocation {
  zipCode: string;
  city: string;
  stateCode: string;
  countyZoneId?: string;
  forecastZoneId?: string;
  fireWeatherZoneId?: string;
  countyFipsCode?: string;
  sameCode?: string;
  zoneIds: string[];
  centroid: GeoPoint;
  boundaryPolygons: GeoPolygon[];
}

export interface ZipCodeImpactMatch {
  disasterId: string;
  title: string;
  event?: DisasterEvent;
  matchKind: DisasterMatchKind;
  confidence: MatchConfidence;
  reason: string;
  distanceKm?: number;
}

export interface ResourceImpactSignal {
  profileId: string;
  resource: string;
  region: string;
  summary: string;
  explanation: string;
  reason: string;
  confidence: ImpactConfidence;
  matchedEventIds: string[];
  stateCodes: string[];
  countyFipsCodes: string[];
}

export interface StrategicResourceProfile {
  id: string;
  resource: string;
  region: string;
  summary: string;
  explanation: string;
  stateCodes: string[];
  countyFipsCodes: string[];
  locationBounds: GeoBoundingBox[];
  locationKeywords: string[];
  categories: DisasterCategory[];
  minimumSeverity: DisasterSeverity;
  minimumMagnitude?: number;
}

export interface DisasterSearchQuery {
  source?: DisasterSourceKind;
  category?: DisasterCategory;
  severity?: DisasterSeverity;
  state?: string;
  status?: DisasterStatus;
  limit?: number;
}

export interface ZipImpactQuery {
  source?: DisasterSourceKind;
}

export interface ResourceImpactQuery {
  state?: string;
  resource?: string;
  minimumConfidence?: ImpactConfidence;
}

export interface DisasterSearchResponse {
  generatedAt: string;
  count: number;
  items: DisasterEvent[];
}

export interface ZipImpactResponse {
  generatedAt: string;
  location: ZipCodeLocation;
  isImpacted: boolean;
  matches: ZipCodeImpactMatch[];
}

export interface ResourceImpactResponse {
  generatedAt: string;
  count: number;
  items: ResourceImpactSignal[];
}

export interface SourceHealthResponse {
  generatedAt: string;
  items: SourceHealthSnapshot[];
}

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

export interface DisasterRefreshConfig {
  cacheDurationMs: number;
  backgroundRefreshIntervalMs: number;
  backgroundRefreshEnabled: boolean;
  warmCacheOnStartup: boolean;
  maxHealthyStalenessMs: number;
}

export interface NationalWeatherServiceConfig {
  enabled: boolean;
  baseUrl: string;
  userAgent: string;
  timeoutMs: number;
}

export interface FemaConfig {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
  activeWindowDays: number;
  maxRecords: number;
}

export interface UsgsConfig {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
  minimumMagnitude: number;
  minimumSignificance: number;
}

export interface EonetConfig {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
  maxRecords: number;
}

export interface ZipCodeLookupConfig {
  baseUrl: string;
  timeoutMs: number;
  cacheDurationMs: number;
}

export interface ZipBoundaryConfig {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
}

export interface DemoUiConfig {
  allowedOrigins: string[];
  publicApiBaseUrl: string;
}

export interface RefreshTriggerConfig {
  authToken?: string;
}

export interface RedisConfig {
  enabled: boolean;
  url?: string;
  keyPrefix: string;
}

export interface DatabaseConfig {
  enabled: boolean;
  url?: string;
}

export interface SupplyImpactConfig {
  resourceProfilePath: string;
}

export interface RonConfig {
  environmentName: string;
  nodeEnv: string;
  port: number;
  uiPort: number;
  disasterRefresh: DisasterRefreshConfig;
  nationalWeatherService: NationalWeatherServiceConfig;
  fema: FemaConfig;
  usgs: UsgsConfig;
  eonet: EonetConfig;
  zipCodeLookup: ZipCodeLookupConfig;
  zipBoundary: ZipBoundaryConfig;
  demoUi: DemoUiConfig;
  refreshTrigger: RefreshTriggerConfig;
  redis: RedisConfig;
  database: DatabaseConfig;
  supplyImpact: SupplyImpactConfig;
}

export const defaultRonConfig: RonConfig = {
  environmentName: "development",
  nodeEnv: "development",
  port: 5096,
  uiPort: 4173,
  disasterRefresh: {
    cacheDurationMs: 10 * 60 * 1000,
    backgroundRefreshIntervalMs: 5 * 60 * 1000,
    backgroundRefreshEnabled: true,
    warmCacheOnStartup: true,
    maxHealthyStalenessMs: 30 * 60 * 1000
  },
  nationalWeatherService: {
    enabled: true,
    baseUrl: "https://api.weather.gov",
    userAgent: "Ron/1.0 (contact@example.com)",
    timeoutMs: 20_000
  },
  fema: {
    enabled: true,
    baseUrl: "https://www.fema.gov/api/open/v2/",
    timeoutMs: 20_000,
    activeWindowDays: 365,
    maxRecords: 250
  },
  usgs: {
    enabled: true,
    baseUrl: "https://earthquake.usgs.gov/",
    timeoutMs: 20_000,
    minimumMagnitude: 1.5,
    minimumSignificance: 50
  },
  eonet: {
    enabled: true,
    baseUrl: "https://eonet.gsfc.nasa.gov/api/v3/",
    timeoutMs: 20_000,
    maxRecords: 250
  },
  zipCodeLookup: {
    baseUrl: "https://api.zippopotam.us/",
    timeoutMs: 15_000,
    cacheDurationMs: 24 * 60 * 60 * 1000
  },
  zipBoundary: {
    enabled: true,
    baseUrl: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/",
    timeoutMs: 20_000
  },
  demoUi: {
    allowedOrigins: ["http://localhost:4173", "http://127.0.0.1:4173"],
    publicApiBaseUrl: "http://localhost:5096"
  },
  refreshTrigger: {},
  redis: {
    enabled: false,
    keyPrefix: "ron"
  },
  database: {
    enabled: false
  },
  supplyImpact: {
    resourceProfilePath: "packages/service-resource-impact/src/data/strategic-resource-profiles.json"
  }
};

export const disasterSearchQuerySchema = z.object({
  source: z.enum(disasterSourceKinds).optional(),
  category: z.enum(disasterCategories).optional(),
  severity: z.enum(disasterSeverities).optional(),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  status: z.enum(disasterStatuses).optional(),
  limit: z.coerce.number().int().positive().max(250).optional()
});

export const zipImpactQuerySchema = z.object({
  source: z.enum(disasterSourceKinds).optional()
});

export const resourceImpactQuerySchema = z.object({
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  resource: z.string().trim().min(1).optional(),
  minimumConfidence: z.enum(impactConfidences).optional()
});

export const jsonContentType = "application/json; charset=utf-8";

export function compareDisasterEvents(left: DisasterEvent, right: DisasterEvent): number {
  return (
    disasterStatusRank[right.status] - disasterStatusRank[left.status] ||
    disasterSeverityRank[right.severity] - disasterSeverityRank[left.severity] ||
    Date.parse(right.startedAt) - Date.parse(left.startedAt)
  );
}

export function cloneDisasterEvent(event: DisasterEvent): DisasterEvent {
  return {
    ...event,
    stateCodes: [...event.stateCodes],
    countyFipsCodes: [...event.countyFipsCodes],
    zoneIds: [...event.zoneIds],
    footprintPolygons: event.footprintPolygons.map((polygon) => ({
      coordinates: polygon.coordinates.map((point) => ({ ...point }))
    })),
    impactedResources: event.impactedResources.map((signal) => ({
      ...signal,
      matchedEventIds: [...signal.matchedEventIds],
      stateCodes: [...signal.stateCodes],
      countyFipsCodes: [...signal.countyFipsCodes]
    }))
  };
}

export function toProblemDetails(input: ProblemDetails): ProblemDetails {
  return input;
}
