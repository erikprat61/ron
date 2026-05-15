import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { upstreamSourceKinds } from "@ron/contract";
import { EonetClient } from "@ron/api-eonet";
import { OpenFemaClient } from "@ron/api-openfema";
import { TigerWebClient } from "@ron/api-census-tigerweb";
import { NwsPointsClient } from "@ron/api-nws-points";
import { UsgsClient } from "@ron/api-usgs";
import { WeatherGovClient } from "@ron/api-weather-gov";
import { ZippopotamClient } from "@ron/api-zippopotam";
import { UpstreamHealthMonitor } from "@ron/http";
import { DisasterCatalogService } from "@ron/service-disaster-catalog";
import { ResourceImpactService } from "@ron/service-resource-impact";
import { SourceHealthService } from "@ron/service-source-health";
import { ZipContextService } from "@ron/service-zip-context";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const repoRoot = resolve(currentDirectory, "../../..");

export function createRonApiServer() {
  const config = loadConfig();
  const healthMonitor = new UpstreamHealthMonitor([...upstreamSourceKinds]);
  const resourceImpactService = new ResourceImpactService(resolve(repoRoot, config.supplyImpact.resourceProfilePath));

  const disasterCatalogService = new DisasterCatalogService({
    config,
    weatherGovClient: new WeatherGovClient(config.nationalWeatherService),
    openFemaClient: new OpenFemaClient(config.fema),
    usgsClient: new UsgsClient(config.usgs),
    eonetClient: new EonetClient(config.eonet),
    resourceImpactService
  });

  const zipContextService = new ZipContextService({
    config,
    zippopotamClient: new ZippopotamClient(config.zipCodeLookup),
    nwsPointsClient: new NwsPointsClient(config.nationalWeatherService),
    tigerWebClient: new TigerWebClient(config.zipBoundary),
    healthMonitor
  });

  const sourceHealthService = new SourceHealthService(disasterCatalogService, healthMonitor);
  const app = createApp({
    config,
    disasterCatalogService,
    zipContextService,
    sourceHealthService
  });

  return {
    config,
    app,
    disasterCatalogService
  };
}

if (import.meta.main) {
  const { config, app, disasterCatalogService } = createRonApiServer();

  if (config.disasterRefresh.warmCacheOnStartup) {
    void disasterCatalogService.getSnapshot().catch(() => undefined);
  }

  if (config.disasterRefresh.backgroundRefreshEnabled) {
    setInterval(() => {
      void disasterCatalogService.refresh().catch(() => undefined);
    }, config.disasterRefresh.backgroundRefreshIntervalMs);
  }

  Bun.serve({
    port: config.port,
    fetch: app.fetch
  });

  console.log(`Ron API listening on http://localhost:${config.port}`);
}
