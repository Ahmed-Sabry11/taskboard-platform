# Resources that cost almost nothing and are kept between work sessions:
# the image registry and the identity that CI uses to push to it.

module "ecr" {
  source = "../../modules/ecr"

  repository_names = [
    "${var.project}/backend",
    "${var.project}/frontend",
  ]
  force_delete = var.ecr_force_delete
}

module "github_oidc" {
  source = "../../modules/github-oidc"
  count  = var.enable_github_oidc ? 1 : 0

  role_name            = "${var.project}-github-actions"
  github_repository    = var.github_repository
  create_oidc_provider = var.create_github_oidc_provider
  ecr_repository_arns  = values(module.ecr.repository_arns)
}
