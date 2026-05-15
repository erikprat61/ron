# Architecture

Ron is a Bun workspace organized as a modular monorepo. The core design goal is to keep external-provider integrations isolated in dedicated packages, compose them in service packages, and keep application entrypoints thin.

For a visual version of this document, see [`docs/architecture.html`](./docs/architecture.html).

## Repository shape

- `apps/`
  - `api/`: Hono HTTP API that exposes Ron domain workflows
  - `demo-ui/`: demo frontend for exercising the API
- `packages/`
  - `contract/`: shared domain contracts and response models
  - `geo/`: shared geography helpers and matching logic
  - `http/`: shared transport utilities such as JSON fetching, retry policy, rate limiting, and HTTP errors
  - `api-*`: one package per external provider integration
  - `service-*`: domain services that orchestrate provider clients and map provider data into Ron contracts
- `docs/`: supporting project documentation

## Layering

The intended dependency direction is:

1. Shared contracts and helpers at the bottom (`packages/contract`, `packages/geo`, `packages/http`)
2. Provider client packages on top of shared helpers (`packages/api-*`)
3. Service packages that compose provider clients (`packages/service-*`)
4. Application entrypoints (`apps/api`, `apps/demo-ui`)

In practice, routes and app code should depend on service packages, and service packages should depend on provider packages rather than calling external APIs directly from the app layer.

## Design rules

### 1. One provider, one package

Each external API should live in its own package with provider-specific request/response types, configuration, and error handling.

### 2. Normalize above the clients

Provider packages expose provider-native data. Service packages are responsible for translating that data into Ron's shared contracts.

### 3. No provider logic in routes

The Hono API should orchestrate workflows and HTTP delivery only. Route handlers should not import provider clients directly when a service package can own that integration.

### 4. Shared transport stays shared

Cross-cutting HTTP behavior such as retries, headers, rate limiting, and error wrappers belongs in `packages/http` so provider integrations behave consistently.

## Main domain flows

- Disaster catalog flows aggregate normalized event data from provider packages such as Weather.gov, OpenFEMA, USGS, and EONET.
- ZIP context flows combine ZIP lookup, NWS points metadata, and geography lookup packages.
- Resource impact flows build on location and disaster context to estimate downstream impacts.
- Source health flows report the operational status of upstream integrations.

## API surface

The `apps/api` service exposes Ron domain data rather than raw provider payloads. Responses are generated from shared contracts, and the API layer is responsible for HTTP-specific concerns such as routing and response formatting.
