locals {
  required_services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com"
  ])

  ui_bucket_name                   = coalesce(var.ui_bucket_name, "${var.project_id}-${var.environment}-ron-demo-ui")
  github_workload_identity_pool_id = coalesce(var.github_workload_identity_pool_id, "${var.environment}-github-actions")
  deployment_service_account_id    = coalesce(var.deployment_service_account_id, "${var.environment}-ron-deployer")
  github_actions_project_roles = toset([
    "roles/artifactregistry.writer",
    "roles/compute.loadBalancerAdmin",
    "roles/run.admin"
  ])
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "api" {
  project       = var.project_id
  location      = var.artifact_registry_location
  repository_id = var.artifact_registry_repository_id
  description   = "Ron API images for ${var.environment}"
  format        = "DOCKER"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "api_runtime" {
  project      = var.project_id
  account_id   = substr(replace(lower("${var.environment}-ron-api"), "/[^a-z0-9-]/", "-"), 0, 30)
  display_name = "Ron API runtime (${var.environment})"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "ui_runtime" {
  count = var.create_ui_cloud_run ? 1 : 0

  project      = var.project_id
  account_id   = substr(replace(lower("${var.environment}-ron-ui"), "/[^a-z0-9-]/", "-"), 0, 30)
  display_name = "Ron demo UI runtime (${var.environment})"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "deployment" {
  project      = var.project_id
  account_id   = substr(replace(lower(local.deployment_service_account_id), "/[^a-z0-9-]/", "-"), 0, 30)
  display_name = "Ron GitHub deployer (${var.environment})"

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool" "github_actions" {
  project                   = var.project_id
  workload_identity_pool_id = substr(replace(lower(local.github_workload_identity_pool_id), "/[^a-z0-9-]/", "-"), 0, 32)
  display_name              = "GitHub Actions (${var.environment})"
  description               = "OIDC federation pool for GitHub Actions deployments to Ron ${var.environment}."

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions.workload_identity_pool_id
  workload_identity_pool_provider_id = var.github_workload_identity_provider_id
  display_name                       = "GitHub provider (${var.environment})"
  description                        = "Accepts OIDC tokens from GitHub Actions for ${var.github_repository}."
  attribute_condition                = "assertion.repository == '${var.github_repository}'"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.aud"              = "assertion.aud"
    "attribute.ref"              = "assertion.ref"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "deployment_workload_identity_user" {
  service_account_id = google_service_account.deployment.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_actions.name}/attribute.repository/${var.github_repository}"
}

resource "google_service_account_iam_member" "deployment_api_runtime_user" {
  service_account_id = google_service_account.api_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployment.email}"
}

resource "google_project_iam_member" "deployment_project_roles" {
  for_each = local.github_actions_project_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployment.email}"
}

resource "google_secret_manager_secret" "runtime" {
  for_each = var.secret_ids

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "api_runtime_access" {
  for_each = google_secret_manager_secret.runtime

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_compute_global_address" "ui" {
  project = var.project_id
  name    = "${var.environment}-ron-ui-ip"

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket" "ui" {
  project                     = var.project_id
  name                        = local.ui_bucket_name
  location                    = "US"
  force_destroy               = var.ui_bucket_force_destroy
  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "ui_public_read" {
  bucket = google_storage_bucket.ui.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_storage_bucket_iam_member" "ui_deployment_admin" {
  bucket = google_storage_bucket.ui.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployment.email}"
}

resource "google_compute_backend_bucket" "ui" {
  project     = var.project_id
  name        = "${var.environment}-ron-ui-backend"
  bucket_name = google_storage_bucket.ui.name
  enable_cdn  = true

  depends_on = [google_project_service.required]
}

resource "google_compute_url_map" "ui" {
  project         = var.project_id
  name            = "${var.environment}-ron-ui-map"
  default_service = google_compute_backend_bucket.ui.self_link
}

resource "google_compute_target_http_proxy" "ui" {
  project = var.project_id
  name    = "${var.environment}-ron-ui-http-proxy"
  url_map = google_compute_url_map.ui.self_link
}

resource "google_compute_global_forwarding_rule" "ui_http" {
  project    = var.project_id
  name       = "${var.environment}-ron-ui-http"
  ip_address = google_compute_global_address.ui.address
  port_range = "80"
  target     = google_compute_target_http_proxy.ui.self_link
}

resource "google_compute_managed_ssl_certificate" "ui" {
  count = length(var.ui_domain_names) > 0 ? 1 : 0

  project = var.project_id
  name    = "${var.environment}-ron-ui-cert"

  managed {
    domains = var.ui_domain_names
  }
}

resource "google_compute_target_https_proxy" "ui" {
  count = length(var.ui_domain_names) > 0 ? 1 : 0

  project          = var.project_id
  name             = "${var.environment}-ron-ui-https-proxy"
  url_map          = google_compute_url_map.ui.self_link
  ssl_certificates = [google_compute_managed_ssl_certificate.ui[0].self_link]
}

resource "google_compute_global_forwarding_rule" "ui_https" {
  count = length(var.ui_domain_names) > 0 ? 1 : 0

  project    = var.project_id
  name       = "${var.environment}-ron-ui-https"
  ip_address = google_compute_global_address.ui.address
  port_range = "443"
  target     = google_compute_target_https_proxy.ui[0].self_link
}

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = var.api_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.api_runtime.email

    scaling {
      min_instance_count = var.api_min_instance_count
      max_instance_count = var.api_max_instance_count
    }

    containers {
      image = var.api_container_image

      ports {
        container_port = var.api_container_port
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "RON_ENVIRONMENT"
        value = var.environment
      }

      env {
        name  = "DISASTER_BACKGROUND_REFRESH_ENABLED"
        value = "false"
      }

      env {
        name  = "DISASTER_WARM_CACHE_ON_STARTUP"
        value = "false"
      }

      env {
        name  = "RON_DEMO_UI_ALLOWED_ORIGINS"
        value = local.ui_origin
      }
    }
  }

  deletion_protection = false

  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.api_runtime_access
  ]
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "ui" {
  count = var.create_ui_cloud_run ? 1 : 0

  project  = var.project_id
  name     = var.ui_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.ui_runtime[0].email

    containers {
      image = var.ui_container_image
    }
  }

  deletion_protection = false

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "ui_public" {
  count = var.create_ui_cloud_run ? 1 : 0

  project  = var.project_id
  location = google_cloud_run_v2_service.ui[0].location
  name     = google_cloud_run_v2_service.ui[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

locals {
  ui_origin = length(var.ui_domain_names) > 0 ? "https://${var.ui_domain_names[0]}" : "http://${google_compute_global_address.ui.address}"
}
