# Starts the PG Manager backend: a local Supabase stack (Postgres, Auth, API, Studio) in Docker,
# applies supabase/migrations, and points the frontend at it.
# Usage:  .\start-backend.cmd            start (first run downloads Docker images, ~5 min)
#         .\start-backend.cmd -Reset     start and wipe the database (re-runs migrations)
#         .\stop-backend.cmd             stop, and switch the frontend back to demo mode
param([switch]$Stop, [switch]$Reset)

$projectRoot = Split-Path $PSScriptRoot -Parent
if (Test-Path (Join-Path $projectRoot 'package.json')) {
  $app = $projectRoot
} elseif (Test-Path (Join-Path $projectRoot 'pg-manager\package.json')) {
  $app = Resolve-Path (Join-Path $projectRoot 'pg-manager')
} else {
  $app = $projectRoot
}
Set-Location $app
$Host.UI.RawUI.WindowTitle = 'PG Manager - Backend'

$supabase = @('-y', 'supabase@3.1.0')
$envFile = Join-Path $app 'src\environments\environment.ts'

function Set-FrontendBackend([string]$url, [string]$key) {
  $c = [IO.File]::ReadAllText($envFile)
  $c = $c -replace "supabaseUrl: '[^']*'", "supabaseUrl: '$url'"
  $c = $c -replace "supabaseAnonKey: '[^']*'", "supabaseAnonKey: '$key'"
  [IO.File]::WriteAllText($envFile, $c)
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host 'Docker is not installed. The local backend runs in Docker.' -ForegroundColor Red
  Write-Host ' 1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/'
  Write-Host ' 2. Start it, wait until it says "Engine running", then run start-backend again.'
  Write-Host 'Alternative: use a free cloud project instead (see supabase\README.md).'
  Write-Host 'The frontend still works in DEMO mode without a backend.' -ForegroundColor Yellow
  exit 1
}

if ($Stop) {
  npx @supabase stop
  Set-FrontendBackend '' ''
  Write-Host 'Backend stopped. Frontend switched back to DEMO mode.' -ForegroundColor Yellow
  exit 0
}

docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker Desktop is installed but not running. Start it, wait for "Engine running", then try again.' -ForegroundColor Red
  exit 1
}

# Phone login is enabled locally with dummy SMS settings; only the test numbers in config.toml can log in.
$env:SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN = 'local-dev'

Write-Host 'Starting local Supabase (first run downloads images, be patient)...' -ForegroundColor Cyan
npx @supabase start
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Reset) {
  Write-Host 'Resetting database and re-applying migrations...' -ForegroundColor Cyan
  npx @supabase db reset
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Read the local URL + public key and write them into the frontend environment.
$vars = @{}
foreach ($line in (npx @supabase status -o env)) {
  if ($line -match '^([A-Z_]+)="?([^"]*)"?$') { $vars[$Matches[1]] = $Matches[2] }
}
$url = $vars['API_URL']
$key = if ($vars['ANON_KEY']) { $vars['ANON_KEY'] } else { $vars['PUBLISHABLE_KEY'] }
if (-not $url -or -not $key) {
  Write-Host 'Could not read API_URL / ANON_KEY from "supabase status". Copy them into environment.ts by hand.' -ForegroundColor Red
  exit 1
}
Set-FrontendBackend $url $key

Write-Host ''
Write-Host '================ Backend is running ================' -ForegroundColor Green
Write-Host "API:            $url"
Write-Host "Studio (DB UI): $($vars['STUDIO_URL'])"
Write-Host 'Frontend now uses this backend (it reloads automatically if already running).'
Write-Host ''
Write-Host 'Demo accounts in "Sunshine PG (Boys)" (OTP is 123456 for all):'
Write-Host '  9000000001  Owner'
Write-Host '  9000000002  Renter: Rahul Verma, Room 101 (rent overdue)'
Write-Host '  9000000003  Renter: Aman Gupta, Room 101 (paid; Rahul''s roommate)'
Write-Host '  9000000004  New user: log in, then join with invite code KARTIK'
Write-Host 'Use a separate incognito window for each account to see them side by side.'
Write-Host ''
Write-Host 'The backend keeps running in Docker after you close this window. Stop it with stop-backend.cmd' -ForegroundColor Yellow
exit 0
