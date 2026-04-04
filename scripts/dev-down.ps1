param(
    [int]$ApiPort = 8010,
    [int]$WebPort = 5173
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRootRegex = [Regex]::Escape($repoRoot)

function Get-MatchingProcesses {
    param([scriptblock]$Predicate)

    return Get-CimInstance Win32_Process |
        Where-Object {
            $commandLine = $_.CommandLine
            if ([string]::IsNullOrWhiteSpace($commandLine)) {
                return $false
            }

            return (& $Predicate $_ $commandLine)
        } |
        Sort-Object ProcessId -Unique
}

function Stop-ProcessTree {
    param(
        [object[]]$Processes,
        [string]$Label
    )

    foreach ($process in $Processes) {
        if (-not (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) {
            continue
        }

        Write-Host "Stopping $Label PID $($process.ProcessId)" -ForegroundColor Yellow
        Start-Process -FilePath "$env:SystemRoot\System32\taskkill.exe" `
            -ArgumentList "/PID", "$($process.ProcessId)", "/T", "/F" `
            -WindowStyle Hidden `
            -Wait | Out-Null

        if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

function Show-PortStatus {
    param([int]$Port)

    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq "Listen" } |
        Select-Object -First 1

    if ($null -eq $connection) {
        Write-Host "Port $Port is now free." -ForegroundColor Green
        return
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
    $commandLine = if ($null -eq $process) { "unknown command line" } else { $process.CommandLine }
    Write-Warning "Port $Port is still occupied by PID $($connection.OwningProcess): $commandLine"
}

$windowProcesses = Get-MatchingProcesses {
    param($Process, $CommandLine)

    return $Process.Name -eq "cmd.exe" -and (
        $CommandLine -match "title LearnSite API $ApiPort" -or
        $CommandLine -match "title LearnSite Web $WebPort"
    )
}

Stop-ProcessTree -Processes $windowProcesses -Label "window"

$apiProcesses = Get-MatchingProcesses {
    param($Process, $CommandLine)

    return $CommandLine -match "uvicorn app\.main:app" -and
        $CommandLine -match "--port $ApiPort" -and
        $CommandLine -match "--app-dir apps/api"
}

Stop-ProcessTree -Processes $apiProcesses -Label "API"

$webProcesses = Get-MatchingProcesses {
    param($Process, $CommandLine)

    return $CommandLine -match "vite" -and
        $CommandLine -match "--port $WebPort" -and
        $CommandLine -match $repoRootRegex
}

Stop-ProcessTree -Processes $webProcesses -Label "Web"

Start-Sleep -Seconds 1

Show-PortStatus -Port $ApiPort
Show-PortStatus -Port $WebPort
