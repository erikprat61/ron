#!/usr/bin/env bash
set -u

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir" || exit 1

if ! command -v dotnet >/dev/null 2>&1; then
  echo "[error] The .NET SDK was not found on PATH."
  exit 1
fi

export ASPNETCORE_ENVIRONMENT=Development
export ASPNETCORE_URLS=http://localhost:5096

echo "[1/2] Restoring solution..."
if ! dotnet restore DisasterTracker.slnx; then
  exit_code=$?
  echo
  echo "[error] Restore failed with exit code ${exit_code}."
  exit "${exit_code}"
fi

echo
echo "[2/2] Starting Disaster Tracker API..."
echo
echo "OpenAPI:  http://localhost:5096/openapi/v1.json"
echo "Health:   http://localhost:5096/health"
echo "ZIP test: http://localhost:5096/api/disasters/zip/90210"
echo
echo "Press Ctrl+C to stop."
echo

exec dotnet run --project src/DisasterTracker.Api --no-launch-profile
