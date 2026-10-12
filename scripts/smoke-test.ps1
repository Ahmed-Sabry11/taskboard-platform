<#
.SYNOPSIS
    Checks that the running Docker Compose stack behaves correctly.

.DESCRIPTION
    Run from the repository root after "docker compose up -d".
    Exercises the health endpoints, a full create/read/update/delete cycle
    through the frontend's /api proxy, input validation, security headers,
    non-root users, and network isolation. Exits with code 1 if any check fails.

.EXAMPLE
    .\scripts\smoke-test.ps1
    .\scripts\smoke-test.ps1 -FrontendUrl http://127.0.0.1:9080 -BackendUrl http://127.0.0.1:9000

.EXAMPLE
    Against the local Kubernetes cluster, where only the frontend is exposed
    and it proxies /api to the backend:
    .\scripts\smoke-test.ps1 -FrontendUrl http://127.0.0.1:8090 -BackendUrl http://127.0.0.1:8090 -SkipComposeChecks
#>
param(
    [string]$FrontendUrl = 'http://127.0.0.1:8080',
    [string]$BackendUrl = 'http://127.0.0.1:8000',
    # Skips the checks that use "docker compose exec". Use it when the stack
    # runs somewhere else, for example on Kubernetes.
    [switch]$SkipComposeChecks
)

$script:failures = 0

function Test-Check {
    param([string]$Name, [bool]$Passed, [string]$Detail = '')
    if ($Passed) {
        Write-Host "  PASS  $Name"
    }
    else {
        $script:failures++
        Write-Host "  FAIL  $Name  $Detail" -ForegroundColor Red
    }
}

# Returns the status code instead of throwing on 4xx/5xx. Status 0 means the
# request never got an HTTP response (connection refused, timeout).
function Invoke-Http {
    param([string]$Method = 'GET', [string]$Url, [string]$Body)
    $request = @{ Method = $Method; Uri = $Url; UseBasicParsing = $true; TimeoutSec = 10 }
    if ($Body) {
        $request.Body = $Body
        $request.ContentType = 'application/json'
    }
    try {
        $response = Invoke-WebRequest @request
        return @{ Status = [int]$response.StatusCode; Content = $response.Content; Headers = $response.Headers }
    }
    catch {
        $status = 0
        if ($null -ne $_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        }
        return @{ Status = $status; Content = ''; Headers = @{} }
    }
}

Write-Host 'Health'
$r = Invoke-Http -Url "$FrontendUrl/healthz"
Test-Check 'frontend /healthz returns 200' ($r.Status -eq 200) "got $($r.Status)"
$r = Invoke-Http -Url "$BackendUrl/api/healthz"
Test-Check 'backend /api/healthz returns 200' ($r.Status -eq 200) "got $($r.Status)"
$r = Invoke-Http -Url "$BackendUrl/api/readyz"
Test-Check 'backend /api/readyz returns 200 (database reachable)' ($r.Status -eq 200) "got $($r.Status)"

Write-Host 'Frontend'
$r = Invoke-Http -Url "$FrontendUrl/"
Test-Check 'serves the web page' (($r.Status -eq 200) -and ($r.Content -match '<div id="root">')) "got $($r.Status)"
Test-Check 'sends a Content-Security-Policy header' ([bool]$r.Headers['Content-Security-Policy'])
Test-Check 'sends X-Content-Type-Options: nosniff' ("$($r.Headers['X-Content-Type-Options'])" -eq 'nosniff')
# Metrics are for Prometheus inside the cluster, never for visitors.
$r = Invoke-Http -Url "$FrontendUrl/metrics"
Test-Check 'does not expose backend metrics at /metrics' ($r.Content -notmatch 'http_requests_total')
$r = Invoke-Http -Url "$FrontendUrl/api/metrics"
Test-Check 'does not expose backend metrics at /api/metrics' ($r.Status -eq 404) "got $($r.Status)"

Write-Host 'CRUD through the frontend proxy (frontend -> backend -> database)'
$api = "$FrontendUrl/api/tasks"
$r = Invoke-Http -Method POST -Url $api -Body '{"title":"Smoke test task","priority":"high"}'
Test-Check 'POST creates a task (201)' ($r.Status -eq 201) "got $($r.Status)"
$id = $null
if ($r.Status -eq 201) {
    $id = ($r.Content | ConvertFrom-Json).id
}
if ($null -ne $id) {
    $r = Invoke-Http -Url "$api/$id"
    Test-Check 'GET returns the task' (($r.Status -eq 200) -and (($r.Content | ConvertFrom-Json).title -eq 'Smoke test task')) "got $($r.Status)"

    $r = Invoke-Http -Method PATCH -Url "$api/$id" -Body '{"status":"done"}'
    Test-Check 'PATCH updates the status' (($r.Status -eq 200) -and (($r.Content | ConvertFrom-Json).status -eq 'done')) "got $($r.Status)"

    $r = Invoke-Http -Url "${api}?status=done&limit=100"
    $listed = @()
    if ($r.Status -eq 200) {
        $listed = @(($r.Content | ConvertFrom-Json).items | Where-Object { $_.id -eq $id })
    }
    Test-Check 'GET list with a status filter includes the task' ($listed.Count -eq 1) "got $($r.Status)"

    $r = Invoke-Http -Method DELETE -Url "$api/$id"
    Test-Check 'DELETE removes the task (204)' ($r.Status -eq 204) "got $($r.Status)"

    $r = Invoke-Http -Url "$api/$id"
    Test-Check 'GET after delete returns 404' ($r.Status -eq 404) "got $($r.Status)"
}
else {
    Test-Check 'remaining CRUD checks' $false 'skipped because the task was not created'
}

Write-Host 'Validation'
$r = Invoke-Http -Method POST -Url $api -Body '{"title":""}'
Test-Check 'empty title is rejected (422)' ($r.Status -eq 422) "got $($r.Status)"
$r = Invoke-Http -Method POST -Url $api -Body '{"title":"x","status":"archived"}'
Test-Check 'unknown status is rejected (422)' ($r.Status -eq 422) "got $($r.Status)"

if (-not $SkipComposeChecks) {
Write-Host 'Container hardening'
$backendUid = (docker compose exec -T backend id -u | Out-String).Trim()
Test-Check 'backend runs as non-root' (($backendUid -ne '') -and ($backendUid -ne '0')) "uid '$backendUid'"
$frontendUid = (docker compose exec -T frontend id -u | Out-String).Trim()
Test-Check 'frontend runs as non-root' (($frontendUid -ne '') -and ($frontendUid -ne '0')) "uid '$frontendUid'"
docker compose exec -T backend sh -c 'touch /app/probe' 2>$null | Out-Null
Test-Check 'backend filesystem is read-only' ($LASTEXITCODE -ne 0)

Write-Host 'Network isolation'
docker compose exec -T frontend sh -c 'nc -z -w 2 backend 8000' 2>$null | Out-Null
Test-Check 'frontend can reach the backend' ($LASTEXITCODE -eq 0)
docker compose exec -T frontend sh -c 'nc -z -w 2 db 5432' 2>$null | Out-Null
Test-Check 'frontend cannot reach the database' ($LASTEXITCODE -ne 0)
}

Write-Host ''
if ($script:failures -eq 0) {
    Write-Host 'All checks passed.' -ForegroundColor Green
    exit 0
}
Write-Host "$($script:failures) check(s) failed." -ForegroundColor Red
exit 1
