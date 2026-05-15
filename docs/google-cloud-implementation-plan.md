# Google Cloud implementation plan

This document is the execution plan for delivering the Google Cloud work described in:

- `docs/google-cloud-deployment-architecture.md`
- `docs/google-cloud-operations-and-state-plan.md`

It turns those architecture and operations recommendations into one ordered implementation plan that can be executed end-to-end.

## Current status

1. **Phase 1 is complete.** The repo now includes API containerization, deployment-oriented runtime configuration, Cloud Run-safe startup and health behavior, and a static demo UI build path.
2. **Phase 2 foundation work is complete.** Terraform now exists under `infra/terraform/` with validated `staging` and `production` environment entrypoints plus a shared foundation module.
3. **Google Cloud projects are created.**
   - staging: `ron-burgundy-staging`
   - production: `ron-burgundy-production`
4. **Phase 3 is complete.**
   - Terraform is applied in both staging and production, including Workload Identity Federation and deploy identities.
   - GitHub Actions workflows exist for pull request CI, `main`-branch staging deploys, and manual production promotion.
   - GitHub `staging` and `production` environments are populated with the required `GCP_*` variables from Terraform outputs.
5. **Phase 4 is complete.**
   - The API now exposes an authenticated refresh trigger at `POST /internal/refresh`.
   - Terraform now provisions Cloud Scheduler refresh jobs plus dedicated scheduler identities in staging and production.
   - Staging and production deploy workflows warm the new revision immediately after deployment while ongoing cadence remains scheduler-owned.
6. **Next phase:** Phase 5 - add production observability and rollback discipline.

## Goal

Deploy Ron to Google Cloud with a production-safe delivery path, then harden it with the minimum additional platform services needed for shared state, observability, and future persistence.

The plan intentionally preserves the current app and package boundaries, prioritizes stateless Cloud Run deployment first, and delays Redis or PostgreSQL until operations or product requirements justify them.

## Delivery principles

1. Keep the current thin-app/service-package design intact.
2. Make Cloud Run instances stateless for correctness.
3. Treat in-memory cache as an optimization, not shared system state.
4. Build once, validate once, and promote the same artifact forward.
5. Keep secrets out of images and source control.
6. Use infrastructure as code from the first staging deployment.
7. Add stateful services only when they solve a demonstrated problem.

## Implementation phases

### Phase 1: Productionize the runtime surface

**Outcome:** the API and UI can be deployed without depending on local-only behavior.

**Status:** complete

#### Scope

1. Add API containerization for `apps/api`.
2. Finalize the production hosting strategy for `apps/demo-ui`.
3. Expand deployment-oriented configuration.
4. Separate app startup from scheduled refresh behavior.
5. Confirm health and readiness behavior is Cloud Run compatible.

#### Concrete deliverables

- `Dockerfile` for the API
- `.dockerignore`
- static UI build command via `bun run build:demo-ui`
- production configuration contract covering:
  - environment name
  - public API base URL for the UI
  - refresh trigger auth/protection
  - future Redis settings
  - future database settings
- API startup changes so refresh is not coupled to every instance boot
- Cloud Run-safe `/health` behavior that does not trigger snapshot refresh work
- UI static build/publish path if Cloud Storage hosting is chosen

#### Notes

- Preferred UI target: static assets on Cloud Storage + Cloud CDN.
- Acceptable temporary fallback: a second Cloud Run service for the UI.
- `setInterval`-driven refresh should remain local-development behavior only, not production control flow.

#### Exit criteria

- The API runs from a production container image.
- The UI has a defined production deployment target.
- Production behavior does not depend on in-process timers.

### Phase 2: Bootstrap Google Cloud foundations

**Outcome:** staging infrastructure exists and is reproducible.

**Status:** complete for the initial foundation scaffold

#### Scope

1. Create isolated staging and production environments.
2. Enable the required Google Cloud APIs.
3. Create Artifact Registry for API images.
4. Create Cloud Run services for the API and optional temporary UI runtime.
5. Create Cloud Storage buckets for static UI assets.
6. Put Cloud CDN in front of the UI bucket.
7. Create Secret Manager secrets for runtime configuration.
8. Create least-privilege service accounts and IAM bindings.

#### Concrete deliverables

- Terraform for:
  - project or environment separation
  - API enablement
  - Artifact Registry
  - Cloud Run services
  - storage buckets
  - CDN configuration
  - Secret Manager secrets
  - IAM bindings
- environment entrypoints:
  - `infra/terraform/envs/staging`
  - `infra/terraform/envs/production`
- shared module:
  - `infra/terraform/modules/foundation`

#### Implemented environment IDs

- staging project: `ron-burgundy-staging`
- production project: `ron-burgundy-production`

#### Required services

- Cloud Run API
- Artifact Registry API
- Secret Manager API
- Cloud Build API if used in delivery
- Cloud Scheduler API
- Cloud Logging API
- Cloud Monitoring API

#### Exit criteria

- Staging can be recreated from infrastructure code.
- Runtime identities, secrets, image registry, and UI hosting resources exist.

### Phase 3: Establish CI and staging CD

**Outcome:** GitHub continuously validates the repo and deploys staging automatically.

**Status:** complete

#### Scope

1. Add GitHub Actions CI for install, build, test, and API image build.
2. Authenticate GitHub Actions to Google Cloud with Workload Identity Federation.
3. Build and publish the API image on pushes to `main`.
4. Deploy the published image to staging Cloud Run.
5. Publish UI assets to the staging bucket.
6. Run staging smoke checks after deployment.

#### Concrete deliverables

- pull request CI workflow
- `main` branch staging deploy workflow
- release or manual promotion workflow for production
- Workload Identity Federation setup
- smoke-check step against staging API and UI

#### Validation commands

- `bun install`
- `bun run build`
- `bun test`

#### Exit criteria

- Every pull request runs standard repo validation.
- Every push to `main` can produce a fresh staging deployment.
- Production promotion uses a previously validated artifact, not a rebuild.

### Phase 4: Move refresh orchestration out of the app instance

**Outcome:** refresh timing is controlled by infrastructure instead of Cloud Run lifecycle behavior.

**Status:** complete

#### Scope

1. Add an explicit refresh trigger endpoint or job target.
2. Protect that trigger with service-to-service auth or equivalent controls.
3. Create Cloud Scheduler jobs for refresh cadence.
4. Remove production dependence on instance-local timers.
5. Define warm-cache behavior for staging and production.

#### Concrete deliverables

- protected refresh trigger
- Cloud Scheduler jobs
- deployment configuration for refresh cadence
- runtime behavior changes that make scale-to-zero and scale-out safe

#### Exit criteria

- Refresh cadence is owned by Google Cloud infrastructure.
- Instance startup and shutdown do not affect correctness.

### Phase 5: Add production observability and rollback discipline

**Outcome:** the deployed system is supportable before more stateful complexity is introduced.

#### Scope

1. Standardize structured logging for requests, refresh runs, and upstream failures.
2. Add dashboards and alerts for error rate, latency, refresh failures, and upstream degradation.
3. Add uptime checks for public endpoints.
4. Document rollback steps for Cloud Run revisions and UI asset deploys.
5. Write runbooks for common operational failures.

#### Concrete deliverables

- structured log schema
- Cloud Monitoring dashboards
- alert policies
- uptime checks
- rollback procedure
- runbooks for:
  - refresh job failure
  - upstream degradation
  - bad rollout
  - stale or missing cache state

#### Exit criteria

- Staging and production have actionable alerts.
- Rollbacks and refresh troubleshooting do not rely on tribal knowledge.

### Phase 6: Harden shared caching only if needed

**Outcome:** cross-instance cache coordination is added only where operations show it is necessary.

#### Scope

1. Identify which caches need cross-instance consistency.
2. Clarify which current caches remain local-only.
3. Add or refine a cache abstraction at the service boundary if needed.
4. Introduce Memorystore (Redis) only for caches that need shared behavior.
5. Define TTLs, refresh strategy, and fallback behavior.

#### First candidates for shared cache

- disaster snapshots
- ZIP lookup results
- upstream response fragments

#### Decision trigger

Introduce Redis when staging or production shows that:

- duplicate upstream work is too high during scale-out
- snapshot freshness must be shared
- latency degrades materially because cache state is isolated per instance

#### Exit criteria

- Shared versus local cache responsibilities are explicit.
- Redis is only used where it solves a real operational problem.

### Phase 7: Add durable persistence when product requirements justify it

**Outcome:** a database is introduced as a system of record, not as speculative platform complexity.

#### Scope

1. Add Cloud SQL for PostgreSQL when durable application data is required.
2. Define schema migration tooling and deployment sequencing.
3. Keep migrations separate from app startup.
4. Add private connectivity, IAM, and secret handling for database access.
5. Add PostGIS only if location-heavy querying becomes a primary product need.

#### Good triggers for this phase

- historical snapshots
- stored ZIP codes, users, or preferences
- refresh metadata and audit state
- reporting or analytics queries

#### Exit criteria

- PostgreSQL exists because the product needs durable state.
- Database rollout includes controlled migrations and secure connectivity.

## Cross-phase workstreams

These should be advanced alongside the main phases rather than left to the end.

### Configuration model

- define the environment variable contract
- document secret inventory
- separate staging and production values

### Security controls

- least-privilege runtime service accounts
- no long-lived GitHub to Google Cloud keys
- protected refresh invocation path

### Operational documentation

- deployment procedure
- rollback procedure
- refresh ownership model
- scheduler behavior

### Platform design artifacts

- cache integration design
- monitoring and alert definitions
- database migration approach

## Recommended execution order

Follow the phases in this order:

1. Phase 1 - productionize runtime behavior
2. Phase 2 - create staging infrastructure
3. Phase 3 - automate CI and staging delivery
4. Phase 4 - move refresh control to Cloud Scheduler
5. Phase 5 - add observability and rollback discipline
6. Phase 6 - introduce Redis only if observed behavior requires it
7. Phase 7 - introduce PostgreSQL only if product requirements require it

## Dependency map

- Phase 1 unlocks Phases 2 and 3.
- Phase 2 is required before staging CD can be completed in Phase 3.
- Phase 4 depends on Cloud Run and Cloud Scheduler resources from Phase 2.
- Phase 5 should start once staging deployments exist and before major platform expansion.
- Phase 6 depends on observing real behavior in staging or production.
- Phase 7 depends on validated product requirements, not deployment convenience.

## First implementation batch

The first batch of execution work was:

1. Add API containerization.
2. Choose the production UI hosting path.
3. Remove production dependence on the in-process refresh timer.
4. Create staging infrastructure in Terraform.
5. Add GitHub Actions CI and Workload Identity Federation-based staging deploys.

Items 1 through 5 are complete. Phase 4 is now complete, and Phase 5 is the current next implementation target.

## Definition of done

This plan is complete when Ron has:

1. a reproducible staging and production deployment path
2. stateless Cloud Run runtime behavior for correctness
3. automated CI and artifact-based promotion
4. operational visibility and rollback discipline
5. optional Redis and PostgreSQL only where justified by real needs
