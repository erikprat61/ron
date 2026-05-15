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
docs/
  architecture.html visual architecture reference
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

Ron loads defaults from `packages/contract/src/index.ts` and supports a small set of environment overrides in `apps/api/src/config.ts`.

Key environment variables:

- `PORT`
- `UI_PORT`
- `NWS_USER_AGENT`
- `SUPPLY_IMPACT_PROFILE_PATH`

Important default config areas:

- `disasterRefresh`
- `nationalWeatherService`
- `fema`
- `usgs`
- `eonet`
- `zipCodeLookup`
- `zipBoundary`
- `demoUi`
- `supplyImpact`

The National Weather Service should be configured with a real descriptive user agent before production use.

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
- `docs/architecture.html` for the visual architecture reference

## Current limitations

- No historical analytics or dashboards yet
- Resource-impact output is heuristic and intentionally conservative
- Source quality varies by provider, especially for geometry precision and end-time confidence
