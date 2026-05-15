import type { UsgsConfig } from "@ron/contract";
import { JsonHttpClient } from "@ron/http";

export interface UsgsFeature extends Record<string, unknown> {
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: Record<string, unknown>;
}

export interface UsgsAllDayResponse {
  features?: UsgsFeature[];
}

export class UsgsClient {
  private readonly httpClient: JsonHttpClient;

  constructor(config: UsgsConfig) {
    this.httpClient = new JsonHttpClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs
    });
  }

  getAllDayEarthquakes(): Promise<UsgsAllDayResponse> {
    return this.httpClient.getJson<UsgsAllDayResponse>("earthquakes/feed/v1.0/summary/all_day.geojson");
  }
}
