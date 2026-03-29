@echo off
setlocal

pushd "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 (
    echo [error] The .NET SDK was not found on PATH.
    popd
    exit /b 1
)

set "ASPNETCORE_ENVIRONMENT=Development"
set "ASPNETCORE_URLS=http://localhost:5096"

echo [1/2] Restoring solution...
dotnet restore DisasterTracker.slnx
if errorlevel 1 (
    set "exit_code=%errorlevel%"
    echo.
    echo [error] Restore failed with exit code %exit_code%.
    popd
    exit /b %exit_code%
)

echo.
echo [2/2] Starting Disaster Tracker API...
echo.
echo OpenAPI:  http://localhost:5096/openapi/v1.json
echo Health:   http://localhost:5096/health
echo ZIP test: http://localhost:5096/api/disasters/zip/90210
echo.
echo Press Ctrl+C to stop.
echo.

dotnet run --project src\DisasterTracker.Api --no-launch-profile
set "exit_code=%errorlevel%"

popd
exit /b %exit_code%
