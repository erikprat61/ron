# Ron

Ron is now a **Bun workspace** with:

- a Hono API in `apps/api`
- a standalone demo UI in `apps/demo-ui`
- shared contract, geo, HTTP, provider-client, and service packages in `packages/`

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

## Build

```bash
bun run build
```

## Test

```bash
bun test
```

## Key routes

- `GET /health`
- `GET /sources/health`
- `GET /disasters`
- `GET /disasters/:id`
- `GET /zip-codes/:zip/impact`
- `GET /resource-impacts`
- `GET /snapshot`
- `GET /openapi.json`

## Architecture

See `docs/architecture.html` for the target workspace structure and package boundaries.
