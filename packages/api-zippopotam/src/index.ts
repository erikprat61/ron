import type { ZipCodeLookupConfig } from "@ron/contract";
import { JsonHttpClient } from "@ron/http";

export interface ZippopotamPlace {
  "place name"?: string;
  latitude?: string;
  longitude?: string;
  "state abbreviation"?: string;
}

export interface ZippopotamZipLookupResponse {
  places?: ZippopotamPlace[];
}

export class ZippopotamClient {
  private readonly httpClient: JsonHttpClient;

  constructor(config: ZipCodeLookupConfig) {
    this.httpClient = new JsonHttpClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs
    });
  }

  getZip(zipCode: string): Promise<ZippopotamZipLookupResponse> {
    return this.httpClient.getJson<ZippopotamZipLookupResponse>(`us/${zipCode}`);
  }
}
