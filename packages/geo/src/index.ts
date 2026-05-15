import type { GeoBoundingBox, GeoPoint, GeoPolygon } from "@ron/contract";

const earthRadiusKm = 6371.0;

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180.0;
}

export function haversineDistanceKm(start: GeoPoint, end: GeoPoint): number {
  const latitudeDelta = degreesToRadians(end.latitude - start.latitude);
  const longitudeDelta = degreesToRadians(end.longitude - start.longitude);
  const startLatitude = degreesToRadians(start.latitude);
  const endLatitude = degreesToRadians(end.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function calculateCentroid(points: GeoPoint[]): GeoPoint {
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length
  };
}

export function containsBoundingBoxPoint(bounds: GeoBoundingBox, point: GeoPoint): boolean {
  return (
    point.latitude >= bounds.minLatitude &&
    point.latitude <= bounds.maxLatitude &&
    point.longitude >= bounds.minLongitude &&
    point.longitude <= bounds.maxLongitude
  );
}

export function containsPoint(polygons: GeoPolygon[], point: GeoPoint): boolean {
  return polygons.some((polygon) => containsPointInPolygon(polygon, point));
}

export function containsPointInPolygon(polygon: GeoPolygon, point: GeoPoint): boolean {
  const coordinates = polygon.coordinates;
  if (coordinates.length < 3) {
    return false;
  }

  let contains = false;
  for (let index = 0; index < coordinates.length; index += 1) {
    const current = coordinates[index]!;
    const previous = coordinates[(index + coordinates.length - 1) % coordinates.length]!;

    const longitudeCrosses =
      current.longitude > point.longitude !== previous.longitude > point.longitude;
    if (!longitudeCrosses) {
      continue;
    }

    const boundaryLatitude =
      ((previous.latitude - current.latitude) * (point.longitude - current.longitude)) /
        (previous.longitude - current.longitude) +
      current.latitude;

    if (point.latitude < boundaryLatitude) {
      contains = !contains;
    }
  }

  return contains;
}

export function intersects(left: GeoPolygon[], right: GeoPolygon[]): boolean {
  if (left.length === 0 || right.length === 0) {
    return false;
  }

  return left.some((leftPolygon) => right.some((rightPolygon) => intersectsPolygon(leftPolygon, rightPolygon)));
}

export function circleIntersectsPolygons(center: GeoPoint, radiusKm: number, polygons: GeoPolygon[]): boolean {
  if (polygons.length === 0) {
    return false;
  }

  if (containsPoint(polygons, center)) {
    return true;
  }

  for (const polygon of polygons) {
    if (polygon.coordinates.some((point) => haversineDistanceKm(center, point) <= radiusKm)) {
      return true;
    }

    for (const [start, end] of getSegments(polygon.coordinates)) {
      if (distanceToSegmentKm(center, start, end) <= radiusKm) {
        return true;
      }
    }
  }

  return false;
}

function intersectsPolygon(left: GeoPolygon, right: GeoPolygon): boolean {
  if (left.coordinates.length < 3 || right.coordinates.length < 3) {
    return false;
  }

  if (
    left.coordinates.some((point) => containsPointInPolygon(right, point)) ||
    right.coordinates.some((point) => containsPointInPolygon(left, point))
  ) {
    return true;
  }

  for (const [leftStart, leftEnd] of getSegments(left.coordinates)) {
    for (const [rightStart, rightEnd] of getSegments(right.coordinates)) {
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true;
      }
    }
  }

  return false;
}

function* getSegments(coordinates: GeoPoint[]): Iterable<[GeoPoint, GeoPoint]> {
  if (coordinates.length < 2) {
    return;
  }

  for (let index = 0; index < coordinates.length; index += 1) {
    yield [coordinates[index]!, coordinates[(index + 1) % coordinates.length]!];
  }
}

function segmentsIntersect(firstStart: GeoPoint, firstEnd: GeoPoint, secondStart: GeoPoint, secondEnd: GeoPoint): boolean {
  const firstStartOrientation = orientation(firstStart, firstEnd, secondStart);
  const firstEndOrientation = orientation(firstStart, firstEnd, secondEnd);
  const secondStartOrientation = orientation(secondStart, secondEnd, firstStart);
  const secondEndOrientation = orientation(secondStart, secondEnd, firstEnd);

  if (firstStartOrientation === 0 && onSegment(firstStart, secondStart, firstEnd)) {
    return true;
  }
  if (firstEndOrientation === 0 && onSegment(firstStart, secondEnd, firstEnd)) {
    return true;
  }
  if (secondStartOrientation === 0 && onSegment(secondStart, firstStart, secondEnd)) {
    return true;
  }
  if (secondEndOrientation === 0 && onSegment(secondStart, firstEnd, secondEnd)) {
    return true;
  }

  return firstStartOrientation !== firstEndOrientation && secondStartOrientation !== secondEndOrientation;
}

function orientation(start: GeoPoint, middle: GeoPoint, end: GeoPoint): number {
  const crossProduct =
    (middle.longitude - start.longitude) * (end.latitude - middle.latitude) -
    (middle.latitude - start.latitude) * (end.longitude - middle.longitude);

  if (Math.abs(crossProduct) < 1e-12) {
    return 0;
  }

  return crossProduct > 0 ? 1 : -1;
}

function onSegment(start: GeoPoint, point: GeoPoint, end: GeoPoint): boolean {
  return (
    point.longitude <= Math.max(start.longitude, end.longitude) &&
    point.longitude >= Math.min(start.longitude, end.longitude) &&
    point.latitude <= Math.max(start.latitude, end.latitude) &&
    point.latitude >= Math.min(start.latitude, end.latitude)
  );
}

function distanceToSegmentKm(point: GeoPoint, start: GeoPoint, end: GeoPoint): number {
  const startProjected = projectToKilometers(point, start);
  const endProjected = projectToKilometers(point, end);
  const segmentX = endProjected.x - startProjected.x;
  const segmentY = endProjected.y - startProjected.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.sqrt(startProjected.x * startProjected.x + startProjected.y * startProjected.y);
  }

  const t = Math.max(0, Math.min(1, -((startProjected.x * segmentX + startProjected.y * segmentY) / segmentLengthSquared)));
  const closestX = startProjected.x + segmentX * t;
  const closestY = startProjected.y + segmentY * t;
  return Math.sqrt(closestX * closestX + closestY * closestY);
}

function projectToKilometers(origin: GeoPoint, point: GeoPoint): { x: number; y: number } {
  const averageLatitude = degreesToRadians((origin.latitude + point.latitude) / 2);
  const x = degreesToRadians(point.longitude - origin.longitude) * earthRadiusKm * Math.cos(averageLatitude);
  const y = degreesToRadians(point.latitude - origin.latitude) * earthRadiusKm;
  return { x, y };
}

export function parseGeoJsonPolygons(geometry: unknown): GeoPolygon[] {
  if (!geometry || typeof geometry !== "object") {
    return [];
  }

  const type = readString((geometry as Record<string, unknown>).type)?.toUpperCase();
  const coordinates = (geometry as Record<string, unknown>).coordinates;

  if (!coordinates) {
    return [];
  }

  if (type === "POLYGON") {
    return parsePolygon(coordinates);
  }

  if (type === "MULTIPOLYGON") {
    return parseMultiPolygon(coordinates);
  }

  return [];
}

function parsePolygon(polygonCoordinates: unknown): GeoPolygon[] {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
    return [];
  }

  const polygon = tryParseRing(polygonCoordinates[0]);
  return polygon ? [polygon] : [];
}

function parseMultiPolygon(multiPolygonCoordinates: unknown): GeoPolygon[] {
  if (!Array.isArray(multiPolygonCoordinates)) {
    return [];
  }

  return multiPolygonCoordinates.flatMap((polygon) => parsePolygon(polygon));
}

function tryParseRing(ringCoordinates: unknown): GeoPolygon | undefined {
  if (!Array.isArray(ringCoordinates)) {
    return undefined;
  }

  const coordinates = ringCoordinates
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return undefined;
      }

      const longitude = Number(coordinate[0]);
      const latitude = Number(coordinate[1]);
      if (Number.isNaN(longitude) || Number.isNaN(latitude)) {
        return undefined;
      }

      return { latitude, longitude };
    })
    .filter((point): point is GeoPoint => point !== undefined);

  if (coordinates.length < 3) {
    return undefined;
  }

  return { coordinates };
}

export function collectGeoJsonPoints(coordinates: unknown, points: GeoPoint[] = []): GeoPoint[] {
  if (!Array.isArray(coordinates)) {
    return points;
  }

  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    points.push({ latitude: coordinates[1], longitude: coordinates[0] });
    return points;
  }

  for (const coordinate of coordinates) {
    collectGeoJsonPoints(coordinate, points);
  }

  return points;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
