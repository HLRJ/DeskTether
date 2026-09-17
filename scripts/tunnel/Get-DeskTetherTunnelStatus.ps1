[CmdletBinding()]
param(
    [string]$ProfileName = 'desktether-local',
    [string]$TunnelClientBin
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'DeskTether.Tunnel.psm1') -Force

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$release = Get-DeskTetherTunnelRelease
$statePaths = Get-DeskTetherTunnelStatePaths -ProjectRoot $projectRoot -ProfileName $ProfileName

if ([string]::IsNullOrWhiteSpace($TunnelClientBin)) {
    $TunnelClientBin = $env:TUNNEL_CLIENT_BIN
}
if ([string]::IsNullOrWhiteSpace($TunnelClientBin)) {
    $TunnelClientBin = Join-Path $projectRoot ".tools\tunnel-client\$($release.Version)\tunnel-client.exe"
}

if (-not (Test-Path -LiteralPath $TunnelClientBin)) {
    [pscustomobject]@{
        profile = $ProfileName
        installed = $false
        running = $false
        status = 'not_installed'
    } | ConvertTo-Json -Compress
    exit 0
}
if (
    -not (Test-Path -LiteralPath $statePaths.PidFile) -or
    -not (Test-Path -LiteralPath $statePaths.HealthUrlFile)
) {
    [pscustomobject]@{
        profile = $ProfileName
        installed = $true
        running = $false
        status = 'stopped'
    } | ConvertTo-Json -Compress
    exit 0
}

$healthOutput = & $TunnelClientBin health --json --pid-file $statePaths.PidFile --url-file $statePaths.HealthUrlFile --require-control-plane-poll 2>&1
$healthExitCode = $LASTEXITCODE
$healthText = ($healthOutput | Out-String).Trim()

if ($healthExitCode -eq 0) {
    $health = $null
    try {
        $health = $healthText | ConvertFrom-Json
    } catch {
        $health = $healthText
    }

    [pscustomobject]@{
        profile = $ProfileName
        installed = $true
        running = $true
        status = 'healthy'
        health = $health
    } | ConvertTo-Json -Depth 8 -Compress
    exit 0
}

[pscustomobject]@{
    profile = $ProfileName
    installed = $true
    running = $false
    status = 'unhealthy'
    detail = $healthText
} | ConvertTo-Json -Depth 4 -Compress
exit 0
