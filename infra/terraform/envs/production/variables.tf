variable "project_id" {
  description = "Google Cloud project ID for production."
  type        = string
}

variable "region" {
  description = "Primary production region."
  type        = string
  default     = "us-central1"
}

variable "artifact_registry_location" {
  description = "Artifact Registry location for production."
  type        = string
  default     = "us-central1"
}

variable "api_container_image" {
  description = "Bootstrap image for the production API service."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "create_ui_cloud_run" {
  description = "Whether to create a temporary production UI Cloud Run service."
  type        = bool
  default     = false
}

variable "ui_container_image" {
  description = "Bootstrap image for the optional production UI service."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "ui_bucket_name" {
  description = "Optional override for the production UI bucket name."
  type        = string
  default     = null
}

variable "ui_bucket_force_destroy" {
  description = "Whether Terraform may destroy the production UI bucket with objects in it."
  type        = bool
  default     = false
}

variable "ui_domain_names" {
  description = "Optional production UI domains for HTTPS."
  type        = list(string)
  default     = []
}

variable "refresh_scheduler_enabled" {
  description = "Whether to create the production refresh scheduler job."
  type        = bool
  default     = true
}

variable "refresh_scheduler_schedule" {
  description = "Cron schedule for the production refresh scheduler job."
  type        = string
  default     = "*/10 * * * *"
}

variable "refresh_scheduler_time_zone" {
  description = "Time zone for the production refresh scheduler cron expression."
  type        = string
  default     = "Etc/UTC"
}
