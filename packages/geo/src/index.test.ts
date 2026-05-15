import { describe, expect, it } from "bun:test";
import { circleIntersectsPolygons, haversineDistanceKm, parseGeoJsonPolygons } from "./index.ts";

describe("geo helpers", () => {
  it("computes haversine distance", () => {
    expect(
      haversineDistanceKm(
        { latitude: 37.7749, longitude: -122.4194 },
        { latitude: 37.7749, longitude: -122.4194 }
      )
    ).toBeCloseTo(0, 5);
  });

  it("parses geojson polygons", () => {
    const polygons = parseGeoJsonPolygons({
      type: "Polygon",
      coordinates: [[[-122.5, 37.7], [-122.3, 37.7], [-122.3, 37.8], [-122.5, 37.8], [-122.5, 37.7]]]
    });

    expect(polygons).toHaveLength(1);
    expect(polygons[0]?.coordinates).toHaveLength(5);
  });

  it("detects circle and polygon intersection", () => {
    const polygons = parseGeoJsonPolygons({
      type: "Polygon",
      coordinates: [[[-122.5, 37.7], [-122.3, 37.7], [-122.3, 37.8], [-122.5, 37.8], [-122.5, 37.7]]]
    });

    expect(circleIntersectsPolygons({ latitude: 37.75, longitude: -122.4 }, 5, polygons)).toBe(true);
  });
});
