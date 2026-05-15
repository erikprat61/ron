import type { SourceHealthResponse, UpstreamSourceKind } from "@ron/contract";
import type { DisasterCatalogService } from "@ron/service-disaster-catalog";
import { UpstreamHealthMonitor } from "@ron/http";

const ancillarySources: UpstreamSourceKind[] = ["zippopotam", "nws-points", "tigerweb"];

export class SourceHealthService {
  constructor(
    private readonly catalogService: DisasterCatalogService,
    private readonly healthMonitor: UpstreamHealthMonitor
  ) {}

  async getSourceHealth(): Promise<SourceHealthResponse> {
    const snapshot = await this.catalogService.getSnapshot();
    const items = [...snapshot.sourceHealth, ...this.healthMonitor.snapshot(ancillarySources)];

    return {
      generatedAt: snapshot.generatedAt,
      items
    };
  }
}
