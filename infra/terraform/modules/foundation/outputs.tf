output "artifact_registry_repository" {
  description = "Artifact Registry repository for API images."
  value       = google_artifact_registry_repository.api.id
}

output "artifact_registry_repository_url" {
  description = "Base repository URL for API images."
  value       = "${var.artifact_registry_location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.api.repository_id}"
}

output "project_id" {
  description = "Google Cloud project ID for this environment."
  value       = var.project_id
}

output "region" {
  description = "Primary Google Cloud region for this environment."
  value       = var.region
}

output "api_service_name" {
  description = "Cloud Run API service name."
  value       = google_cloud_run_v2_service.api.name
}

output "api_service_url" {
  description = "Cloud Run API service URL."
  value       = google_cloud_run_v2_service.api.uri
}

output "api_runtime_service_account_email" {
  description = "Runtime service account email for the API."
  value       = google_service_account.api_runtime.email
}

output "ui_runtime_service_account_email" {
  description = "Runtime service account email for the optional UI service."
  value       = try(google_service_account.ui_runtime[0].email, null)
}

output "ui_bucket_name" {
  description = "Cloud Storage bucket for static UI assets."
  value       = google_storage_bucket.ui.name
}

output "ui_cdn_ip_address" {
  description = "Global IP for the UI load balancer and CDN."
  value       = google_compute_global_address.ui.address
}

output "ui_url" {
  description = "Resolved UI URL, using HTTPS when a domain is configured."
  value       = local.ui_origin
}

output "ui_url_map_name" {
  description = "Global URL map name for the UI CDN and load balancer."
  value       = google_compute_url_map.ui.name
}

output "deployment_service_account_email" {
  description = "GitHub Actions deployment service account email."
  value       = google_service_account.deployment.email
}

output "github_workload_identity_provider" {
  description = "Full resource name of the GitHub Actions workload identity provider."
  value       = google_iam_workload_identity_pool_provider.github_actions.name
}

output "secret_names" {
  description = "Secret Manager secret IDs reserved for Ron runtime configuration."
  value       = sort([for secret in google_secret_manager_secret.runtime : secret.secret_id])
}
