variable "project_id" {
  description = "Google Cloud project ID for staging."
  type        = string
}

variable "region" {
  description = "Primary staging region."
  type        = string
  default     = "us-central1"
}

variable "artifact_registry_location" {
  description = "Artifact Registry location for staging."
  type        = string
  default     = "us-central1"
}

variable "api_container_image" {
  description = "Bootstrap image for the staging API service."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "create_ui_cloud_run" {
  description = "Whether to create a temporary staging UI Cloud Run service."
  type        = bool
  default     = false
}

variable "ui_container_image" {
  description = "Bootstrap image for the optional staging UI service."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "ui_bucket_name" {
  description = "Optional override for the staging UI bucket name."
  type        = string
  default     = null
}

variable "ui_bucket_force_destroy" {
  description = "Whether Terraform may destroy the staging UI bucket with objects in it."
  type        = bool
  default     = false
}

variable "ui_domain_names" {
  description = "Optional staging UI domains for HTTPS."
  type        = list(string)
  default     = []
}
