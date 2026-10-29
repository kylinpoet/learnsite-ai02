# Shared helpers for scripts/dev-up.ps1 and scripts/dev-down.ps1.
#
# These helpers deliberately avoid WMI-backed cmdlets (Get-CimInstance,
# Get-NetTCPConnection, Get-Process -CommandLine). When the WMI service hangs, those
# calls never return and the dev scripts hang silently instead of failing loudly.
# netstat -ano and the .NET process API are not affected.

function Get-ListeningProcessId {
    param([int]$Port)

    $pattern = '^\s*TCP\s+\S+:{0}\s+\S+\s+LISTENING\s+(\d+)\s*$' -f $Port

    foreach ($line in (netstat -ano)) {
        $match = [regex]::Match($line, $pattern)
        if ($match.Success) {
            return [int]$match.Groups[1].Value
        }
    }

    return $null
}

function Test-HttpBodyContains {
    param(
        [int]$Port,
        [string]$Path,
        [string]$Pattern,
        [int]$TimeoutSeconds = 3
    )

    try {
        $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port$Path")
        $request.Timeout = $TimeoutSeconds * 1000
        $request.Proxy = $null

        $response = $request.GetResponse()
        try {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            try {
                $body = $reader.ReadToEnd()
            } finally {
                $reader.Dispose()
            }
        } finally {
            $response.Close()
        }

        return $body -match $Pattern
    } catch {
        return $false
    }
}

function Get-DevStateFilePath {
    return Join-Path $env:TEMP "learnsite-dev-windows.txt"
}

function Set-DevWindowRecord {
    param(
        [string]$Role,
        [int]$WindowProcessId,
        [long]$StartedAtTicks
    )

    $stateFilePath = Get-DevStateFilePath
    $records = [ordered]@{}

    if (Test-Path $stateFilePath) {
        foreach ($line in (Get-Content -Path $stateFilePath)) {
            $parts = $line -split '\|'
            if ($parts.Count -eq 3) {
                $records[$parts[0]] = $line
            }
        }
    }

    $records[$Role] = "$Role|$WindowProcessId|$StartedAtTicks"
    Set-Content -Path $stateFilePath -Value @($records.Values) -Encoding ASCII
}

function Get-DevWindowRecords {
    $stateFilePath = Get-DevStateFilePath
    if (-not (Test-Path $stateFilePath)) {
        return @()
    }

    $records = @()
    foreach ($line in (Get-Content -Path $stateFilePath)) {
        $parts = $line -split '\|'
        if ($parts.Count -ne 3) {
            continue
        }

        $records += [pscustomobject]@{
            Role           = $parts[0]
            ProcessId      = [int]$parts[1]
            StartedAtTicks = [long]$parts[2]
        }
    }

    return $records
}

function Remove-DevStateFile {
    Remove-Item -Path (Get-DevStateFilePath) -Force -ErrorAction SilentlyContinue
}
