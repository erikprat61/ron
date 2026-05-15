import type { NationalWeatherServiceConfig } from "@ron/contract";
import { JsonHttpClient } from "@ron/http";

export interface NwsPointProperties extends Record<string, unknown> {
  forecastZone?: string;
  fireWeatherZone?: string;
  county?: string;
  nwr?: Record<string, unknown>;
}

export interface NwsPointsResponse {
  properties?: NwsPointProperties;
}

export class NwsPointsClient {
  private readonly httpClient: JsonHttpClient;

  constructor(config: NationalWeatherServiceConfig) {
    this.httpClient = new JsonHttpClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      headers: {
        Accept: "application/geo+json",
        "User-Agent": config.userAgent
      }
    });
  }

  getPoint(latitude: number, longitude: number): Promise<NwsPointsResponse> {
    return this.httpClient.getJson<NwsPointsResponse>(`points/${latitude},${longitude}`);
  }
}
