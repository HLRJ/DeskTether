Set-StrictMode -Version Latest

function Get-DeskTetherTunnelRelease {
    [CmdletBinding()]
    param()

    $version = 'v0.0.14'
    $archiveName = "tunnel-client-$version-windows-amd64.zip"
    $baseUrl = "https://github.com/openai/tunnel-client/releases/download/$version"

    [pscustomobject]@{
        Version = $version
        ArchiveName = $archiveName
        ArchiveUrl = "$baseUrl/$archiveName"
        ChecksumUrl = "$baseUrl/SHA256SUMS.txt"
    }
}

function Get-DeskTetherMcpCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot
    )

    $entryPoint = Join-Path $ProjectRoot 'apps\mcp-server\dist\index.js'
    return "node `"$entryPoint`""
}
function Get-DeskTetherTunnelStatePaths {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot,
        [string]$ProfileName = 'desktether-local'
    )

    $safeProfile = $ProfileName -replace '[^A-Za-z0-9_.-]', '_'
    $stateDir = Join-Path $ProjectRoot '.tools\tunnel-state'
    [pscustomobject]@{
        Directory = $stateDir
        PidFile = Join-Path $stateDir "$safeProfile.pid"
        HealthUrlFile = Join-Path $stateDir "$safeProfile.health-url"
    }
}

function Get-DeskTetherTunnelRunArguments {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProfileName,
        [Parameter(Mandatory = $true)]
        $StatePaths
    )

    return @(
        'run',
        '--profile', $ProfileName,
        '--health.listen-addr', '127.0.0.1:0',
        '--health.url-file', $StatePaths.HealthUrlFile,
        '--pid.file', $StatePaths.PidFile
    )
}

function Assert-DeskTetherTunnelEnvironment {
    [CmdletBinding()]
    param()

    $missing = @()
    if ([string]::IsNullOrWhiteSpace($env:CONTROL_PLANE_TUNNEL_ID)) {
        $missing += 'CONTROL_PLANE_TUNNEL_ID'
    }
    if ([string]::IsNullOrWhiteSpace($env:CONTROL_PLANE_API_KEY)) {
        $missing += 'CONTROL_PLANE_API_KEY'
    }

    if ($missing.Count -gt 0) {
        throw "Missing required environment variables: $($missing -join ', ')"
    }

    return $true
}

Export-ModuleMember -Function @(
    'Get-DeskTetherTunnelRelease',
    'Get-DeskTetherMcpCommand',
    'Get-DeskTetherTunnelStatePaths',
    'Get-DeskTetherTunnelRunArguments',
    'Assert-DeskTetherTunnelEnvironment'
)
