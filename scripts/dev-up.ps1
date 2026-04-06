param(
    [int]$ApiPort = 8010,
    [int]$WebPort = 5173,
    [string]$ApiHost = "127.0.0.1",
    [string]$WebHost = "localhost"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRootRegex = [Regex]::Escape($repoRoot)
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

function Get-ListeningConnection {
    param([int]$Port)

    return Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq "Listen" } |
        Select-Object -First 1
}

function Get-CommandLine {
    param([int]$ProcessId)

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return ""
    }

    return $process.CommandLine
}

function Get-PortState {
    param(
        [int]$Port,
        [string]$ServiceName,
        [scriptblock]$OwnedByLearnSite
    )

    $connection = Get-ListeningConnection -Port $Port
    if ($null -eq $connection) {
        return "start"
    }

    $commandLine = Get-CommandLine -ProcessId $connection.OwningProcess
    if (& $OwnedByLearnSite $commandLine) {
        Write-Host "[$ServiceName] Port $Port is already served by LearnSite. Skipping duplicate launch." -ForegroundColor Yellow
        Write-Host "[$ServiceName] PID $($connection.OwningProcess): $commandLine" -ForegroundColor DarkYellow
        return "skip"
    }

    $summary = if ([string]::IsNullOrWhiteSpace($commandLine)) { "unknown command line" } else { $commandLine }
    throw "[$ServiceName] Port $Port is already occupied by another process (PID $($connection.OwningProcess)).`n$summary"
}

function Start-VisibleWindow {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$CommandLine
    )

    $fullCommand = "title $Title && cd /d `"$WorkingDirectory`" && $CommandLine"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $fullCommand -WorkingDirectory $WorkingDirectory | Out-Null
}

function Wait-ForPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($null -ne (Get-ListeningConnection -Port $Port)) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }

    return $false
}

Require-Path -Path $apiPython -Hint "Create the backend virtual environment first: cd apps/api && python -m venv .venv && .venv\Scripts\python.exe -m pip install -e .[dev]"
Require-Path -Path $viteCmd -Hint "Install frontend dependencies first: npm install"
Require-Path -Path $webDir -Hint "The frontend workspace folder is missing."

$apiState = Get-PortState -Port $ApiPort -ServiceName "API" -OwnedByLearnSite {
    param($CommandLine)

    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        return $false
    }

    return $CommandLine -match "uvicorn app\.main:app" -and
        $CommandLine -match "--port $ApiPort" -and
        $CommandLine -match "--app-dir apps/api"
}

$webState = Get-PortState -Port $WebPort -ServiceName "Web" -OwnedByLearnSite {
    param($CommandLine)

    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        return $false
    }

    return $CommandLine -match "vite" -and $CommandLine -match $repoRootRegex
}

if ($apiState -eq "start") {
    $apiCommand = "`"$apiPython`" -m uvicorn app.main:app --host $ApiHost --port $ApiPort --app-dir apps/api --reload --reload-dir apps/api/app"
    Start-VisibleWindow -Title $apiTitle -WorkingDirectory $repoRoot -CommandLine $apiCommand
}

if ($webState -eq "start") {
    $webCommand = "`"$viteCmd`" --host $WebHost --port $WebPort"
    Start-VisibleWindow -Title $webTitle -WorkingDirectory $webDir -CommandLine $webCommand
}

if ($apiState -eq "start" -and -not (Wait-ForPort -Port $ApiPort)) {
    Write-Warning "[API] Port $ApiPort was not detected within 20 seconds. Check the '$apiTitle' window for startup errors."
}

if ($webState -eq "start" -and -not (Wait-ForPort -Port $WebPort)) {
    Write-Warning "[Web] Port $WebPort was not detected within 20 seconds. Check the '$webTitle' window for startup errors."
}

$apiReady = $null -ne (Get-ListeningConnection -Port $ApiPort)
$webReady = $null -ne (Get-ListeningConnection -Port $WebPort)
$apiStatus = if ($apiReady) { "[OK]" } else { "[CHECK WINDOW]" }
$webStatus = if ($webReady) { "[OK]" } else { "[CHECK WINDOW]" }

Write-Host ""
Write-Host "LearnSite development windows launched." -ForegroundColor Green
Write-Host "API      $apiStatus http://$ApiHost`:$ApiPort"
Write-Host "Web      $webStatus http://$WebHost`:$WebPort"
Write-Host "Demo seed (explicit)  npm run dev:seed-demo"
Write-Host "After seeding: Student 70101 / 12345"
Write-Host "After seeding: Teacher t1 / 222221 | Teacher2 t2 / 222221 | Admin admin / 222221"
Write-Host ""
Write-Host "Note: the browser should open the frontend URL. API requests stay same-origin at /api/v1 and are proxied to $ApiHost`:$ApiPort by Vite." -ForegroundColor Cyan
Write-Host "Demo attendance and sample accounts are available only after the explicit seed command." -ForegroundColor Cyan
