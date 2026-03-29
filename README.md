# Disaster Tracker API

`DisasterTracker.Api` is a `.NET 10` ASP.NET Core API that aggregates free public disaster feeds into one normalized view for U.S.-first situational awareness, with optional global coverage where the source quality is good enough.

## What this API answers

- Is there an active disaster affecting this ZIP code?
- Where are active or monitoring disasters happening right now?
- When is an event expected to be over, and how confident is that estimate?
- Is a strategic resource region being impacted in a way that could matter to supply chains?

## Key capabilities

- Normalizes multiple public feeds into one `DisasterEvent` shape.
- Supports U.S.-focused ZIP lookups with centroid, zone, county, and ZIP-boundary matching.
- Preserves published source geometry when available.
- Computes explainable resource-impact signals from active events.
- Exposes source health so consumers can see freshness and failures.

## Data sources

- `api.weather.gov` for active U.S. weather alerts
- `www.fema.gov/api/open/v2` for FEMA disaster declarations
- `earthquake.usgs.gov` for recent U.S. earthquake activity
- `eonet.gsfc.nasa.gov/api/v3` for global natural-event coverage
- `api.zippopotam.us` for ZIP centroid lookup
- `tigerweb.geo.census.gov` for Census ZIP boundary geometry

## API endpoints

- `GET /api/disasters/active`
- `GET /api/disasters/zip/{zipCode}`
- `GET /api/disasters/{id}`
- `GET /api/impacts/resources`
- `GET /api/sources/health`
- `GET /health`

In development, OpenAPI is available at `GET /openapi/v1.json`.

## Quick start

```bash
dotnet restore DisasterTracker.slnx
dotnet run --project src/DisasterTracker.Api
```

On Windows, you can do the same with:

```bat
run-local.cmd
```

On macOS or Linux, use:

```bash
./run-local.sh
```

Run tests with:

```bash
dotnet test DisasterTracker.slnx
```

Example requests live in `src/DisasterTracker.Api/DisasterTracker.Api.http`.

## How ZIP matching works

For `GET /api/disasters/zip/{zipCode}`, the API:

1. Resolves the ZIP centroid with Zippopotam.us.
2. Resolves NWS point metadata to forecast zone, fire zone, and county context.
3. Resolves Census ZCTA boundary geometry when available.
4. Matches events in this order:
   - published polygon footprint to ZIP polygon
   - NWS zone or county match
   - FEMA county match
   - centroid/radius proximity for sources like USGS and EONET

This keeps the API usable even when some sources provide only coarse geometry.

## How resource impacts work

Resource impacts are rule-based and intentionally explainable. They are not market predictions.

The current profile catalog includes:

- U.S. strategic regions like the Gulf Coast, Permian Basin, Central Valley, Southern Plains, and Puerto Rico pharma
- a first global pass covering central Thailand electronics, Taiwan semiconductors, northern Chile copper, the Panama Canal, and northwest Australia bulk exports

## Configuration

Most runtime settings live in `src/DisasterTracker.Api/appsettings.json`.

Key sections:

- `DisasterRefresh`
- `NationalWeatherService`
- `Fema`
- `Usgs`
- `Eonet`
- `ZipCodeLookup`
- `ZipBoundary`
- `SupplyImpact`

The National Weather Service expects a real descriptive user agent. Replace the placeholder before deploying outside local development.

## Repository docs

- `README.md` for setup and feature overview
- `architecture.md` for system design and request/data flow details

## Current limitations

- No historical analytics or dashboards yet
- Supply-impact output is heuristic and intentionally conservative
- Source quality varies by provider, especially for end times and geometry precision
