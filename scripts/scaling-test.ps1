<#
.SYNOPSIS
    Runs a k6 load scenario and records how the Horizontal Pod Autoscaler responds.

.DESCRIPTION
    Starts k6 in a container, and every five seconds records the backend's
    replica count and CPU utilisation as the autoscaler sees them. Keeps
    recording after the load ends until the backend is back at its minimum.
    Prints a timeline summary and k6's own results, and saves both under
    loadtest/results (git-ignored).

    Requires Docker and kubectl. Run from the repository root.

.EXAMPLE
    .\scripts\scaling-test.ps1 -Scenario ramp

.EXAMPLE
    Against EKS, through the public load balancer:
    .\scripts\scaling-test.ps1 -Scenario ramp -Url http://<load-balancer-address> -Context eks-taskboard
#>
param(
    [ValidateSet('baseline', 'ramp', 'spike')][string]$Scenario = 'ramp',
    # Address as seen from inside the k6 container. host.docker.internal is
    # this machine, where the local cluster publishes port 8090.
    [string]$Url = 'http://host.docker.internal:8090',
    [string]$Context = '',
    [string]$Namespace = 'taskboard',
    [int]$MaxScaleDownWaitSeconds = 600,
    [string]$K6Image = 'grafana/k6:2.3.0'
)

$kubectlArgs = @('-n', $Namespace)
if ($Context) { $kubectlArgs = @('--context', $Context) + $kubectlArgs }

$repo = (Get-Location).Path
$results = Join-Path $repo 'loadtest\results'
New-Item -ItemType Directory -Force $results | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$k6Log = Join-Path $results "$stamp-$Scenario-k6.txt"
$csv = Join-Path $results "$stamp-$Scenario-replicas.csv"

function Get-HpaState {
    $raw = kubectl @kubectlArgs get hpa backend -o json 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $hpa = $raw | ConvertFrom-Json
    $cpu = ($hpa.status.currentMetrics | Where-Object { $_.resource.name -eq 'cpu' }).resource.current.averageUtilization
    $ready = [int](kubectl @kubectlArgs get deployment backend -o jsonpath='{.status.readyReplicas}' 2>$null)
    [pscustomobject]@{
        Min     = [int]$hpa.spec.minReplicas
        Max     = [int]$hpa.spec.maxReplicas
        Current = [int]$hpa.status.currentReplicas
        Desired = [int]$hpa.status.desiredReplicas
        Ready   = $ready
        Cpu     = if ($null -ne $cpu) { [int]$cpu } else { -1 }
    }
}

$start = Get-HpaState
if ($null -eq $start) {
    Write-Host 'No HorizontalPodAutoscaler named "backend" found. Is the application deployed?' -ForegroundColor Red
    exit 1
}
if ($start.Cpu -lt 0) {
    Write-Host 'The autoscaler has no CPU reading. Is metrics-server running?' -ForegroundColor Red
    exit 1
}
Write-Host "Scenario '$Scenario' against $Url"
Write-Host "Backend autoscaler: min $($start.Min), max $($start.Max), now $($start.Current) replicas at $($start.Cpu)% CPU"

$k6 = Start-Job -ScriptBlock {
    param($repo, $image, $url, $scenario, $log)
    docker run --rm -v "${repo}\loadtest:/scripts:ro" -e "BASE_URL=$url" -e "SCENARIO=$scenario" $image run --quiet --no-color /scripts/taskboard.js 2>&1 | Out-File -Encoding utf8 $log
} -ArgumentList $repo, $K6Image, $Url, $Scenario, $k6Log

$timer = [Diagnostics.Stopwatch]::StartNew()
$samples = New-Object System.Collections.Generic.List[object]
$loadEndedAt = $null
'seconds,phase,current,desired,ready,cpu_percent' | Set-Content -Encoding ascii $csv

while ($true) {
    $state = Get-HpaState
    $elapsed = [int]$timer.Elapsed.TotalSeconds
    if ($k6.State -ne 'Running' -and $null -eq $loadEndedAt) { $loadEndedAt = $elapsed }
    $phase = if ($null -eq $loadEndedAt) { 'load' } else { 'cooldown' }
    if ($null -ne $state) {
        $samples.Add([pscustomobject]@{ Seconds = $elapsed; Phase = $phase; Current = $state.Current; Desired = $state.Desired; Ready = $state.Ready; Cpu = $state.Cpu })
        "$elapsed,$phase,$($state.Current),$($state.Desired),$($state.Ready),$($state.Cpu)" | Add-Content -Encoding ascii $csv
        Write-Host ("  {0,4}s  {1,-8}  replicas {2,2} (ready {3,2}, desired {4,2})  cpu {5,4}%" -f $elapsed, $phase, $state.Current, $state.Ready, $state.Desired, $state.Cpu)
    }
    if ($null -ne $loadEndedAt) {
        if ($null -ne $state -and $state.Current -le $start.Min) { break }
        if (($elapsed - $loadEndedAt) -ge $MaxScaleDownWaitSeconds) { break }
    }
    Start-Sleep -Seconds 5
}
Receive-Job $k6 | Out-Null
Remove-Job $k6 -Force

# ---- Summary ------------------------------------------------------------------
$peak = ($samples | Measure-Object -Property Current -Maximum).Maximum
$firstScaleOut = $samples | Where-Object { $_.Current -gt $start.Current } | Select-Object -First 1
$peakReached = $samples | Where-Object { $_.Ready -ge $peak } | Select-Object -First 1
$peakCpu = ($samples | Measure-Object -Property Cpu -Maximum).Maximum
$backAtMin = $samples | Where-Object { $_.Phase -eq 'cooldown' -and $_.Current -le $start.Min } | Select-Object -First 1

Write-Host ''
Write-Host '--- Autoscaler ---'
Write-Host "Replicas at start:            $($start.Current)"
Write-Host "Peak replicas:                $peak of a maximum of $($start.Max)"
Write-Host "Peak average CPU:             $peakCpu% of request (target 60%)"
if ($firstScaleOut) { Write-Host "First scale-out:              $($firstScaleOut.Seconds) s after the load started" } else { Write-Host 'First scale-out:              none' }
if ($peakReached -and $peak -gt $start.Current) { Write-Host "All peak replicas ready:      $($peakReached.Seconds) s after the load started" }
Write-Host "Load ended:                   $loadEndedAt s"
if ($backAtMin) { Write-Host "Back at minimum replicas:     $($backAtMin.Seconds - $loadEndedAt) s after the load ended" } else { Write-Host "Back at minimum replicas:     not within $MaxScaleDownWaitSeconds s" }

Write-Host ''
Write-Host '--- k6 ---'
Get-Content $k6Log | Where-Object { $_ -match 'http_req_duration|http_req_failed|http_reqs|checks|lost_writes|iterations|vus_max|level=error|THRESHOLDS' } | ForEach-Object { $_.TrimEnd() }
Write-Host ''
Write-Host "Saved: $csv"
Write-Host "Saved: $k6Log"
