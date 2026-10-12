output "bucket_name" {
  description = "Name of the state bucket."
  value       = aws_s3_bucket.state.id
}

output "backend_config" {
  description = "Contents for infra/backend.hcl, which the other stacks read with -backend-config."
  value       = <<-EOT
    bucket = "${aws_s3_bucket.state.id}"
    region = "${var.region}"
  EOT
}
