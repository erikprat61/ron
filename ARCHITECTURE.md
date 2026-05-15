# Ron Architecture

Ron is a Bun workspace monorepo where apps are thin entrypoints, provider integrations live in `packages/api-*`, and `packages/service-*` compose them into domain workflows.

## System overview

The repository is organized around clear dependency layers:

1. **Apps** expose HTTP and UI entrypoints.
2. **Service packages** implement domain workflows.
3. **Provider packages** talk to external APIs.
4. **Shared packages** provide contracts, transport, and geo helpers.

The intended dependency direction is one-way: apps depend on services, services depend on provider clients and shared utilities, and provider clients depend on shared transport only.

## Workspace shape

```text
apps/
  api/
    src/
      app.ts
      config.ts
      server.ts
  demo-ui/
    src/
      app.js
      index.html
      server.ts

packages/
  contract/                   shared domain types, query schemas, config defaults
  geo/                        geometry, polygon intersection, radius helpers
  http/                       JSON HTTP client, shared HTTP errors, health monitor

  api-weather-gov/            Weather.gov alerts client
  api-openfema/               FEMA declarations client
  api-usgs/                   USGS earthquakes client
  api-eonet/                  NASA EONET client
  api-zippopotam/             ZIP centroid lookup client
  api-nws-points/             NWS points metadata client
  api-census-tigerweb/        Census ZIP boundary client

  service-disaster-catalog/   cross-source event aggregation and snapshot caching
  service-zip-context/        ZIP resolution and event matching
  service-resource-impact/    strategic resource impact analysis
  service-source-health/      source health projection for API responses
```

## Core packages

| Package | Responsibility |
| --- | --- |
| `packages/contract` | Shared Ron domain types, Zod query schemas, confidence/severity rankings, and default configuration. |
| `packages/http` | Shared `JsonHttpClient`, `HttpError` types, and `UpstreamHealthMonitor`. |
| `packages/geo` | Polygon parsing, polygon intersection, radius matching, and distance calculations used by ZIP and impact logic. |
| `packages/api-*` | One package per external provider, each responsible for fetching provider-native data. |
| `packages/service-disaster-catalog` | Refreshes provider data, normalizes events, caches snapshots, and computes resource impacts. |
| `packages/service-zip-context` | Resolves ZIP metadata and matches normalized events against ZIP geography and zones. |
| `packages/service-resource-impact` | Loads resource profiles and derives explainable impact signals from active events. |
| `packages/service-source-health` | Merges catalog source health with ancillary ZIP-resolution source health. |

## App composition

`apps/api/src/server.ts` is the main composition root. It:

1. Loads configuration from environment-aware defaults.
2. Creates provider clients for Weather.gov, FEMA, USGS, EONET, Zippopotam, NWS points, and TigerWeb.
3. Creates shared helpers like `UpstreamHealthMonitor` and `ResourceImpactService`.
4. Wires those dependencies into `DisasterCatalogService`, `ZipContextService`, and `SourceHealthService`.
5. Passes the assembled services into the Hono app in `apps/api/src/app.ts`.

The API app stays intentionally thin: it validates query parameters, calls services, filters already-normalized results, and returns JSON or Problem Details responses.

## HTTP API surface

The Hono app exposes normalized Ron domain data only. Provider-native payloads do not cross the HTTP boundary.

| Route | Responsibility |
| --- | --- |
| `GET /` | Service index and route discovery. |
| `GET /health` | API readiness based on disaster snapshot source health. |
| `GET /openapi.json` | Generated OpenAPI document for the Ron API contract. |
| `POST /internal/refresh` | Protected cache-warm trigger for GitHub deploys and Cloud Scheduler. |
| `GET /sources/health` | Health for primary disaster feeds plus ancillary ZIP-resolution providers. |
| `GET /snapshot` | Raw aggregated Ron snapshot. |
| `GET /disasters` | Filtered disaster search over the cached snapshot. |
| `GET /disasters/:id` | Single disaster lookup by normalized event ID. |
| `GET /zip-codes/:zip/impact` | ZIP resolution plus event matching. |
| `GET /resource-impacts` | Filtered view of resource impact signals. |

## Runtime request and data flow

### Disaster catalog flow

`service-disaster-catalog` is the central aggregation service.

1. `getSnapshot()` returns a cached snapshot when it is still fresh.
2. If the cache is stale, `buildSnapshot()` refreshes NWS, FEMA, USGS, and EONET in parallel.
3. Provider-native payloads are normalized into shared `DisasterEvent` records.
4. Events are sorted and enriched with resource impact signals from `service-resource-impact`.
5. Per-source health is included in the resulting `DisasterSnapshot`.

The service also keeps per-source cached data. If a refresh fails but a recent successful payload exists inside `maxHealthyStalenessMs`, Ron serves stale data and marks that source as `degraded` instead of dropping it immediately.

### ZIP impact flow

`service-zip-context` resolves location context and then matches events against it.

1. Normalize the requested ZIP code.
2. Resolve centroid and city/state from Zippopotam.
3. Resolve NWS points metadata for forecast, fire weather, and county zones.
4. Optionally resolve Census ZIP boundary polygons.
5. Match normalized events in this order:
   - published event footprint intersects ZIP boundary
   - NWS zone overlap
   - county FIPS overlap
   - centroid/radius overlap for radius-based events

This layered strategy keeps ZIP lookups useful even when source geometry quality differs between providers.

### Resource impact flow

`service-resource-impact` loads strategic resource profiles from JSON and scores active events against:

- disaster category
- minimum severity
- optional minimum magnitude
- state and county targeting
- bounding-box overlap
- location keyword matches

The service emits `low`, `medium`, or `high` confidence `ResourceImpactSignal` records with explanations and matched event IDs.

### Source health flow

`service-source-health` combines two health streams:

- disaster-feed health from `service-disaster-catalog`
- ancillary ZIP-resolution health from `UpstreamHealthMonitor`

That gives the API a single health projection across all seven upstream integrations.

## External providers

Ron currently integrates with:

- `api.weather.gov` for weather alerts
- `www.fema.gov/api/open/v2` for FEMA declarations
- `earthquake.usgs.gov` for earthquake activity
- `eonet.gsfc.nasa.gov/api/v3` for broader natural event coverage
- `api.zippopotam.us` for ZIP centroid lookup
- `api.weather.gov/points` for zone and county metadata
- `tigerweb.geo.census.gov` for ZIP boundary geometry

## Configuration model

`packages/contract` defines the default `RonConfig`. `apps/api/src/config.ts` layers environment overrides on top of those defaults.

Important configuration areas include:

- `environmentName`
- `disasterRefresh`
- `nationalWeatherService`
- `fema`
- `usgs`
- `eonet`
- `zipCodeLookup`
- `zipBoundary`
- `demoUi`
- `refreshTrigger`
- `redis`
- `database`
- `supplyImpact`

The runtime override surface now includes deployment-focused values such as `RON_ENVIRONMENT`, `RON_PUBLIC_API_BASE_URL`, `RON_DEMO_UI_ALLOWED_ORIGINS`, refresh-trigger OIDC allowlists, and reserved Redis/database settings in addition to the existing port and profile overrides.

For Google-signed refresh tokens, the allowlist may need both service-account emails and Google numeric subject identifiers because Cloud Scheduler and workflow-minted ID tokens do not always present the same principal field.

## Design rules

1. **One provider, one package.** External APIs stay isolated behind dedicated `api-*` packages.
2. **Normalize in services, not clients.** Provider packages expose provider-native data; service packages map those shapes into Ron contracts.
3. **No provider logic in routes.** The API app talks to services only.
4. **Shared transport belongs in `packages/http`.** HTTP errors, timeouts, and health tracking stay consistent across providers.
5. **Shared geo logic belongs in `packages/geo`.** Matching behavior should stay reusable and testable outside the app layer.

## Caching and resilience

- `service-disaster-catalog` caches the aggregated snapshot and per-source payloads.
- `apps/api/src/server.ts` can warm the cache on startup when explicitly enabled.
- A background interval refreshes the catalog only when local-development refresh mode is enabled.
- `POST /internal/refresh` lets Cloud Scheduler and deployment workflows warm the cache explicitly with Google OIDC tokens.
- `service-zip-context` caches resolved ZIP metadata in memory.
- If provider refreshes fail, recent source payloads can be served as degraded stale data.
- `UpstreamHealthMonitor` records success, degraded, and unhealthy states for ancillary dependencies.

`GET /health` is intentionally process-local so Cloud Run probes do not trigger upstream refresh work. Upstream feed status remains available from `GET /sources/health`.

## Testing shape

Testing is package-first:

- package-level unit tests live beside implementation code
- shared packages can be tested without network access
- service tests verify normalization, matching, and impact logic across package boundaries
- root-level integration tests can exercise the workspace as a composed system

## Related docs

- `README.md` for setup and feature overview
