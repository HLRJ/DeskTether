$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'DeskTether.Tunnel.psm1'
Import-Module $modulePath -Force

function Assert-Equal($Actual, $Expected, $Message) {
    if ($Actual -ne $Expected) {
        throw "$Message. Expected '$Expected', got '$Actual'."
    }
}

function Assert-Contains($Actual, $Expected, $Message) {
    if (-not $Actual.Contains($Expected)) {
        throw "$Message. Expected '$Expected' in '$Actual'."
    }
}

$release = Get-DeskTetherTunnelRelease
Assert-Equal $release.Version 'v0.0.14' 'Pinned tunnel-client version changed'
Assert-Equal $release.ArchiveName 'tunnel-client-v0.0.14-windows-amd64.zip' 'Wrong Windows archive name'
Assert-Contains $release.ArchiveUrl '/releases/download/v0.0.14/' 'Archive URL is not version-pinned'
Assert-Contains $release.ChecksumUrl '/releases/download/v0.0.14/SHA256SUMS.txt' 'Checksum URL is not version-pinned'

$command = Get-DeskTetherMcpCommand -ProjectRoot 'G:\Codes\DeskTether'
Assert-Contains $command 'node' 'MCP launch command must use Node'
Assert-Contains $command 'apps\mcp-server\dist\index.js' 'MCP launch command points to wrong entrypoint'

$oldTunnelId = $env:CONTROL_PLANE_TUNNEL_ID
$oldApiKey = $env:CONTROL_PLANE_API_KEY
try {
    Remove-Item Env:CONTROL_PLANE_TUNNEL_ID -ErrorAction SilentlyContinue
    Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    $message = $null
    try {
        Assert-DeskTetherTunnelEnvironment
        throw 'Expected missing tunnel environment validation to fail.'
    } catch {
        $message = $_.Exception.Message
    }
    Assert-Contains $message 'CONTROL_PLANE_TUNNEL_ID' 'Missing tunnel id was not reported'
    Assert-Contains $message 'CONTROL_PLANE_API_KEY' 'Missing runtime API key was not reported'
} finally {
    if ($null -ne $oldTunnelId) { $env:CONTROL_PLANE_TUNNEL_ID = $oldTunnelId }
    if ($null -ne $oldApiKey) { $env:CONTROL_PLANE_API_KEY = $oldApiKey }
}

Write-Host 'Tunnel module tests passed.'