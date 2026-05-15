output "project_id" {
  value = module.foundation.project_id
}

output "region" {
  value = module.foundation.region
}

output "artifact_registry_repository_url" {
  value = module.foundation.artifact_registry_repository_url
}

output "api_service_name" {
  value = module.foundation.api_service_name
}

output "api_service_url" {
  value = module.foundation.api_service_url
}

output "ui_bucket_name" {
  value = module.foundation.ui_bucket_name
}

output "ui_url" {
  value = module.foundation.ui_url
}

output "ui_url_map_name" {
  value = module.foundation.ui_url_map_name
}

output "deployment_service_account_email" {
  value = module.foundation.deployment_service_account_email
}

output "github_workload_identity_provider" {
  value = module.foundation.github_workload_identity_provider
}

output "secret_names" {
  value = module.foundation.secret_names
}
