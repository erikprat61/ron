import { afterEach, describe, expect, it, mock } from "bun:test";
import { OpenFemaClient } from "./index.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("OpenFemaClient", () => {
  it("builds the declaration query", async () => {
    const fetchMock = mock(async (url: string | URL) => {
      expect(String(url)).toContain("DisasterDeclarationsSummaries");
      expect(String(url)).toContain("$top=25");
      return new Response(JSON.stringify({ DisasterDeclarationsSummaries: [] }), {
        headers: { "content-type": "application/json" }
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new OpenFemaClient({
      enabled: true,
      baseUrl: "https://www.fema.gov/api/open/v2/",
      timeoutMs: 20_000,
      activeWindowDays: 365,
      maxRecords: 25
    });

    const response = await client.getDisasterDeclarations(new Date("2026-05-14T00:00:00.000Z"));
    expect(response.DisasterDeclarationsSummaries).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
