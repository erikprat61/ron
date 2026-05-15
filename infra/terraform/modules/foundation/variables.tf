variable "project_id" {
  description = "Google Cloud project ID for the target environment."
  type        = string
}

variable "environment" {
  description = "Environment name, such as staging or production."
  type        = string
}

variable "region" {
  description = "Primary region for regional resources."
  type        = string
}

variable "artifact_registry_location" {
  description = "Location for the Artifact Registry repository."
  type        = string
}

variable "artifact_registry_repository_id" {
  description = "Artifact Registry repository ID for API images."
  type        = string
  default     = "ron-api"
}

variable "api_service_name" {
  description = "Cloud Run service name for the API."
  type        = string
  default     = "ron-api"
}

variable "api_container_image" {
  description = "Container image deployed to the API Cloud Run service."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "api_container_port" {
  description = "Container port exposed by the API service."
  type        = number
  default     = 8080
}

variable "api_min_instance_count" {
  description = "Minimum number of API instances kept warm."
  type        = number
  default     = 0
}

variable "api_max_instance_count" {
  description = "Maximum number of API instances."
  type        = number
  default     = 3
}

variable "refresh_scheduler_enabled" {
  description = "Whether to create the Cloud Scheduler job that warms the API snapshot cache."
  type        = bool
  default     = false
}

variable "refresh_scheduler_job_name" {
  description = "Cloud Scheduler job name for the authenticated API refresh trigger."
  type        = string
  default     = "ron-refresh"
}

variable "refresh_scheduler_schedule" {
  description = "Cron schedule for the authenticated API refresh trigger."
  type        = string
  default     = "*/15 * * * *"
}

variable "refresh_scheduler_time_zone" {
  description = "Time zone for the refresh scheduler cron expression."
  type        = string
  default     = "Etc/UTC"
}

variable "create_ui_cloud_run" {
  description = "Whether to create a temporary Cloud Run service for the demo UI."
  type        = bool
  default     = false
}

variable "ui_service_name" {
  description = "Cloud Run service name for the optional UI runtime."
  type        = string
  default     = "ron-demo-ui"
}

variable "ui_container_image" {
  description = "Container image for the optional UI Cloud Run service."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "ui_bucket_name" {
  description = "Name of the Cloud Storage bucket used for static UI assets."
  type        = string
  default     = null
}

variable "ui_bucket_force_destroy" {
  description = "Whether Terraform may destroy the UI bucket with objects in it."
  type        = bool
  default     = false
}

variable "ui_domain_names" {
  description = "Optional domains for HTTPS UI delivery through Cloud CDN."
  type        = list(string)
  default     = []
}

variable "github_repository" {
  description = "GitHub repository allowed to federate into Google Cloud, in owner/repo form."
  type        = string
  default     = "erikprat61/ron"
}

variable "github_workload_identity_pool_id" {
  description = "Optional override for the GitHub Actions workload identity pool ID."
  type        = string
  default     = null
}

variable "github_workload_identity_provider_id" {
  description = "Workload identity provider ID used for GitHub Actions."
  type        = string
  default     = "github"
}

variable "deployment_service_account_id" {
  description = "Optional override for the GitHub Actions deployment service account ID."
  type        = string
  default     = null
}

variable "secret_ids" {
  description = "Secret Manager secret IDs to create for runtime configuration."
  type        = set(string)
  default = [
    "nws-user-agent",
    "refresh-auth-token",
    "redis-url",
    "database-url"
  ]
}
