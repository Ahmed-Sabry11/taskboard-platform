<#
.SYNOPSIS
    Checks that the network policies allow what the application needs and
    block everything else.

.DESCRIPTION
    Opens TCP connections from inside the pods with kubectl exec and compares
    the result with what the policies in
    deploy/apps/taskboard/base/network-policies.yaml intend. Also starts a
    short-lived pod in another namespace to test access from outside.
    Exits with code 1 if any check fails.

.EXAMPLE
    .\scripts\network-policy-test.ps1
    .\scripts\network-policy-test.ps1 -Context eks-taskboard
#>
param(
    [string]$Context = '',
    [string]$Namespace = 'taskboard'
)

$base = @()
if ($Context) { $base = @('--context', $Context) }
$failures = 0

function Test-Connection2 {
    param([string]$Name, [bool]$ShouldConnect, [scriptblock]$Attempt)
    & $Attempt 2>$null | Out-Null
    $connected = ($LASTEXITCODE -eq 0)
    $expected = if ($ShouldConnect) { 'allowed' } else { 'blocked' }
    $actual = if ($connected) { 'allowed' } else { 'blocked' }
    if ($connected -eq $ShouldConnect) {
        Write-Host ("  PASS  {0,-52} {1}" -f $Name, $actual)
    }
    else {
        $script:failures++
        Write-Host ("  FAIL  {0,-52} {1}, expected {2}" -f $Name, $actual, $expected) -ForegroundColor Red
    }
}

# The backend image has no network tools, so it connects with Python.
function Backend-Connect($target, $port) {
    kubectl @base -n $Namespace exec deployment/backend -c backend -- python -c "import socket; socket.create_connection(('$target', $port), 3)"
}
function Frontend-Connect($target, $port) {
    kubectl @base -n $Namespace exec deployment/frontend -- nc -z -w 3 $target $port
}
function Postgres-Connect($target, $port) {
    kubectl @base -n $Namespace exec postgres-0 -- nc -z -w 3 $target $port
}

Write-Host 'Paths the application needs'
Test-Connection2 'frontend -> backend:8000' $true { Frontend-Connect 'backend' 8000 }
Test-Connection2 'backend  -> postgres:5432' $true { Backend-Connect 'postgres' 5432 }

Write-Host 'Paths that must be closed'
Test-Connection2 'frontend -> postgres:5432' $false { Frontend-Connect 'postgres' 5432 }
Test-Connection2 'backend  -> frontend:8080' $false { Backend-Connect 'frontend' 8080 }
Test-Connection2 'postgres -> backend:8000' $false { Postgres-Connect 'backend' 8000 }

Write-Host 'No pod may call out of the cluster'
Test-Connection2 'frontend -> internet (1.1.1.1:443)' $false { Frontend-Connect '1.1.1.1' 443 }
Test-Connection2 'backend  -> internet (1.1.1.1:443)' $false { Backend-Connect '1.1.1.1' 443 }
Test-Connection2 'postgres -> internet (1.1.1.1:443)' $false { Postgres-Connect '1.1.1.1' 443 }

Write-Host 'From another namespace'
$probe = "np-probe-$(Get-Random -Maximum 99999)"
kubectl @base -n default run $probe --image=busybox:1.36 --restart=Never --command -- sleep 120 2>$null | Out-Null
kubectl @base -n default wait --for=condition=Ready "pod/$probe" --timeout=90s 2>$null | Out-Null
Test-Connection2 'other namespace -> backend:8000' $false { kubectl @base -n default exec $probe -- nc -z -w 3 "backend.$Namespace.svc.cluster.local" 8000 }
Test-Connection2 'other namespace -> postgres:5432' $false { kubectl @base -n default exec $probe -- nc -z -w 3 "postgres.$Namespace.svc.cluster.local" 5432 }
Test-Connection2 'other namespace -> frontend:8080 (public entry)' $true { kubectl @base -n default exec $probe -- nc -z -w 3 "frontend.$Namespace.svc.cluster.local" 8080 }
kubectl @base -n default delete pod $probe --wait=false 2>$null | Out-Null

Write-Host ''
if ($failures -eq 0) {
    Write-Host 'Network policies behave as intended.' -ForegroundColor Green
    exit 0
}
Write-Host "$failures check(s) failed." -ForegroundColor Red
exit 1
