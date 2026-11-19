# Starts the PG Manager frontend (Ionic/Angular dev server) at http://localhost:4200
# Usage:  .\start-frontend.cmd           (or the VS Code task "Frontend")

$projectRoot = Split-Path $PSScriptRoot -Parent
if (Test-Path (Join-Path $projectRoot 'package.json')) {
  $app = $projectRoot
} elseif (Test-Path (Join-Path $projectRoot 'pg-manager\package.json')) {
  $app = Resolve-Path (Join-Path $projectRoot 'pg-manager')
} else {
  $app = $projectRoot
}
Set-Location $app
$Host.UI.RawUI.WindowTitle = 'PG Manager - Frontend'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is not installed. Install the LTS version from https://nodejs.org and try again.' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing packages (first run only)...' -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Show which mode the app will run in.
$envFile = 'src\environments\environment.ts'
if (Select-String -Path $envFile -Pattern "supabaseUrl: ''" -Quiet) {
  Write-Host 'Mode: DEMO (no backend; sample data on this device). Run start-backend to use the real backend.' -ForegroundColor Yellow
} else {
  $url = (Select-String -Path $envFile -Pattern "supabaseUrl: '([^']*)'").Matches[0].Groups[1].Value
  Write-Host "Mode: LIVE backend at $url" -ForegroundColor Green
}

$ngArgs = @('serve', '--host', 'localhost', '--port', '4200', '--open')

# Angular 22 needs Node 22.22.3+, 24.15+ or 26+. If the installed Node is older, borrow a newer one via npx.
$v = [version]((node --version).Trim().TrimStart('v'))
$supported = ($v.Major -ge 26) -or ($v.Major -eq 24 -and $v -ge [version]'24.15.0') -or ($v.Major -eq 22 -and $v -ge [version]'22.22.3')

Write-Host 'Starting dev server on http://localhost:4200 (Ctrl+C to stop)...' -ForegroundColor Cyan
if ($supported) {
  npx ng @ngArgs
} else {
  Write-Host "Node $v is too old for Angular 22, so using Node 24.15 via npx. Upgrade Node to remove this step." -ForegroundColor Yellow
  npx -y -p node@24.15.0 node node_modules/@angular/cli/bin/ng.js @ngArgs
}
exit $LASTEXITCODE
