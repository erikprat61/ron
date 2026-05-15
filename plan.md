# Ron Bun Replacement Plan

## Current state

- The original repository has been moved to `../ron_old`.
- The new replacement repository is `./`.
- The replacement target is a Bun + TypeScript implementation that fully replaces the old .NET API and its demo UI behavior.

## Goal

Rebuild **ron** as a Bun-based application that preserves the current product contract:

- normalized multi-source disaster aggregation
- ZIP-code impact lookup
- resource-impact analysis
- per-source health reporting
- root and health endpoints
- a browser demo UI that talks to the API over HTTP

The Bun version should be a **behavioral replacement**, not just a route stub.

## Source of truth for the rewrite

Use `../ron_old` as the migration source. The most important files are:

### Product and architecture docs

- `../ron_old/README.md`
- `../ron_old/architecture.md`

### HTTP contract

- `../ron_old/src/DisasterTracker.Api/Program.cs`
- `../ron_old/src/DisasterTracker.Api/Endpoints/ApiEndpointMappings.cs`

### Domain and response models

- `../ron_old/src/DisasterTracker.Api/Domain/DisasterModels.cs`
- `../ron_old/src/DisasterTracker.Api/Domain/OperationalModels.cs`

### Runtime behavior

- `../ron_old/src/DisasterTracker.Api/Services/DisasterCatalogService.cs`
- `../ron_old/src/DisasterTracker.Api/Services/DisasterEventMatcher.cs`
- `../ron_old/src/DisasterTracker.Api/Services/ZipCodeContextResolver.cs`
- `../ron_old/src/DisasterTracker.Api/Services/ResourceImpactAnalyzer.cs`
- `../ron_old/src/DisasterTracker.Api/Services/DisasterRefreshWorker.cs`
- `../ron_old/src/DisasterTracker.Api/Services/DisasterSourceHealthCheck.cs`

### Source adapters

- `../ron_old/src/DisasterTracker.Api/Sources/NationalWeatherServiceSource.cs`
- `../ron_old/src/DisasterTracker.Api/Sources/FemaDisasterSource.cs`
- `../ron_old/src/DisasterTracker.Api/Sources/UsgsDisasterSource.cs`
- `../ron_old/src/DisasterTracker.Api/Sources/EonetDisasterSource.cs`
- `../ron_old/src/DisasterTracker.Api/Sources/DisasterSourceContracts.cs`

### Shared helpers and static data

- `../ron_old/src/DisasterTracker.Api/Support/GeoMath.cs`
- `../ron_old/src/DisasterTracker.Api/Support/GeoJsonGeometryParser.cs`
- `../ron_old/src/DisasterTracker.Api/Support/DisasterDataHelpers.cs`
- `../ron_old/src/DisasterTracker.Api/Support/JsonElementExtensions.cs`
- `../ron_old/src/DisasterTracker.Api/Support/HttpClientJsonExtensions.cs`
- `../ron_old/src/DisasterTracker.Api/Support/UsRegionCatalog.cs`
- `../ron_old/src/DisasterTracker.Api/Data/strategic-resource-profiles.json`

### UI and local dev workflow

- `../ron_old/ui/disaster-tracker-demo/index.html`
- `../ron_old/ui/disaster-tracker-demo/app.js`
- `../ron_old/ui/disaster-tracker-demo/styles.css`
- `../ron_old/run-local.sh`
- `../ron_old/run-local.cmd`

### Tests to port

- `../ron_old/tests/DisasterTracker.Api.Tests/DisasterCatalogServiceTests.cs`
- `../ron_old/tests/DisasterTracker.Api.Tests/DisasterEventMatcherTests.cs`
- `../ron_old/tests/DisasterTracker.Api.Tests/NationalWeatherServiceSourceTests.cs`
- `../ron_old/tests/DisasterTracker.Api.Tests/FemaDisasterSourceTests.cs`
- `../ron_old/tests/DisasterTracker.Api.Tests/UsgsDisasterSourceTests.cs`
- `../ron_old/tests/DisasterTracker.Api.Tests/EonetDisasterSourceTests.cs`
- `../ron_old/tests/DisasterTracker.Api.Tests/ResourceImpactAnalyzerTests.cs`
- `../ron_old/tests/DisasterTracker.Api.Tests/ZipCodeContextResolverTests.cs`

## Chosen Bun stack

Use the following stack unless a later requirement forces a change:

- **Runtime:** Bun
- **Language:** TypeScript
- **HTTP framework:** Hono running on Bun
- **Validation and config parsing:** Zod
- **Tests:** `bun:test`
- **Build/run:** Bun scripts only
- **State/cache:** in-memory `Map` objects plus refresh locks implemented in TypeScript

### Why this stack

- Bun provides the runtime target the rewrite requires.
- Hono gives route grouping, middleware, and clean request/response handling without turning the app into a heavy framework migration.
- Zod gives explicit runtime validation for query parameters, environment variables, and external payload normalization boundaries.
- `bun:test` keeps the new repo aligned with the Bun ecosystem instead of reintroducing a second test runner.

## Target repository structure

The new repo should eventually look like this:

```text
ron/
  package.json
  bunfig.toml
  tsconfig.json
  .gitignore
  README.md
  plan.md
  src/
    server.ts
    app.ts
    config/
      env.ts
      options.ts
    domain/
      disaster-models.ts
      operational-models.ts
    routes/
      root-routes.ts
      disaster-routes.ts
      impact-routes.ts
      source-routes.ts
      openapi.ts
    services/
      disaster-catalog-service.ts
      disaster-refresh-worker.ts
      disaster-event-matcher.ts
      zip-code-context-resolver.ts
      resource-impact-analyzer.ts
      source-health-service.ts
    sources/
      source-contracts.ts
      national-weather-service-source.ts
      fema-disaster-source.ts
      usgs-disaster-source.ts
      eonet-disaster-source.ts
    support/
      geo-math.ts
      geojson-geometry-parser.ts
      disaster-data-helpers.ts
      http-json.ts
      us-region-catalog.ts
      problem-details.ts
      json.ts
    data/
      strategic-resource-profiles.json
  ui/
    disaster-tracker-demo/
      index.html
      app.js
      styles.css
  tests/
    disaster-catalog-service.test.ts
    disaster-event-matcher.test.ts
    national-weather-service-source.test.ts
    fema-disaster-source.test.ts
    usgs-disaster-source.test.ts
    eonet-disaster-source.test.ts
    resource-impact-analyzer.test.ts
    zip-code-context-resolver.test.ts
    fixtures/
  scripts/
    run-local.ts
```

## Route contract to preserve

### Root and operational routes

- `GET /`
- `GET /health`
- `GET /openapi/v1.json` in development

### API routes

- `GET /api/disasters/active`
- `GET /api/disasters/zip/:zipCode`
- `GET /api/disasters/:id`
- `GET /api/impacts/resources`
- `GET /api/sources/health`

## Response behavior to preserve

### JSON conventions

- property names must be camelCase
- null fields should be omitted when practical
- enums should serialize to lowercase or lower-camel strings compatible with the current UI

### `GET /`

Return a JSON payload equivalent to the current root response:

- `service`
- `version`
- `health`
- `activeDisasters`
- `zipLookup`
- `openApi` in development, otherwise omitted or null-equivalent

### `GET /health`

Return a simple overall service health response that remains usable for uptime checks.

### `GET /api/disasters/active`

Support query parameters:

- `source`
- `category`
- `severity`
- `state`
- `status`
- `limit`

Behavior to preserve:

- if `status` is omitted, exclude resolved records
- sort by active status first, then severity descending, then `startedAt` descending
- cap `limit` at 250

Response shape:

- `generatedAt`
- `items`
- derived `count`

### `GET /api/disasters/zip/:zipCode`

Support query parameter:

- `source`

Behavior to preserve:

- normalize ZIP input to first 5 digits
- return a validation error for missing or too-short ZIP codes
- return 404 when the ZIP lookup provider reports not found
- resolve ZIP centroid, NWS point metadata, and optional ZIP boundary geometry
- filter events by source when requested
- match events using the same source-specific rules as the .NET implementation

Response shape:

- `generatedAt`
- `location`
- `matches`
- derived `isImpacted`

### `GET /api/disasters/:id`

Behavior to preserve:

- read from the current snapshot
- return 404 problem details when no matching event exists

### `GET /api/impacts/resources`

Support query parameters:

- `state`
- `resource`
- `minimumConfidence`

Behavior to preserve:

- filter on state code
- filter by partial resource or region match
- filter by minimum confidence

Response shape:

- `generatedAt`
- `items`
- derived `count`

### `GET /api/sources/health`

Response shape:

- `generatedAt`
- `items`

Each item must include:

- `source`
- `status`
- `lastAttemptedRefreshUtc`
- `lastSuccessfulRefreshUtc`
- `eventCount`
- `errorMessage`

## Core domain model to preserve

### Enums

Preserve semantic equivalents for:

- `DisasterSourceKind`: `nws`, `fema`, `usgs`, `eonet`
- `DisasterCategory`: `weather`, `fire`, `flood`, `storm`, `hurricane`, `earthquake`, `drought`, `other`
- `DisasterSeverity`: `unknown`, `minor`, `moderate`, `severe`, `extreme`
- `DisasterStatus`: `active`, `monitoring`, `resolved`
- `EndTimeConfidence`: `none`, `low`, `medium`, `high`
- `SourceHealthStatus`: `healthy`, `degraded`, `unhealthy`
- `MatchConfidence`: `low`, `medium`, `high`
- `DisasterMatchKind`: `boundary`, `zone`, `county`, `radius`
- `ImpactConfidence`: `low`, `medium`, `high`

### `DisasterEvent`

The TypeScript model must preserve these fields:

- `id`
- `source`
- `sourceEventId`
- `title`
- `category`
- `severity`
- `status`
- `startedAt`
- `endedAt`
- `expectedEndAt`
- `endTimeConfidence`
- `endTimeExplanation`
- `summary`
- `description`
- `instruction`
- `sourceUrl`
- `areaDescription`
- `stateCodes`
- `countyFipsCodes`
- `zoneIds`
- `centroid`
- `radiusKm`
- `footprintPolygons`
- `magnitude`
- `magnitudeUnit`
- `impactedResources`

### Other preserved models

- `GeoPoint`
- `GeoPolygon`
- `GeoBoundingBox`
- `DisasterSnapshot`
- `ZipCodeLocation`
- `ZipCodeImpactMatch`
- `ResourceImpactSignal`
- `StrategicResourceProfile`
- `DisasterSearchQuery`
- `ZipImpactQuery`
- `ResourceImpactQuery`
- `DisasterSearchResponse`
- `ZipImpactResponse`
- `ResourceImpactResponse`
- `SourceHealthResponse`

## External providers to preserve

### National Weather Service

- Base URL: `https://api.weather.gov`
- Accept header: `application/geo+json`
- Must send a descriptive real `User-Agent`
- Purpose: active U.S. alert coverage, zones, county references, polygons when available

### FEMA

- Base URL: `https://www.fema.gov/api/open/v2/`
- Accept header: `application/json`
- Purpose: declaration-based disaster records

### USGS

- Base URL: `https://earthquake.usgs.gov/`
- Accept header: `application/json`
- Purpose: recent earthquake monitoring events

### EONET

- Base URL: `https://eonet.gsfc.nasa.gov/api/v3/`
- Accept header: `application/json`
- Purpose: global natural-event coverage

### ZIP centroid lookup

- Base URL: `https://api.zippopotam.us/`
- Purpose: ZIP city/state/lat/lon resolution

### NWS points lookup

- Uses `api.weather.gov/points/{lat},{lon}`
- Purpose: forecast zone, fire weather zone, county, SAME code context

### Census ZIP boundary lookup

- Base URL: `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/`
- Purpose: optional ZIP polygon geometry

## Configuration to preserve

Create a typed config layer matching the old options shape:

### `DisasterRefresh`

- `cacheDuration`
- `backgroundRefreshInterval`
- `warmCacheOnStartup`
- `maxHealthyStaleness`

### `NationalWeatherService`

- `enabled`
- `baseUrl`
- `userAgent`
- `timeoutSeconds`

### `Fema`

- `enabled`
- `baseUrl`
- `timeoutSeconds`
- `activeWindowDays`
- `maxRecords`

### `Usgs`

- `enabled`
- `baseUrl`
- `timeoutSeconds`
- `minimumMagnitude`
- `minimumSignificance`

### `Eonet`

- `enabled`
- `baseUrl`
- `timeoutSeconds`
- `maxRecords`

### `ZipCodeLookup`

- `baseUrl`
- `timeoutSeconds`
- `cacheDuration`

### `ZipBoundary`

- `enabled`
- `baseUrl`
- `timeoutSeconds`

### `DemoUi`

- `allowedOrigins`

### `SupplyImpact`

- `resourceProfilePath`

## Service behavior to preserve

### Disaster catalog service

The Bun port must replicate the current orchestration behavior:

1. fetch all enabled sources
2. aggregate and sort normalized events
3. compute resource impacts from the active snapshot
4. attach resource impacts back onto matching events
5. build source health records
6. cache the whole snapshot in memory
7. serialize refreshes so concurrent requests do not stampede providers

### Stale-on-error source behavior

Preserve the existing degraded-mode behavior:

- if a source refresh fails but cached source data is still within `maxHealthyStaleness`, serve stale events
- mark that source `degraded`
- include an explanatory error message
- if no usable cached data exists, emit zero events for that source and mark it `unhealthy`

### Background refresh worker

Implement a Bun scheduler using `setInterval`:

- optionally warm on startup
- refresh on the configured interval
- avoid overlapping refresh execution

### ZIP code context resolver

Preserve these steps:

1. normalize ZIP input
2. load ZIP place data from Zippopotam.us
3. load NWS point metadata from the ZIP centroid
4. load Census ZIP boundary polygons when enabled
5. degrade gracefully to centroid-only matching if boundary lookup fails
6. cache ZIP context results independently from disaster snapshots

### Event matcher rules

Preserve the current matching precedence:

#### NWS

1. boundary intersection with published alert geometry
2. NWS zone intersection
3. county FIPS match

#### FEMA

1. state match
2. county FIPS match

#### USGS and EONET

1. boundary intersection with published polygon geometry when present
2. radius-to-ZIP-boundary intersection when boundary geometry exists
3. centroid distance against event radius

Preserve confidence grading and explanatory reason strings at the same fidelity level as the current app.

### Resource impact analyzer

Preserve rule-based explainable signals:

- load `strategic-resource-profiles.json`
- match by state codes
- match by county FIPS codes
- match by bounding boxes
- match by location keywords in event text
- enforce category filters
- enforce minimum severity
- enforce minimum magnitude when configured

## Shared helper behavior to port

Port or faithfully reimplement the old support utilities:

- GeoJSON polygon parsing
- Haversine distance
- point-in-polygon checks
- polygon intersection checks
- circle-to-polygon intersection checks
- identifier normalization
- county FIPS extraction
- safe external JSON fetch helpers

## Planned file mapping from .NET to Bun

| Old file | New file |
| --- | --- |
| `Program.cs` | `src/server.ts` and `src/app.ts` |
| `Endpoints/ApiEndpointMappings.cs` | `src/routes/*.ts` |
| `Configuration/ServiceOptions.cs` | `src/config/options.ts` |
| `Domain/DisasterModels.cs` | `src/domain/disaster-models.ts` |
| `Domain/OperationalModels.cs` | `src/domain/operational-models.ts` |
| `Services/DisasterCatalogService.cs` | `src/services/disaster-catalog-service.ts` |
| `Services/DisasterRefreshWorker.cs` | `src/services/disaster-refresh-worker.ts` |
| `Services/DisasterEventMatcher.cs` | `src/services/disaster-event-matcher.ts` |
| `Services/ZipCodeContextResolver.cs` | `src/services/zip-code-context-resolver.ts` |
| `Services/ResourceImpactAnalyzer.cs` | `src/services/resource-impact-analyzer.ts` |
| `Sources/*.cs` | `src/sources/*.ts` |
| `Support/*.cs` | `src/support/*.ts` |
| `Data/strategic-resource-profiles.json` | `src/data/strategic-resource-profiles.json` |
| `ui/disaster-tracker-demo/*` | `ui/disaster-tracker-demo/*` |
| `tests/*.cs` | `tests/*.test.ts` |

## Implementation phases

### Phase 1: Scaffold the Bun repo

Create:

- Bun project metadata
- TypeScript config
- runtime config loader
- base app and server bootstrapping
- root route and health route

### Phase 2: Port domain and config

Create:

- TypeScript enums and interfaces
- response serializers
- query parsing and validation
- environment/config defaults mirroring the old app

### Phase 3: Port support helpers

Create:

- geometry math
- GeoJSON parsers
- identifier helpers
- fetch wrappers
- problem-details helpers

### Phase 4: Port source adapters

Implement and test:

- NWS adapter
- FEMA adapter
- USGS adapter
- EONET adapter

Each source must normalize into the shared `DisasterEvent` model.

### Phase 5: Port services

Implement and test:

- disaster catalog service
- ZIP context resolver
- event matcher
- resource impact analyzer
- background refresh worker

### Phase 6: Port API routes

Implement:

- endpoint handlers
- filtering/sorting behavior
- error responses
- dev-only OpenAPI output

### Phase 7: Port the demo UI

Preserve the current UI behavior:

- configurable API base URL
- overview cards
- active disasters filtering
- event detail panel
- ZIP impact lookup
- source health view
- resource impact filters

The UI may remain static HTML/CSS/JS initially, but it should be served by Bun-oriented local tooling instead of the old Python helper.

### Phase 8: Port and expand tests

Port the existing .NET tests into `bun:test` equivalents and add parity tests for:

- route responses
- JSON shapes
- error conditions
- cache reuse and stale-source fallback

### Phase 9: Cutover and cleanup

- update `README.md`
- add Bun-based local run scripts
- document environment variables
- confirm no runtime dependency remains on .NET

## Acceptance criteria for the full rewrite

The Bun rewrite is complete when all of the following are true:

1. every public endpoint from the old API is present in Bun
2. the static demo UI works against the Bun API
3. source normalization behavior is covered by automated tests
4. ZIP matching behavior is covered by automated tests
5. resource impact behavior is covered by automated tests
6. degraded stale-source behavior is preserved
7. local development uses Bun-native commands instead of .NET
8. the repo no longer depends on the old `ron_old` directory at runtime

## Important migration risks

### Geometry parity

Polygon parsing and intersection logic are the highest-risk functional area. Port the related helpers first and lock them down with tests before relying on ZIP impact parity.

### Enum serialization drift

If enums serialize differently from the old API, the existing demo UI and filter flow will break. Make JSON string output explicit rather than relying on defaults.

### Provider payload assumptions

The old source adapters likely encode provider-specific quirks. Port tests alongside each adapter so the Bun rewrite does not silently change normalization behavior.

### Background refresh races

The .NET app uses a refresh lock. The Bun port must guard against overlapping refreshes and partial cache replacement.

### ZIP boundary degradation behavior

Boundary lookup failures are intentionally non-fatal. Preserve centroid-only fallback rather than turning them into request failures.

## Recommended implementation order

Follow this exact order:

1. scaffold repo and core Bun app
2. port domain models and serialization rules
3. port support helpers and geometry utilities
4. port source adapters with tests
5. port catalog, ZIP, matcher, and impact services
6. port API handlers
7. port demo UI and Bun local run workflow
8. finish parity and integration tests
9. update docs and remove old assumptions

## Definition of done for this repo bootstrap phase

For the current step, the new `ron` repo intentionally contains **only** this `plan.md`. Implementation starts after this plan is accepted as the migration blueprint.
