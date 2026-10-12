variable "repository_names" {
  description = "Names of the image repositories to create."
  type        = set(string)
}

variable "immutable_tags" {
  description = "Forbid overwriting an existing tag. Guarantees that a tag deployed by GitOps always refers to the same image."
  type        = bool
  default     = true
}

variable "scan_on_push" {
  description = "Scan every pushed image for known vulnerabilities."
  type        = bool
  default     = true
}

variable "max_tagged_images" {
  description = "Number of most recent tagged images to keep per repository."
  type        = number
  default     = 20
}

variable "untagged_expiry_days" {
  description = "Days after which untagged images are deleted."
  type        = number
  default     = 7
}

variable "force_delete" {
  description = "Allow Terraform to delete a repository that still contains images. Keep false unless tearing an environment down for good."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags added to every resource in this module."
  type        = map(string)
  default     = {}
}
