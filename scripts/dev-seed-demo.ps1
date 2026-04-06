param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiDir = Join-Path $repoRoot "apps\api"
$apiPython = Join-Path $apiDir ".venv\Scripts\python.exe"

if (-not (Test-Path $apiPython)) {
    throw "Missing backend virtual environment: $apiPython`nCreate it first with: cd apps/api && python -m venv .venv && .venv\Scripts\python.exe -m pip install -e .[dev]"
}

Push-Location $apiDir
try {
    & $apiPython -m app.db.demo_seed
} finally {
    Pop-Location
}
