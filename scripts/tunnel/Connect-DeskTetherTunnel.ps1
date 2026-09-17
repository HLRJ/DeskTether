[CmdletBinding()]
param(
    [string]$ProfileName = 'desktether-local',
    [string]$TunnelClientBin,
    [switch]$DoctorOnly
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'DeskTether.Tunnel.psm1') -Force
Assert-DeskTetherTunnelEnvironment | Out-Null

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$release = Get-DeskTetherTunnelRelease

if ([string]::IsNullOrWhiteSpace($TunnelClientBin)) {
    $TunnelClientBin = $env:TUNNEL_CLIENT_BIN
}
if ([string]::IsNullOrWhiteSpace($TunnelClientBin)) {
    $TunnelClientBin = Join-Path $projectRoot ".tools\tunnel-client\$($release.Version)\tunnel-client.exe"
}
if (-not (Test-Path -LiteralPath $TunnelClientBin)) {
    $installer = Join-Path $PSScriptRoot 'Install-TunnelClient.ps1'
    $TunnelClientBin = (& $installer | Select-Object -Last 1)
}
if (-not (Test-Path -LiteralPath $TunnelClientBin)) {
    throw 'tunnel-client executable is unavailable after installation.'
}
if ([string]::IsNullOrWhiteSpace($env:DESKTETHER_ALLOWED_ROOTS)) {
    $env:DESKTETHER_ALLOWED_ROOTS = $projectRoot
}

Push-Location $projectRoot
try {
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'DeskTether build failed.' }
} finally {
    Pop-Location
}

$mcpCommand = Get-DeskTetherMcpCommand -ProjectRoot $projectRoot
& $TunnelClientBin init `
    --sample sample_mcp_stdio_local `
    --profile $ProfileName `
    --force `
    --tunnel-id $env:CONTROL_PLANE_TUNNEL_ID `
    --mcp-command $mcpCommand
if ($LASTEXITCODE -ne 0) { throw 'tunnel-client profile initialization failed.' }

& $TunnelClientBin doctor --profile $ProfileName --explain
if ($LASTEXITCODE -ne 0) { throw 'tunnel-client doctor failed.' }

if ($DoctorOnly) {
    Write-Host 'DeskTether tunnel doctor completed successfully.'
    exit 0
}
$statePaths = Get-DeskTetherTunnelStatePaths -ProjectRoot $projectRoot -ProfileName $ProfileName
New-Item -ItemType Directory -Force -Path $statePaths.Directory | Out-Null
Remove-Item -LiteralPath $statePaths.PidFile -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $statePaths.HealthUrlFile -ErrorAction SilentlyContinue
$runArgs = Get-DeskTetherTunnelRunArguments -ProfileName $ProfileName -StatePaths $statePaths

Write-Host "Starting DeskTether Secure MCP Tunnel profile '$ProfileName'."
Write-Host 'Keep this process running while ChatGPT uses DeskTether.'
& $TunnelClientBin @runArgs
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client exited with code $LASTEXITCODE."
}
