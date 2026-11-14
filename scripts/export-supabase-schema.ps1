# Exports application-owned Supabase schemas without Docker.
# Requires PostgreSQL 17+ client tools (pg_dump) and SCMS_DATABASE_URL in the environment.
[CmdletBinding()]
param([string]$OutputPath = "supabase/schema.sql")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($env:SCMS_DATABASE_URL)) {
    throw "SCMS_DATABASE_URL is not set. Set it in this terminal session. Never commit it or paste it into chat."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    throw "pg_dump was not found. Install PostgreSQL 17+ command-line tools and ensure pg_dump is on PATH. Docker is not required."
}
$versionText = (& pg_dump --version 2>&1 | Out-String).Trim()
if ($versionText -notmatch '([0-9]+)\.') { throw "Could not determine pg_dump version: $versionText" }
if ([int]$Matches[1] -lt 17) { throw "PostgreSQL 17+ pg_dump is required. Found: $versionText" }
$outputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $outputFullPath
if (-not (Test-Path $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null }
& pg_dump --schema-only --no-owner --no-privileges --schema=public --schema=private --schema=extensions --file="$outputFullPath" "$env:SCMS_DATABASE_URL"
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }
if (-not (Test-Path $outputFullPath) -or (Get-Item $outputFullPath).Length -lt 1000) { throw "Output is missing or unexpectedly small; inspect before committing." }
Write-Host "Schema export created: $outputFullPath"
Write-Host "Review before committing. This file contains schema definitions, not application data."
