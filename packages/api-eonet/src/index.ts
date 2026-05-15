import type { EonetConfig } from "@ron/contract";
import { JsonHttpClient } from "@ron/http";

export interface EonetEvent extends Record<string, unknown> {
  id?: string;
}

export interface EonetEventsResponse {
  events?: EonetEvent[];
}

export class EonetClient {
  private readonly httpClient: JsonHttpClient;

  constructor(private readonly config: EonetConfig) {
    this.httpClient = new JsonHttpClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs
    });
  }

  getOpenEvents(): Promise<EonetEventsResponse> {
    return this.httpClient.getJson<EonetEventsResponse>(`events?status=open&limit=${this.config.maxRecords}`);
  }
}
