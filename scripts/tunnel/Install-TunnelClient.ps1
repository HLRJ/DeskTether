[CmdletBinding()]
param(
    [string]$InstallRoot,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'DeskTether.Tunnel.psm1') -Force

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = Join-Path $projectRoot '.tools\tunnel-client'
}

if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'DeskTether V0.2 supports the official Windows amd64 tunnel-client package only.'
}

$release = Get-DeskTetherTunnelRelease
$versionDir = Join-Path $InstallRoot $release.Version
$binaryPath = Join-Path $versionDir 'tunnel-client.exe'

if ((Test-Path -LiteralPath $binaryPath) -and -not $Force) {
    & $binaryPath --version
    if ($LASTEXITCODE -ne 0) { throw 'Existing tunnel-client failed version check.' }
    Write-Output $binaryPath
    exit 0
}
$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("desktether-tunnel-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$archivePath = Join-Path $tempDir $release.ArchiveName
$checksumPath = Join-Path $tempDir 'SHA256SUMS.txt'

try {
    & curl.exe -L --fail --silent --show-error $release.ArchiveUrl -o $archivePath
    if ($LASTEXITCODE -ne 0) { throw 'Failed to download tunnel-client archive.' }
    & curl.exe -L --fail --silent --show-error $release.ChecksumUrl -o $checksumPath
    if ($LASTEXITCODE -ne 0) { throw 'Failed to download tunnel-client checksum manifest.' }

    $checksumLine = Get-Content -LiteralPath $checksumPath |
        Where-Object { $_ -match [regex]::Escape($release.ArchiveName) } |
        Select-Object -First 1
    if (-not $checksumLine) { throw 'Archive checksum was not found in SHA256SUMS.txt.' }

    $expectedHash = ($checksumLine -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw "SHA256 mismatch for $($release.ArchiveName)."
    }

    Remove-Item -LiteralPath $versionDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $versionDir | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $versionDir -Force
    $foundBinary = Get-ChildItem -LiteralPath $versionDir -Filter 'tunnel-client.exe' -File -Recurse |
        Select-Object -First 1
    if (-not $foundBinary) { throw 'tunnel-client.exe was not found after extraction.' }

    if ($foundBinary.FullName -ne $binaryPath) {
        Copy-Item -LiteralPath $foundBinary.FullName -Destination $binaryPath -Force
    }

    & $binaryPath --version
    if ($LASTEXITCODE -ne 0) { throw 'Installed tunnel-client failed version check.' }
    Write-Output $binaryPath
} finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
