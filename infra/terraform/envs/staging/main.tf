terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.33"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "foundation" {
  source = "../../modules/foundation"

  project_id                 = var.project_id
  environment                = "staging"
  region                     = var.region
  artifact_registry_location = var.artifact_registry_location
  api_container_image        = var.api_container_image
  create_ui_cloud_run        = var.create_ui_cloud_run
  ui_container_image         = var.ui_container_image
  ui_bucket_name             = var.ui_bucket_name
  ui_bucket_force_destroy    = var.ui_bucket_force_destroy
  ui_domain_names            = var.ui_domain_names
}
