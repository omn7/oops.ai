# Oops CLI Installation Script for Windows

Write-Host "Installing Oops AI Code Review Assistant..." -ForegroundColor Cyan

# Check for Git
if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Git is required but not installed. Please install Git and try again." -ForegroundColor Red
    exit 1
}

# Check for Node.js
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js/npm is required but not installed. Please install Node.js and try again." -ForegroundColor Red
    exit 1
}

$installDir = Join-Path $HOME ".oops-cli"

# Remove existing installation if present
if (Test-Path $installDir) {
    Write-Host "Removing previous installation..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $installDir
}

Write-Host "Cloning Oops repository..." -ForegroundColor Cyan
git clone -q "https://github.com/omn7/oops.ai.git" $installDir

if (-not (Test-Path $installDir)) {
    Write-Host "Error: Failed to clone repository." -ForegroundColor Red
    exit 1
}

Push-Location $installDir

Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install --silent

Write-Host "Linking Oops globally..." -ForegroundColor Cyan
npm link

Pop-Location

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host " ✓ Oops CLI installed successfully!                " -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""
Write-Host "To configure your AI and get started, run:" -ForegroundColor White
Write-Host "    oops start" -ForegroundColor Cyan
Write-Host ""
