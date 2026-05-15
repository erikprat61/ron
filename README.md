# Ron

Ron is a **Bun workspace** for U.S.-first disaster situational awareness. It combines:

- a Hono API in `apps/api`
- a standalone demo UI in `apps/demo-ui`
- shared contracts, geo helpers, HTTP utilities, provider clients, and domain services in `packages/`

## What Ron answers

- What active disasters are affecting a given ZIP code?
- Where are active or monitoring disasters happening right now?
- Which upstream sources are healthy, degraded, or failing?
- Which strategic resource regions may be affected by active events?

## Key capabilities

- Normalizes multiple public feeds into one Ron `DisasterEvent` contract.
- Aggregates active and monitoring events into a cached snapshot.
- Resolves ZIP codes into centroid, zones, county, and optional ZIP boundary geometry.
- Matches events to ZIP codes using boundary, zone, county, and radius logic.
- Computes explainable resource-impact signals from active events.
- Exposes source health for both primary and ancillary upstream dependencies.

## Workspace layout

```text
apps/
  api/              Hono HTTP API
  demo-ui/          standalone demo UI
packages/
  contract/         shared types, schemas, config defaults
  geo/              geometry and distance helpers
  http/             shared HTTP client and upstream health monitor
  api-*/            one package per external provider
  service-*/        domain services that compose providers
ARCHITECTURE.md     repository architecture and request flow
```

## Data sources

- `api.weather.gov` for active U.S. weather alerts
- `www.fema.gov/api/open/v2` for FEMA disaster declarations
- `earthquake.usgs.gov` for recent U.S. earthquake activity
- `eonet.gsfc.nasa.gov/api/v3` for global natural-event coverage
- `api.zippopotam.us` for ZIP centroid lookup
- `api.weather.gov/points` for NWS forecast, fire weather, and county zone context
- `tigerweb.geo.census.gov` for ZIP boundary geometry

## Prerequisites

- Bun 1.3+

## Install

```bash
bun install
```

## Run

Start both the API and demo UI:

```bash
bun run dev
```

Run only the API:

```bash
bun run dev:api
```

Run only the demo UI:

```bash
bun run dev:ui
```

Default local URLs:

- API: `http://localhost:5096`
- UI: `http://localhost:4173`
- OpenAPI: `http://localhost:5096/openapi.json`

## API endpoints

- `GET /`
- `GET /health`
- `GET /openapi.json`
- `POST /internal/refresh`
- `GET /sources/health`
- `GET /snapshot`
- `GET /disasters`
- `GET /disasters/:id`
- `GET /zip-codes/:zip/impact`
- `GET /resource-impacts`

## Quick route examples

- `GET /disasters?source=nws&state=CA`
- `GET /disasters?category=earthquake&limit=25`
- `GET /zip-codes/94103/impact`
- `GET /resource-impacts?minimumConfidence=medium`

## How ZIP matching works

For `GET /zip-codes/:zip/impact`, Ron:

1. Resolves the ZIP centroid and city/state with Zippopotam.us.
2. Resolves NWS point metadata for forecast zone, fire weather zone, and county context.
3. Resolves Census ZIP boundary geometry when enabled and available.
4. Matches events in this order:
   - published footprint to ZIP boundary
   - NWS zone match
   - county FIPS match
   - centroid/radius proximity for sources like USGS and EONET

This keeps ZIP impact lookups useful even when source geometry is incomplete or coarse.

## How resource impacts work

Resource impacts are rule-based and explainable. The `service-resource-impact` package loads strategic resource profiles and evaluates active events against:

- categories
- minimum severity
- optional minimum magnitude
- state and county matches
- bounding-box matches
- location keyword matches

The result is a ranked list of `low`, `medium`, or `high` confidence signals tied back to the triggering event IDs.

## Configuration

Ron loads defaults from `packages/contract/src/index.ts` and layers environment overrides in `apps/api/src/config.ts`.

Key runtime environment variables:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Standard runtime mode. In non-development environments, startup warm-cache and background refresh default to off. |
| `RON_ENVIRONMENT` | Explicit environment name such as `development`, `staging`, or `production`. |
| `PORT` | API listen port. Cloud Run sets this automatically. |
| `UI_PORT` | Local demo UI server port. |
| `NWS_USER_AGENT` | Required descriptive Weather.gov user agent for production use. |
| `SUPPLY_IMPACT_PROFILE_PATH` | Override the resource-impact profile JSON path. |
| `RON_PUBLIC_API_BASE_URL` | Public API base URL used by the static demo UI build. |
| `RON_DEMO_UI_ALLOWED_ORIGINS` | Comma-separated CORS allowlist for the demo UI origin(s). |
| `RON_RATE_LIMIT_ENABLED` / `RON_RATE_LIMIT_WINDOW_MS` / `RON_RATE_LIMIT_MAX_REQUESTS` | Global in-memory API request limit for the demo app. |
| `RON_REFRESH_AUTH_TOKEN` | Optional shared secret for manually triggering the protected refresh endpoint. |
| `RON_REFRESH_ALLOWED_INVOKER_EMAILS` | Comma-separated Google service-account identities allowed to invoke the protected refresh endpoint with OIDC, including service-account emails or Google subject IDs. |
| `RON_REDIS_ENABLED` / `RON_REDIS_URL` / `RON_REDIS_KEY_PREFIX` | Reserved Redis contract for future shared-cache work. |
| `RON_DATABASE_ENABLED` / `RON_DATABASE_URL` | Reserved database contract for future persistence work. |
| `DISASTER_BACKGROUND_REFRESH_ENABLED` | Enables the in-process refresh timer. Leave disabled in Cloud Run. |
| `DISASTER_BACKGROUND_REFRESH_INTERVAL_MS` | Interval for local timer-driven refresh when enabled. |
| `DISASTER_WARM_CACHE_ON_STARTUP` | Warms the snapshot cache during startup. Leave disabled in Cloud Run unless explicitly needed. |

Important config areas:

- `disasterRefresh`
- `nationalWeatherService`
- `fema`
- `usgs`
- `eonet`
- `zipCodeLookup`
- `zipBoundary`
- `demoUi`
- `rateLimit`
- `supplyImpact`

The National Weather Service should be configured with a real descriptive user agent before production use. Production health checks should target `GET /health`, while upstream feed state remains available from `GET /sources/health`.

The demo API also ships with a default global in-memory rate limit of 120 requests per minute. `GET /health` and CORS preflight requests are excluded so deployment health checks remain stable.

The protected refresh trigger lives at `POST /internal/refresh`. In Google Cloud, Phase 4 expects Cloud Scheduler and the GitHub deployment service account to invoke that route with Google-signed OIDC tokens. Staging keeps cache warming on a slower `*/30 * * * *` cadence, while production uses `*/10 * * * *`; both environments also warm the new revision once immediately after deploy.

Cloud Scheduler service-account tokens can present either the service-account email or the Google subject / authorized-party numeric identifier, so `RON_REFRESH_ALLOWED_INVOKER_EMAILS` should include both forms for scheduler and deployer identities when Cloud Run is locked down to OIDC-only refresh access.

## Deployment-oriented build paths

Build the static demo UI assets for Cloud Storage hosting:

```bash
bun run build:demo-ui
```

The output is written to `apps/demo-ui/dist/` and defaults the UI to `RON_PUBLIC_API_BASE_URL` at build time.

Build the production API image:

```bash
docker build -t ron-api .
```

## Terraform foundation

Phase 2 infrastructure now lives under `infra/terraform/` with separate entrypoints for:

- `infra/terraform/envs/staging`
- `infra/terraform/envs/production`

The shared foundation module provisions:

- required Google Cloud API enablement
- Artifact Registry for API images
- Cloud Run for the API and optional temporary UI runtime
- Cloud Storage plus Cloud CDN load-balancer resources for the static UI
- Secret Manager placeholders for runtime configuration
- Cloud Scheduler plus a dedicated refresh invoker identity for authenticated cache warming
- least-privilege runtime service accounts
- GitHub Actions Workload Identity Federation and deploy identities for CI/CD

Terraform manages the foundational Cloud Run service shape, IAM, scheduler, and storage resources, but delivery workflows own the deployed runtime image. The foundation module intentionally ignores image drift so later `terraform apply` runs do not roll Cloud Run back to the bootstrap placeholder image.

Start from the example variables file in the environment you want, then initialize and plan Terraform from that directory.

## GitHub Actions delivery

Phase 3 automation now lives in:

- `.github/workflows/ci.yml` for pull request validation
- `.github/workflows/deploy-staging.yml` for `main` branch staging deploys
- `.github/workflows/promote-production.yml` for manual production promotion of a previously published API image

The staging and production workflows expect GitHub **environment variables** with the same names in each environment:

| Variable | Source |
| --- | --- |
| `GCP_PROJECT_ID` | `terraform output -raw project_id` |
| `GCP_REGION` | `terraform output -raw region` |
| `GCP_ARTIFACT_REGISTRY_REPOSITORY_URL` | `terraform output -raw artifact_registry_repository_url` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `terraform output -raw github_workload_identity_provider` |
| `GCP_SERVICE_ACCOUNT` | `terraform output -raw deployment_service_account_email` |
| `GCP_API_SERVICE` | `terraform output -raw api_service_name` |
| `GCP_UI_BUCKET` | `terraform output -raw ui_bucket_name` |
| `GCP_UI_URL` | `terraform output -raw ui_url` |
| `GCP_UI_URL_MAP` | `terraform output -raw ui_url_map_name` |

Phase 4 also exports `refresh_scheduler_job_name`, `refresh_scheduler_service_account_email`, and `refresh_trigger_url` so the scheduler configuration can be inspected after `terraform apply`.

Apply Terraform for the target environment first, then copy those outputs into the matching GitHub environment (`staging` or `production`). The staging and production deployer service accounts also need both object-admin and bucket-reader access on the static UI bucket so `gcloud storage rsync` can inspect and publish assets.

The production workflow takes a validated `git_ref` plus an existing Artifact Registry `image_uri` so Cloud Run promotion reuses the already-published API artifact. If production promotes an image from the staging Artifact Registry repository, grant `roles/artifactregistry.reader` on the staging repository to both the production deployer service account and the production Cloud Run service agent.

Both deployment workflows mint a Google ID token with `google-github-actions/auth` before calling `POST /internal/refresh`. That avoids the `gcloud auth print-identity-token --audiences=...` limitation under federated GitHub credentials while preserving the same OIDC trust model as Cloud Scheduler.

## Build

```bash
bun run build
```

## Test

```bash
bun test
```

## VS Code

Use **Run and Debug** with the **Ron: UI + API** configuration. It starts both Bun servers and opens the demo UI at `http://127.0.0.1:4173`, with the UI pointed at the local API on port `5096`.

## Repository docs

- `README.md` for setup and feature overview
- `ARCHITECTURE.md` for package boundaries, request flow, and runtime behavior

## Current limitations

- No historical analytics or dashboards yet
- Resource-impact output is heuristic and intentionally conservative
- Source quality varies by provider, especially for geometry precision and end-time confidence
