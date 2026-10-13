<#
.SYNOPSIS
    Builds the application images and pushes them to Amazon ECR.

.DESCRIPTION
    Run from the repository root, signed in to AWS (aws login).
    Images are tagged with the short Git commit SHA, so a tag always names
    exactly one build. ECR tags are immutable: pushing the same tag twice is
    refused, which is why uncommitted changes under app/ stop the script.

    This is what the release pipeline would do. It runs from a laptop because
    the AWS account in use does not allow the OIDC role that GitHub Actions
    needs to push without stored keys.

.EXAMPLE
    .\scripts\push-images.ps1 -Region eu-north-1
#>
param(
    [Parameter(Mandatory = $true)][string]$Region,
    [string]$Project = 'taskboard'
)

if (git status --porcelain -- app) {
    Write-Host 'There are uncommitted changes under app/. Commit them first, so the tag matches a commit.' -ForegroundColor Red
    exit 1
}
$tag = (git rev-parse --short HEAD).Trim()
$account = (aws sts get-caller-identity --query Account --output text).Trim()
if ($LASTEXITCODE -ne 0) { Write-Host 'Not signed in to AWS. Run: aws login' -ForegroundColor Red; exit 1 }
$registry = "$account.dkr.ecr.$Region.amazonaws.com"

Write-Host "Building images for commit $tag"
docker compose build backend frontend
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Signing Docker in to $Region"
# The registry token is too long for the Windows credential store, which
# rejects it with "The stub received bad data". So for the push only, Docker
# uses a throwaway configuration directory, deleted again in the finally block.
$endpoint = (docker context inspect --format '{{.Endpoints.docker.Host}}').Trim()
$throwaway = Join-Path $env:TEMP "docker-ecr-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $throwaway | Out-Null
# A config that already holds an entry makes Docker keep credentials in this
# directory instead of looking for the system credential store.
$placeholder = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('placeholder:placeholder'))
[System.IO.File]::WriteAllText((Join-Path $throwaway 'config.json'), "{`"auths`":{`"placeholder.invalid`":{`"auth`":`"$placeholder`"}}}")
$savedConfig = $env:DOCKER_CONFIG
$savedHost = $env:DOCKER_HOST
$failed = $false
try {
    $env:DOCKER_CONFIG = $throwaway
    $env:DOCKER_HOST = $endpoint
    # The password goes straight from the AWS CLI into Docker and is never
    # shown. The pipe runs in cmd because Windows PowerShell re-encodes text
    # passed between programs, which corrupts the password.
    cmd /c "aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registry" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Signing in to ECR failed.' }

    foreach ($service in 'backend', 'frontend') {
        $remote = "$registry/$Project/${service}:$tag"
        $existing = aws ecr describe-images --region $Region --repository-name "$Project/$service" --image-ids imageTag=$tag --query 'imageDetails[0].imageDigest' --output text 2>$null
        if ($LASTEXITCODE -eq 0 -and $existing) {
            Write-Host "  $service`:$tag is already in the registry, skipping"
            continue
        }
        docker tag "$Project-${service}:local" $remote
        docker push $remote
        if ($LASTEXITCODE -ne 0) { throw "Pushing $service failed." }
    }
}
catch {
    Write-Host $_ -ForegroundColor Red
    $failed = $true
}
finally {
    $env:DOCKER_CONFIG = $savedConfig
    $env:DOCKER_HOST = $savedHost
    Remove-Item -Recurse -Force $throwaway -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
Write-Host ''
Write-Host "Pushed tag: $tag" -ForegroundColor Green
Write-Host "Set this tag in deploy/apps/taskboard/overlays/aws/kustomization.yaml and merge the change."
