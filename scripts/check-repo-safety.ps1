<#
.SYNOPSIS
    Verifies that this clone cannot accidentally commit secrets or local state.

.DESCRIPTION
    Run from the repository root. Checks that the Git hooks are enabled, that
    sensitive files which exist locally are ignored, and that nothing sensitive
    is already tracked. Exits with code 1 if any check fails.
#>

$failures = 0

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

Write-Host 'Hooks'
$hooksPath = git config --get core.hooksPath
Test-Check 'core.hooksPath points at .githooks' ($hooksPath -eq '.githooks') 'run: git config core.hooksPath .githooks'
Test-Check 'pre-commit hook exists' (Test-Path '.githooks/pre-commit')
Test-Check 'commit-msg hook exists' (Test-Path '.githooks/commit-msg')

Write-Host 'Local sensitive files are ignored'
$local = @('.env', 'deploy/apps/taskboard/overlays/local/secrets.env')
foreach ($path in $local) {
    if (Test-Path $path) {
        git check-ignore -q $path
        Test-Check "$path is ignored" ($LASTEXITCODE -eq 0)
    }
}

Write-Host 'Ignore rules cover the dangerous file types'
$samples = @(
    'infra/stacks/platform/terraform.tfstate',
    'infra/stacks/platform/terraform.tfstate.backup',
    'infra/stacks/platform/terraform.tfvars',
    'infra/stacks/platform/plan.tfplan',
    'infra/stacks/platform/.terraform/providers/x',
    'keys/deploy.pem',
    'id_rsa',
    'kubeconfig',
    '.aws/credentials',
    'downloads/user_accessKeys.csv',
    'deploy/apps/taskboard/overlays/aws/secret.yaml',
    'app/backend/.env.local'
)
foreach ($path in $samples) {
    git check-ignore -q $path
    Test-Check "would ignore $path" ($LASTEXITCODE -eq 0)
}

Write-Host 'Templates stay committable'
foreach ($path in @('.env.example', 'deploy/apps/taskboard/overlays/local/secrets.env.example', 'infra/stacks/platform/terraform.tfvars.example')) {
    git check-ignore -q $path
    Test-Check "does not ignore $path" ($LASTEXITCODE -ne 0)
}

Write-Host 'Nothing sensitive is tracked'
$pattern = '(^|/)(\.env(\..+)?|[^/]*\.env|[^/]*\.tfstate(\..+)?|[^/]*\.tfvars(\.json)?|[^/]*\.tfplan|[^/]*\.(pem|key|p12|pfx|ppk)|id_rsa[^/]*|kubeconfig|credentials|secrets?\.yaml)$'
$tracked = @(git ls-files | Where-Object { ($_ -match $pattern) -and ($_ -notmatch '\.example$') })
Test-Check 'no sensitive file names in the index' ($tracked.Count -eq 0) ($tracked -join ', ')

Write-Host ''
if ($failures -eq 0) {
    Write-Host 'Repository is safe to commit and push.' -ForegroundColor Green
    exit 0
}
Write-Host "$failures check(s) failed." -ForegroundColor Red
exit 1
