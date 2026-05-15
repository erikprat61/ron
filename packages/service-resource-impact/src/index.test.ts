import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StrategicResourceProfile } from "@ron/contract";
import { ResourceImpactService } from "./index.ts";

describe("ResourceImpactService", () => {
  it("matches profiles against active events", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "ron-impact-"));
    const profilePath = join(tempDirectory, "profiles.json");
    const profiles: StrategicResourceProfile[] = [
      {
        id: "gulf",
        resource: "Energy",
        region: "Gulf Coast",
        summary: "Energy disruption possible.",
        explanation: "Large storm over the Gulf Coast.",
        stateCodes: ["TX"],
        countyFipsCodes: [],
        locationBounds: [],
        locationKeywords: [],
        categories: ["storm"],
        minimumSeverity: "severe"
      }
    ];

    writeFileSync(profilePath, JSON.stringify(profiles));

    const service = new ResourceImpactService(profilePath);
    const signals = service.analyze([
      {
        id: "evt-1",
        source: "nws",
        sourceEventId: "1",
        title: "Severe Storm Warning",
        category: "storm",
        severity: "severe",
        status: "active",
        startedAt: new Date().toISOString(),
        endTimeConfidence: "medium",
        endTimeExplanation: "NWS expires field.",
        summary: "Storm",
        stateCodes: ["TX"],
        countyFipsCodes: [],
        zoneIds: [],
        footprintPolygons: [],
        impactedResources: []
      }
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.resource).toBe("Energy");
    rmSync(tempDirectory, { recursive: true, force: true });
  });
});
