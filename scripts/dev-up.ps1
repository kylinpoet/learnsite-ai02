param(
    [int]$ApiPort = 8010,
    [int]$WebPort = 5173,
    [string]$ApiHost = "0.0.0.0",
    [string]$WebHost = "0.0.0.0"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-common.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiPython = Join-Path $repoRoot "apps\api\.venv\Scripts\python.exe"
$viteCmd = Join-Path $repoRoot "node_modules\.bin\vite.cmd"
$webDir = Join-Path $repoRoot "apps\web"
$apiTitle = "LearnSite API $ApiPort"
$webTitle = "LearnSite Web $WebPort"

function Require-Path {
    param(
        [string]$Path,
        [string]$Hint
    )

    if (-not (Test-Path $Path)) {
        throw "Missing required path: $Path`n$Hint"
    }
}

function Get-PortState {
    param(
        [int]$Port,
        [string]$ServiceName,
        [string[]]$ExpectedProcessNames,
        [scriptblock]$HealthProbe
    )

    $processId = Get-ListeningProcessId -Port $Port
    if ($null -eq $processId) {
        return "start"
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        throw "[$ServiceName] Port $Port is in LISTENING state but its owning PID $processId could not be inspected."
    }

    if ($ExpectedProcessNames -notcontains $process.ProcessName) {
        throw "[$ServiceName] Port $Port is already occupied by another process (PID $processId, $($process.ProcessName)).`nStop that process or rerun dev-up.ps1 with a different port."
    }

    if (& $HealthProbe) {
        Write-Host "[$ServiceName] Port $Port is already served by LearnSite (PID $processId, $($process.ProcessName)). Skipping duplicate launch." -ForegroundColor Yellow
    } else {
        Write-Warning "[$ServiceName] Port $Port is held by $($process.ProcessName) (PID $processId) that did not answer its health probe. Treating it as a previous LearnSite instance and skipping the duplicate launch. Run scripts\dev-down.cmd first if it is stale."
    }

    return "skip"
}

function Start-VisibleWindow {
    param(
        [string]$Role,
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$CommandLine
    )

    $fullCommand = "title $Title && cd /d `"$WorkingDirectory`" && $CommandLine"
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $fullCommand -WorkingDirectory $WorkingDirectory -PassThru

    # The window PID is recorded because a console window title cannot be looked up
    # again without WMI, which dev-down.ps1 must cope with.
    Set-DevWindowRecord -Role $Role -WindowProcessId $process.Id -StartedAtTicks $process.StartTime.Ticks
}

function Wait-ForPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($null -ne (Get-ListeningProcessId -Port $Port)) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }

    return $false
}

Require-Path -Path $apiPython -Hint "Create the backend virtual environment first: cd apps/api && python -m venv .venv && .venv\Scripts\python.exe -m pip install -e .[dev]"
Require-Path -Path $viteCmd -Hint "Install frontend dependencies first: npm install"
Require-Path -Path $webDir -Hint "The frontend workspace folder is missing."

$apiState = Get-PortState -Port $ApiPort -ServiceName "API" -ExpectedProcessNames @("python", "python3", "pythonw") -HealthProbe {
    Test-HttpBodyContains -Port $ApiPort -Path "/api/v1/openapi.json" -Pattern '"openapi"\s*:'
}

$webState = Get-PortState -Port $WebPort -ServiceName "Web" -ExpectedProcessNames @("node") -HealthProbe {
    Test-HttpBodyContains -Port $WebPort -Path "/" -Pattern '@vite/client'
}

if ($apiState -eq "start") {
    $apiCommand = "`"$apiPython`" -m uvicorn app.main:app --host $ApiHost --port $ApiPort --app-dir apps/api --reload --reload-dir apps/api/app"
    Start-VisibleWindow -Role "api" -Title $apiTitle -WorkingDirectory $repoRoot -CommandLine $apiCommand
}

if ($webState -eq "start") {
    $webCommand = "`"$viteCmd`" --host $WebHost --port $WebPort"
    Start-VisibleWindow -Role "web" -Title $webTitle -WorkingDirectory $webDir -CommandLine $webCommand
}

if ($apiState -eq "start" -and -not (Wait-ForPort -Port $ApiPort)) {
    Write-Warning "[API] Port $ApiPort was not detected within 20 seconds. Check the '$apiTitle' window for startup errors."
}

if ($webState -eq "start" -and -not (Wait-ForPort -Port $WebPort)) {
    Write-Warning "[Web] Port $WebPort was not detected within 20 seconds. Check the '$webTitle' window for startup errors."
}

$apiReady = $null -ne (Get-ListeningProcessId -Port $ApiPort)
$webReady = $null -ne (Get-ListeningProcessId -Port $WebPort)
$apiStatus = if ($apiReady) { "[OK]" } else { "[CHECK WINDOW]" }
$webStatus = if ($webReady) { "[OK]" } else { "[CHECK WINDOW]" }

Write-Host ""
Write-Host "LearnSite development windows launched." -ForegroundColor Green
Write-Host "API      $apiStatus http://$ApiHost`:$ApiPort"
Write-Host "Web      $webStatus http://$WebHost`:$WebPort"
if ($ApiHost -eq "0.0.0.0" -or $WebHost -eq "0.0.0.0") {
    Write-Host "LAN      Use this machine's LAN IP from other devices, for example http://<your-ip>:$WebPort" -ForegroundColor Green
}
Write-Host "Demo seed (explicit)  npm run dev:seed-demo"
Write-Host "After seeding: Student 70101 / 12345"
Write-Host "After seeding: Teacher t1 / 222221 | Teacher2 t2 / 222221 | Admin admin / 222221"
Write-Host ""
Write-Host "Note: the browser should open the frontend URL. API requests stay same-origin at /api/v1 and are proxied to $ApiHost`:$ApiPort by Vite." -ForegroundColor Cyan
Write-Host "Demo attendance and sample accounts are available only after the explicit seed command." -ForegroundColor Cyan
