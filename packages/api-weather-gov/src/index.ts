import type { NationalWeatherServiceConfig } from "@ron/contract";
import { JsonHttpClient } from "@ron/http";

export interface WeatherGovAlertFeature {
  id?: string;
  geometry?: unknown;
  properties?: Record<string, unknown>;
}

export interface WeatherGovActiveAlertsResponse {
  features?: WeatherGovAlertFeature[];
}

export class WeatherGovClient {
  private readonly httpClient: JsonHttpClient;

  constructor(private readonly config: NationalWeatherServiceConfig) {
    this.httpClient = new JsonHttpClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      headers: {
        Accept: "application/geo+json",
        "User-Agent": config.userAgent
      }
    });
  }

  getActiveAlerts(): Promise<WeatherGovActiveAlertsResponse> {
    return this.httpClient.getJson<WeatherGovActiveAlertsResponse>("alerts/active");
  }
}
