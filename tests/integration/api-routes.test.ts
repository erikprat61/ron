import { describe, expect, it } from "bun:test";
import { createApp } from "../../apps/api/src/app.ts";
import { defaultRonConfig } from "@ron/contract";

describe("API routes", () => {
  it("returns the disasters envelope", async () => {
    const app = createApp({
      config: defaultRonConfig,
      disasterCatalogService: {
        async getSnapshot() {
          return {
            generatedAt: "2026-05-14T17:41:00Z",
            events: [
              {
                id: "nws-1",
                source: "nws",
                sourceEventId: "abc",
                title: "Flood Warning",
                category: "flood",
                severity: "severe",
                status: "active",
                startedAt: "2026-05-14T15:00:00Z",
                endTimeConfidence: "medium",
                endTimeExplanation: "NWS expires field.",
                summary: "Flooding expected",
                stateCodes: ["CA"],
                countyFipsCodes: ["075"],
                zoneIds: [],
                footprintPolygons: [],
                impactedResources: []
              }
            ],
            sourceHealth: [],
            resourceImpacts: []
          };
        }
      } as never,
      zipContextService: {
        async resolve() {
          return {
            zipCode: "94103",
            city: "San Francisco",
            stateCode: "CA",
            zoneIds: [],
            centroid: { latitude: 37.77, longitude: -122.42 },
            boundaryPolygons: []
          };
        },
        match() {
          return [];
        }
      } as never,
      sourceHealthService: {
        async getSourceHealth() {
          return {
            generatedAt: "2026-05-14T17:41:00Z",
            items: []
          };
        }
      } as never
    });

    const response = await app.request("/disasters?source=nws");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      generatedAt: "2026-05-14T17:41:00Z",
      count: 1,
      items: [
        expect.objectContaining({
          id: "nws-1",
          source: "nws"
        })
      ]
    });
  });

  it("returns problem details for validation errors", async () => {
    const app = createApp({
      config: defaultRonConfig,
      disasterCatalogService: {
        async getSnapshot() {
          return { generatedAt: "", events: [], sourceHealth: [], resourceImpacts: [] };
        }
      } as never,
      zipContextService: {} as never,
      sourceHealthService: {
        async getSourceHealth() {
          return { generatedAt: "", items: [] };
        }
      } as never
    });

    const response = await app.request("/disasters?limit=999");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        title: "Validation error",
        status: 400
      })
    );
  });
});
