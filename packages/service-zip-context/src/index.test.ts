import { describe, expect, it } from "bun:test";
import { UpstreamHealthMonitor } from "@ron/http";
import { defaultRonConfig } from "@ron/contract";
import { ZipContextService } from "./index.ts";

describe("ZipContextService", () => {
  it("matches county-based FEMA events", async () => {
    const service = new ZipContextService({
      config: defaultRonConfig,
      healthMonitor: new UpstreamHealthMonitor(),
      zippopotamClient: {
        async getZip() {
          return {
            places: [
              {
                "place name": "San Francisco",
                latitude: "37.7749",
                longitude: "-122.4194",
                "state abbreviation": "CA"
              }
            ]
          };
        }
      } as never,
      nwsPointsClient: {
        async getPoint() {
          return {
            properties: {
              county: "https://api.weather.gov/zones/county/CAC075"
            }
          };
        }
      } as never,
      tigerWebClient: {
        async getZipBoundary() {
          return { features: [] };
        }
      } as never
    });

    const location = await service.resolve("94103");
    const matches = service.match(location, [
      {
        id: "fema-1",
        source: "fema",
        sourceEventId: "1",
        title: "Flood declaration",
        category: "flood",
        severity: "severe",
        status: "active",
        startedAt: new Date().toISOString(),
        endTimeConfidence: "none",
        endTimeExplanation: "No end time.",
        summary: "Flood declaration",
        stateCodes: ["CA"],
        countyFipsCodes: ["075"],
        zoneIds: [],
        footprintPolygons: [],
        impactedResources: []
      }
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchKind).toBe("county");
  });
});
