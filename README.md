# Disaster Tracker API

`DisasterTracker.Api` is a `.NET 10` ASP.NET Core API that aggregates free public disaster feeds into one normalized view.

Current API goals:

- answer whether a U.S. ZIP code is currently impacted
- list active or monitoring disasters across the U.S. and, when enabled, the world
- surface best-effort end times with explicit confidence
- flag potentially meaningful resource and supply-chain impacts with explainable heuristics

## Sources used in the current build

- `api.weather.gov` for active U.S. weather alerts
- `www.fema.gov/api/open/v2` for open FEMA declarations
- `earthquake.usgs.gov` for recent U.S. earthquake activity
- `eonet.gsfc.nasa.gov/api/v3` for optional global natural-event coverage
- `api.zippopotam.us` for ZIP centroid lookup
- `tigerweb.geo.census.gov` for Census ZIP boundary geometry

## API surface

- `GET /api/disasters/active`
- `GET /api/disasters/zip/{zipCode}`
- `GET /api/disasters/{id}`
- `GET /api/impacts/resources`
- `GET /api/sources/health`
- `GET /health`

In development, OpenAPI is available at `GET /openapi/v1.json`.

## Running locally

```bash
dotnet restore DisasterTracker.slnx
dotnet run --project src/DisasterTracker.Api
```

Run tests with:

```bash
dotnet test DisasterTracker.slnx
```

## Configuration notes

Most settings live in `src/DisasterTracker.Api/appsettings.json`.

Important values:

- `NationalWeatherService:UserAgent`
- `DisasterRefresh:*`
- `Usgs:*`
- `Fema:*`
- `Eonet:*`
- `ZipCodeLookup:*`
- `ZipBoundary:*`
- `SupplyImpact:ResourceProfilePath`

The National Weather Service expects a descriptive user agent. Replace the placeholder value before deploying this beyond local development.

## Design notes

- ZIP lookups now combine Zippopotam.us centroids, NWS point context, and Census ZCTA polygon boundaries. Published event polygons are matched against the ZIP polygon first, then the API falls back to zone/county or radius-based heuristics when a source only provides coarser geometry.
- FEMA declarations are matched at county level when possible.
- USGS earthquakes are modeled as `monitoring` events because the quake itself is instantaneous, even though impacts can remain operationally relevant.
- NASA EONET events use the latest published geometry to estimate a current centroid and footprint radius, while preserving published polygon footprints when available.
- Resource-impact output is intentionally heuristic and explainable, not a market forecast. The current catalog now includes both U.S. strategic regions and a first global pass for areas such as central Thailand electronics, Taiwan semiconductors, northern Chile copper, the Panama Canal, and northwest Australia bulk exports.

## What is not in this build yet

- historical analytics or trend dashboards
