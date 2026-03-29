using System.Text.Json;
using DisasterTracker.Api.Domain;

namespace DisasterTracker.Api.Support;

public static class GeoJsonGeometryParser
{
    public static IReadOnlyList<GeoPolygon> ParsePolygons(JsonElement geometry)
    {
        if (geometry.ValueKind != JsonValueKind.Object)
        {
            return Array.Empty<GeoPolygon>();
        }

        var type = geometry.GetStringOrNull("type");
        var coordinates = geometry.GetPropertyOrNull("coordinates");
        if (coordinates is null)
        {
            return Array.Empty<GeoPolygon>();
        }

        return type?.Trim().ToUpperInvariant() switch
        {
            "POLYGON" => ParsePolygon(coordinates.Value),
            "MULTIPOLYGON" => ParseMultiPolygon(coordinates.Value),
            _ => Array.Empty<GeoPolygon>()
        };
    }

    private static IReadOnlyList<GeoPolygon> ParsePolygon(JsonElement polygonCoordinates)
    {
        if (polygonCoordinates.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<GeoPolygon>();
        }

        var rings = polygonCoordinates.EnumerateArray().ToArray();
        if (rings.Length == 0)
        {
            return Array.Empty<GeoPolygon>();
        }

        var polygon = TryParseRing(rings[0]);
        return polygon is null ? Array.Empty<GeoPolygon>() : new[] { polygon };
    }

    private static IReadOnlyList<GeoPolygon> ParseMultiPolygon(JsonElement multiPolygonCoordinates)
    {
        if (multiPolygonCoordinates.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<GeoPolygon>();
        }

        var polygons = new List<GeoPolygon>();
        foreach (var polygonCoordinates in multiPolygonCoordinates.EnumerateArray())
        {
            polygons.AddRange(ParsePolygon(polygonCoordinates));
        }

        return polygons;
    }

    private static GeoPolygon? TryParseRing(JsonElement ringCoordinates)
    {
        if (ringCoordinates.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var coordinates = new List<GeoPoint>();
        foreach (var coordinate in ringCoordinates.EnumerateArray())
        {
            if (coordinate.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            var values = coordinate.EnumerateArray().ToArray();
            if (values.Length < 2 ||
                values[0].ValueKind != JsonValueKind.Number ||
                values[1].ValueKind != JsonValueKind.Number ||
                !values[0].TryGetDouble(out var longitude) ||
                !values[1].TryGetDouble(out var latitude))
            {
                continue;
            }

            coordinates.Add(new GeoPoint(latitude, longitude));
        }

        if (coordinates.Count < 3)
        {
            return null;
        }

        return new GeoPolygon
        {
            Coordinates = coordinates
        };
    }
}
