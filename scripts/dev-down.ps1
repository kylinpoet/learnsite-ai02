param(
    [int]$ApiPort = 8010,
    [int]$WebPort = 5173
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev-common.ps1")

$expectedProcessNames = @("python", "python3", "pythonw", "node")

function Stop-ProcessTree {
    param(
        [int]$ProcessId,
        [string]$Label
    )

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return
    }

    Write-Host "Stopping $Label PID $ProcessId ($($process.ProcessName))" -ForegroundColor Yellow
    Start-Process -FilePath "$env:SystemRoot\System32\taskkill.exe" `
        -ArgumentList "/PID", "$ProcessId", "/T", "/F" `
        -WindowStyle Hidden `
        -Wait | Out-Null

    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Show-PortStatus {
    param([int]$Port)

    $processId = Get-ListeningProcessId -Port $Port
    if ($null -eq $processId) {
        Write-Host "Port $Port is now free." -ForegroundColor Green
        return
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $processName = if ($null -eq $process) { "unknown" } else { $process.ProcessName }
    Write-Warning "Port $Port is still occupied by PID $processId ($processName)."
}

# dev-up.ps1 records the console window PID of everything it launches. Killing that
# window takes its whole process tree with it (uvicorn, the vite dev server).
foreach ($record in (Get-DevWindowRecords)) {
    $process = Get-Process -Id $record.ProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        continue
    }

    # Guard against PID reuse: only kill a cmd.exe that started at the recorded moment.
    if ($process.ProcessName -ne "cmd" -or $process.StartTime.Ticks -ne $record.StartedAtTicks) {
        continue
    }

    Stop-ProcessTree -ProcessId $record.ProcessId -Label "$($record.Role) window"
}

# Servers started outside dev-up.ps1 (npm run dev:api, a manual vite) are only
# reachable through the port they listen on.
foreach ($port in @($ApiPort, $WebPort)) {
    $processId = Get-ListeningProcessId -Port $port
    if ($null -eq $processId) {
        continue
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        continue
    }

    if ($expectedProcessNames -notcontains $process.ProcessName) {
        Write-Warning "Port $port is held by PID $processId ($($process.ProcessName)). Left untouched."
        continue
    }

    Stop-ProcessTree -ProcessId $processId -Label "listener on port $port"
}

Remove-DevStateFile

Start-Sleep -Seconds 1

Show-PortStatus -Port $ApiPort
Show-PortStatus -Port $WebPort
