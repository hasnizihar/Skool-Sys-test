param (
    [string]$OutputFile = "SkoolSys_PR004S_Clean_Source.zip"
)

$RepoRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $RepoRoot

Write-Host "Packaging SkoolSys PR-004S clean source distribution..." -ForegroundColor Cyan

if (Test-Path $OutputFile) {
    Remove-Item $OutputFile -Force
}

$StageDir = Join-Path $env:TEMP "skoolsys_stage_$(Get-Random)"
if (Test-Path $StageDir) {
    Remove-Item $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StageDir | Out-Null

$ExcludedPatterns = @(
    "node_modules",
    "dist",
    "build",
    ".git",
    ".agents",
    "backups",
    "*.db",
    "*.db-wal",
    "*.db-shm",
    "*.db-journal",
    "*.zip"
)

Get-ChildItem -Path $RepoRoot -Recurse | ForEach-Object {
    $item = $_
    $relPath = $item.FullName.Substring($RepoRoot.Path.Length + 1)
    
    $exclude = $false
    foreach ($pattern in $ExcludedPatterns) {
        if ($relPath -like "*$pattern*" -or $item.Name -like $pattern) {
            $exclude = $true
            break
        }
    }
    
    # Strictly exclude real .env files, but explicitly preserve .env.example templates
    if ($item.Name -eq ".env" -or ($item.Name -like ".env.*" -and $item.Name -ne ".env.example")) {
        $exclude = $true
    }

    if ($item.Extension -in @(".db", ".db-wal", ".db-shm", ".db-journal")) {
        $exclude = $true
    }

    if (-not $exclude) {
        $targetPath = Join-Path $StageDir $relPath
        if ($item.PSIsContainer) {
            if (-not (Test-Path $targetPath)) {
                New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
            }
        } else {
            $targetDir = Split-Path $targetPath -Parent
            if (-not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            Copy-Item -Path $item.FullName -Destination $targetPath -Force
        }
    }
}

Compress-Archive -Path "$StageDir\*" -DestinationPath $OutputFile -CompressionLevel Optimal

$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $OutputFile))
$violations = @()
$examplesFound = @()
foreach ($entry in $archive.Entries) {
    if ($entry.FullName -like "*.db" -or $entry.FullName -like "*.db-*" -or ($entry.Name -like ".env*" -and $entry.Name -ne ".env.example")) {
        $violations += $entry.FullName
    }
    if ($entry.Name -eq ".env.example") {
        $examplesFound += $entry.FullName
    }
}
$archive.Dispose()

Remove-Item $StageDir -Recurse -Force

if ($violations.Count -gt 0) {
    Write-Host "FATAL: Archive contains forbidden database or environment files:" -ForegroundColor Red
    foreach ($v in $violations) {
        Write-Host " - $v" -ForegroundColor Red
    }
    Remove-Item $OutputFile -Force
    exit 1
} else {
    $zipBytes = (Get-Item $OutputFile).Length
    $zipMb = [Math]::Round(($zipBytes / 1048576), 2)
    Write-Host "Verified clean source archive created: $OutputFile ($zipMb MB)" -ForegroundColor Green
    Write-Host "Zero .env, zero database files, zero WAL/SHM files included." -ForegroundColor Green
    Write-Host "Preserved templates: $($examplesFound -join ', ')" -ForegroundColor Cyan
    
    if ($OutputFile -eq "SkoolSys_PR004S_Clean_Source.zip") {
        Copy-Item $OutputFile "SkoolSys_PR004R_Clean_Source.zip" -Force
        Write-Host "Synchronized duplicate to SkoolSys_PR004R_Clean_Source.zip for dual compatibility." -ForegroundColor Cyan
    }
}
