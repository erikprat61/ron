import type { ZipBoundaryConfig } from "@ron/contract";
import { JsonHttpClient } from "@ron/http";

export interface TigerWebFeature extends Record<string, unknown> {
  geometry?: unknown;
}

export interface TigerWebBoundaryResponse {
  features?: TigerWebFeature[];
}

export class TigerWebClient {
  private readonly httpClient: JsonHttpClient;

  constructor(config: ZipBoundaryConfig) {
    this.httpClient = new JsonHttpClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      headers: {
        Accept: "application/geo+json"
      }
    });
  }

  getZipBoundary(zipCode: string): Promise<TigerWebBoundaryResponse> {
    const where = encodeURIComponent(`ZCTA5='${zipCode}'`);
    return this.httpClient.getJson<TigerWebBoundaryResponse>(
      `query?where=${where}&returnGeometry=true&outFields=ZCTA5&f=geojson`
    );
  }
}
