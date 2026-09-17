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

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$command = Get-DeskTetherMcpCommand -ProjectRoot $projectRoot
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

$statePaths = Get-DeskTetherTunnelStatePaths -ProjectRoot $projectRoot -ProfileName 'desk/test'
Assert-Contains $statePaths.PidFile '.tools\tunnel-state' 'PID file must live in ignored tunnel state'
Assert-Contains $statePaths.HealthUrlFile '.tools\tunnel-state' 'Health URL file must live in ignored tunnel state'
Assert-Contains $statePaths.PidFile 'desk_test' 'Profile name must be safe for filenames'

$runArgs = Get-DeskTetherTunnelRunArguments -ProfileName 'desktether-local' -StatePaths $statePaths
$joinedRunArgs = $runArgs -join ' '
Assert-Contains $joinedRunArgs '--health.listen-addr 127.0.0.1:0' 'Tunnel must use an ephemeral loopback health port'
Assert-Contains $joinedRunArgs '--health.url-file' 'Tunnel run must publish a health URL file'
Assert-Contains $joinedRunArgs '--pid.file' 'Tunnel run must publish a PID file'

Write-Host 'Tunnel module tests passed.'
$scriptNames = @(
    'Install-TunnelClient.ps1',
    'Connect-DeskTetherTunnel.ps1',
    'Get-DeskTetherTunnelStatus.ps1'
)
foreach ($scriptName in $scriptNames) {
    $scriptPath = Join-Path $PSScriptRoot $scriptName
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Required tunnel script is missing: $scriptName"
    }

    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        $scriptPath,
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null
    if ($parseErrors.Count -gt 0) {
        throw "PowerShell syntax errors in ${scriptName}: $($parseErrors[0].Message)"
    }

    $source = Get-Content -LiteralPath $scriptPath -Raw
    if ($source -match 'sk-[A-Za-z0-9_-]{20,}') {
        throw "Possible hard-coded OpenAI key found in $scriptName"
    }
}

Write-Host 'Tunnel script tests passed.'

$missingBin = Join-Path $projectRoot '.tools\missing-tunnel-client.exe'
$statusRaw = & (Join-Path $PSScriptRoot 'Get-DeskTetherTunnelStatus.ps1') -TunnelClientBin $missingBin
$status = (($statusRaw | Out-String).Trim()) | ConvertFrom-Json
Assert-Equal $status.installed $false 'Missing tunnel client must report installed=false'
Assert-Equal $status.running $false 'Missing tunnel client must report running=false'
Assert-Equal $status.status 'not_installed' 'Missing tunnel client must report not_installed'

$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
foreach ($scriptName in @('tunnel:doctor', 'tunnel:start', 'tunnel:status')) {
    if (-not $packageJson.scripts.PSObject.Properties.Name.Contains($scriptName)) {
        throw "Missing package script: $scriptName"
    }
}
Write-Host 'Tunnel package scripts passed.'

$fakeDir = Join-Path $projectRoot '.tools\tunnel-test'
New-Item -ItemType Directory -Force -Path $fakeDir | Out-Null
$fakeClient = Join-Path $fakeDir 'fake-tunnel-client.ps1'
$fakeLog = Join-Path $fakeDir 'calls.log'
@'
($args -join ' ') | Add-Content -LiteralPath $env:DESKTETHER_TEST_TUNNEL_LOG
exit 0
'@ | Set-Content -LiteralPath $fakeClient -Encoding utf8
Remove-Item -LiteralPath $fakeLog -ErrorAction SilentlyContinue

$oldTestLog = $env:DESKTETHER_TEST_TUNNEL_LOG
$oldTestTunnelId = $env:CONTROL_PLANE_TUNNEL_ID
$oldTestApiKey = $env:CONTROL_PLANE_API_KEY
try {
    $env:DESKTETHER_TEST_TUNNEL_LOG = $fakeLog
    $env:CONTROL_PLANE_TUNNEL_ID = 'tunnel_test'
    $env:CONTROL_PLANE_API_KEY = 'test-api-key'
    & (Join-Path $PSScriptRoot 'Connect-DeskTetherTunnel.ps1') -TunnelClientBin $fakeClient
    if ($LASTEXITCODE -ne 0) { throw 'Connect script failed with fake tunnel client.' }

    $calls = Get-Content -LiteralPath $fakeLog
    $runCall = $calls | Where-Object { $_ -like 'run *' } | Select-Object -Last 1
    Assert-Contains $runCall '--health.listen-addr 127.0.0.1:0' 'Connect run must use loopback ephemeral health'
    Assert-Contains $runCall '--health.url-file' 'Connect run must publish health URL'
    Assert-Contains $runCall '--pid.file' 'Connect run must publish PID'
} finally {
    if ($null -eq $oldTestLog) { Remove-Item Env:DESKTETHER_TEST_TUNNEL_LOG -ErrorAction SilentlyContinue }
    else { $env:DESKTETHER_TEST_TUNNEL_LOG = $oldTestLog }
    if ($null -eq $oldTestTunnelId) { Remove-Item Env:CONTROL_PLANE_TUNNEL_ID -ErrorAction SilentlyContinue }
    else { $env:CONTROL_PLANE_TUNNEL_ID = $oldTestTunnelId }
    if ($null -eq $oldTestApiKey) { Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue }
    else { $env:CONTROL_PLANE_API_KEY = $oldTestApiKey }
}
Write-Host 'Tunnel Connect integration test passed.'
