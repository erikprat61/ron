import type { FemaConfig } from "@ron/contract";
import { JsonHttpClient } from "@ron/http";

export interface OpenFemaDeclarationRecord extends Record<string, unknown> {
  id?: string;
}

export interface OpenFemaDisasterDeclarationsResponse {
  DisasterDeclarationsSummaries?: OpenFemaDeclarationRecord[];
}

export class OpenFemaClient {
  private readonly httpClient: JsonHttpClient;

  constructor(private readonly config: FemaConfig) {
    this.httpClient = new JsonHttpClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs
    });
  }

  getDisasterDeclarations(now = new Date()): Promise<OpenFemaDisasterDeclarationsResponse> {
    const earliestDeclaration = new Date(now.getTime() - this.config.activeWindowDays * 24 * 60 * 60 * 1000);
    const filter = encodeURIComponent(
      `incidentEndDate eq null and declarationDate ge '${earliestDeclaration.toISOString().replace(/\.\d{3}Z$/, ".000Z")}'`
    );
    const requestUri =
      `DisasterDeclarationsSummaries?$top=${this.config.maxRecords}&$filter=${filter}&$orderby=declarationDate desc`;
    return this.httpClient.getJson<OpenFemaDisasterDeclarationsResponse>(requestUri);
  }
}
