param(
    [string]$ApiHost = "0.0.0.0",
    [int]$ApiPort = 8010,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiPython = Join-Path $repoRoot "apps\api\.venv\Scripts\python.exe"
$webDist = Join-Path $repoRoot "apps\web\dist\index.html"

function Require-Path {
    param(
        [string]$Path,
        [string]$Hint
    )

    if (-not (Test-Path $Path)) {
        throw "Missing required path: $Path`n$Hint"
    }
}

Require-Path -Path $apiPython -Hint "Create the backend virtual environment first: cd apps/api && python -m venv .venv && .venv\Scripts\python.exe -m pip install -e .[dev]"

$env:VITE_API_BASE_URL = if ($env:VITE_API_BASE_URL) { $env:VITE_API_BASE_URL } else { "/api/v1" }
$env:LEARNSITE_ENV = if ($env:LEARNSITE_ENV) { $env:LEARNSITE_ENV } else { "production" }
$env:LEARNSITE_SERVE_FRONTEND = if ($env:LEARNSITE_SERVE_FRONTEND) { $env:LEARNSITE_SERVE_FRONTEND } else { "true" }

if (-not $SkipBuild) {
    Push-Location $repoRoot
    try {
        npm run build:release
    } finally {
        Pop-Location
    }
}

Require-Path -Path $webDist -Hint "Frontend build is missing. Run npm run build:web or rerun this script without -SkipBuild."

Write-Host "Starting LearnSite release server..." -ForegroundColor Green
Write-Host "API + Web  http://$ApiHost`:$ApiPort"
Write-Host "LAN        Use this machine's LAN IP from other devices, for example http://<your-ip>:$ApiPort"

Push-Location $repoRoot
try {
    & $apiPython -m uvicorn app.main:app --host $ApiHost --port $ApiPort --app-dir apps/api
} finally {
    Pop-Location
}
