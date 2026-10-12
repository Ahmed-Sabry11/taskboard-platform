<#
.SYNOPSIS
    Measures availability while Kubernetes replaces every application pod.

.DESCRIPTION
    Sends requests through the frontend at a steady rate, restarts the backend
    and frontend Deployments, keeps sending until both rollouts finish, and
    reports how many requests failed. A zero-downtime rollout loses none.
    Requires kubectl pointing at the cluster. Exits with code 1 if any
    request failed.

.EXAMPLE
    .\scripts\rollout-availability-test.ps1
#>
param(
    [string]$Url = 'http://127.0.0.1:8090/api/readyz',
    [string]$Namespace = 'taskboard',
    [int]$IntervalMs = 100
)

$total = 0
$failed = 0
$statuses = @{}

function Send-Request {
    $script:total++
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        $status = [int]$response.StatusCode
    }
    catch {
        $status = 0
        if ($null -ne $_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    }
    if ($status -ne 200) {
        $script:failed++
        $script:statuses[$status] = 1 + [int]$script:statuses[$status]
    }
}

Write-Host "Baseline: 20 requests before the rollout"
1..20 | ForEach-Object { Send-Request; Start-Sleep -Milliseconds $IntervalMs }
if ($failed -gt 0) {
    Write-Host "The application is not healthy before the test ($failed of $total failed). Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Restarting backend and frontend, sending a request every $IntervalMs ms"
kubectl -n $Namespace rollout restart deployment/backend deployment/frontend | Out-Null
$rollout = Start-Job -ScriptBlock {
    param($ns)
    kubectl -n $ns rollout status deployment/backend --timeout=300s | Out-Null
    kubectl -n $ns rollout status deployment/frontend --timeout=300s | Out-Null
} -ArgumentList $Namespace

$timer = [Diagnostics.Stopwatch]::StartNew()
while ($rollout.State -eq 'Running') {
    Send-Request
    Start-Sleep -Milliseconds $IntervalMs
}
# Old pods are still terminating for a few seconds after the rollout reports done.
1..100 | ForEach-Object { Send-Request; Start-Sleep -Milliseconds $IntervalMs }
Remove-Job $rollout -Force

$seconds = [math]::Round($timer.Elapsed.TotalSeconds)
$rate = if ($total -gt 0) { [math]::Round(100 * $failed / $total, 2) } else { 0 }
Write-Host ''
Write-Host "Duration:  $seconds s"
Write-Host "Requests:  $total"
Write-Host "Failed:    $failed ($rate %)"
foreach ($status in $statuses.Keys) {
    $label = if ($status -eq 0) { 'no response' } else { "HTTP $status" }
    Write-Host "           $label x $($statuses[$status])"
}
if ($failed -eq 0) {
    Write-Host 'Zero failed requests during the rollout.' -ForegroundColor Green
    exit 0
}
exit 1
