using System.Text.Json;
using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Sources;

public sealed class EonetDisasterSource(
    HttpClient httpClient,
    IOptions<EonetOptions> options) : IDisasterSourceClient
{
    public DisasterSourceKind Source => DisasterSourceKind.Eonet;

    public async Task<IReadOnlyList<DisasterEvent>> FetchAsync(CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return Array.Empty<DisasterEvent>();
        }

        using var document = await httpClient.GetJsonDocumentAsync($"events?status=open&limit={options.Value.MaxRecords}", cancellationToken);
        var events = document.RootElement.GetPropertyOrNull("events");
        if (events is null || events.Value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<DisasterEvent>();
        }

        var normalizedEvents = new List<DisasterEvent>();
        foreach (var rawEvent in events.Value.EnumerateArray())
        {
            var sourceEventId = rawEvent.GetStringOrNull("id");
            if (string.IsNullOrWhiteSpace(sourceEventId))
            {
                continue;
            }

            var title = rawEvent.GetStringOrNull("title") ?? "EONET event";
            var categoryElement = rawEvent.GetPropertyOrNull("categories") is { } categories &&
                                  categories.ValueKind == JsonValueKind.Array
                ? categories.EnumerateArray().FirstOrDefault()
                : default;

            var categoryId = categoryElement.ValueKind == JsonValueKind.Object
                ? categoryElement.GetStringOrNull("id")
                : null;
            var categoryTitle = categoryElement.ValueKind == JsonValueKind.Object
                ? categoryElement.GetStringOrNull("title")
                : null;

            var disasterCategory = MapCategory(categoryId, categoryTitle, title);
            var geometryEntries = rawEvent.GetPropertyOrNull("geometry") is { } geometry &&
                                  geometry.ValueKind == JsonValueKind.Array
                ? geometry.EnumerateArray().ToArray()
                : Array.Empty<JsonElement>();

            var timestamps = geometryEntries
                .Select(entry => entry.GetDateTimeOffsetOrNull("date"))
                .Where(value => value is not null)
                .Select(value => value!.Value)
                .OrderBy(value => value)
                .ToArray();

            if (timestamps.Length == 0)
            {
                continue;
            }

            var latestGeometry = geometryEntries
                .OrderByDescending(entry => entry.GetDateTimeOffsetOrNull("date") ?? DateTimeOffset.MinValue)
                .Select(entry => TryParseGeometry(entry, disasterCategory))
                .FirstOrDefault(entry => entry is not null);

            var stateCode = UsRegionCatalog.TryResolveStateCode(title, latestGeometry?.Centroid);
            var closedAt = rawEvent.GetDateTimeOffsetOrNull("closed");

            normalizedEvents.Add(new DisasterEvent
            {
                Id = DisasterDataHelpers.CreateStableId("eonet", sourceEventId),
                Source = Source,
                SourceEventId = sourceEventId,
                Title = title,
                Category = disasterCategory,
                Severity = MapSeverity(disasterCategory, latestGeometry?.Magnitude, latestGeometry?.MagnitudeUnit),
                Status = closedAt is null ? DisasterStatus.Active : DisasterStatus.Resolved,
                StartedAt = timestamps[0],
                EndedAt = closedAt,
                ExpectedEndAt = closedAt,
                EndTimeConfidence = closedAt is null ? EndTimeConfidence.None : EndTimeConfidence.High,
                EndTimeExplanation = closedAt is null
                    ? "NASA EONET marks this event as open and does not publish a predicted end time."
                    : "NASA EONET marked this event as closed.",
                Summary = categoryTitle is null ? title : $"{categoryTitle}: {title}",
                Description = rawEvent.GetStringOrNull("description"),
                SourceUrl = rawEvent.GetStringOrNull("link") ?? GetFirstSourceUrl(rawEvent),
                AreaDescription = title,
                StateCodes = stateCode is null ? Array.Empty<string>() : new[] { stateCode },
                Centroid = latestGeometry?.Centroid,
                RadiusKm = latestGeometry?.RadiusKm,
                FootprintPolygons = latestGeometry?.Polygons ?? Array.Empty<GeoPolygon>(),
                Magnitude = latestGeometry?.Magnitude,
                MagnitudeUnit = latestGeometry?.MagnitudeUnit
            });
        }

        return normalizedEvents;
    }

    private static string? GetFirstSourceUrl(JsonElement rawEvent)
    {
        var sources = rawEvent.GetPropertyOrNull("sources");
        if (sources is null || sources.Value.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (var source in sources.Value.EnumerateArray())
        {
            var url = source.GetStringOrNull("url");
            if (!string.IsNullOrWhiteSpace(url))
            {
                return url;
            }
        }

        return null;
    }

    private static DisasterCategory MapCategory(string? categoryId, string? categoryTitle, string title)
    {
        var normalized = $"{categoryId} {categoryTitle} {title}".ToUpperInvariant();
        if (normalized.Contains("WILDFIRE", StringComparison.Ordinal) ||
            normalized.Contains("FIRE", StringComparison.Ordinal))
        {
            return DisasterCategory.Fire;
        }

        if (normalized.Contains("FLOOD", StringComparison.Ordinal))
        {
            return DisasterCategory.Flood;
        }

        if (normalized.Contains("HURRICANE", StringComparison.Ordinal) ||
            normalized.Contains("TYPHOON", StringComparison.Ordinal) ||
            normalized.Contains("CYCLONE", StringComparison.Ordinal) ||
            normalized.Contains("TROPICAL", StringComparison.Ordinal))
        {
            return DisasterCategory.Hurricane;
        }

        if (normalized.Contains("STORM", StringComparison.Ordinal))
        {
            return DisasterCategory.Storm;
        }

        if (normalized.Contains("DROUGHT", StringComparison.Ordinal))
        {
            return DisasterCategory.Drought;
        }

        if (normalized.Contains("EARTHQUAKE", StringComparison.Ordinal))
        {
            return DisasterCategory.Earthquake;
        }

        return DisasterCategory.Weather;
    }

    private static DisasterSeverity MapSeverity(DisasterCategory category, double? magnitude, string? magnitudeUnit)
    {
        var areaKm2 = TryConvertAreaToSquareKilometers(magnitude, magnitudeUnit);
        if (areaKm2 is not null)
        {
            return areaKm2.Value switch
            {
                >= 5000 => DisasterSeverity.Extreme,
                >= 500 => DisasterSeverity.Severe,
                >= 50 => DisasterSeverity.Moderate,
                _ => DisasterSeverity.Minor
            };
        }

        return category switch
        {
            DisasterCategory.Hurricane => DisasterSeverity.Severe,
            DisasterCategory.Storm => DisasterSeverity.Moderate,
            DisasterCategory.Flood => DisasterSeverity.Moderate,
            DisasterCategory.Drought => DisasterSeverity.Moderate,
            DisasterCategory.Fire => DisasterSeverity.Moderate,
            _ => DisasterSeverity.Minor
        };
    }

    private static GeometrySnapshot? TryParseGeometry(JsonElement geometry, DisasterCategory category)
    {
        var coordinates = geometry.GetPropertyOrNull("coordinates");
        if (coordinates is null)
        {
            return null;
        }

        var polygons = GeoJsonGeometryParser.ParsePolygons(geometry);
        var points = new List<GeoPoint>();
        CollectPoints(coordinates.Value, points);
        if (points.Count == 0)
        {
            return null;
        }

        var centroid = GeoMath.CalculateCentroid(points);

        var footprintRadiusKm = points.Count == 1
            ? (double?)null
            : points.Max(point => GeoMath.HaversineDistanceKm(centroid, point));

        var magnitude = geometry.GetDoubleOrNull("magnitudeValue");
        var magnitudeUnit = geometry.GetStringOrNull("magnitudeUnit");
        var areaRadiusKm = TryConvertAreaToRadiusKm(magnitude, magnitudeUnit);
        var defaultRadiusKm = GetDefaultRadiusKm(category);

        double radiusKm;
        if (footprintRadiusKm is not null)
        {
            radiusKm = Math.Max(footprintRadiusKm.Value, areaRadiusKm ?? 0);
        }
        else if (areaRadiusKm is not null)
        {
            radiusKm = Math.Max(defaultRadiusKm, areaRadiusKm.Value);
        }
        else
        {
            radiusKm = defaultRadiusKm;
        }

        return new GeometrySnapshot(centroid, Math.Clamp(radiusKm, 2, 800), polygons, magnitude, magnitudeUnit);
    }

    private static void CollectPoints(JsonElement coordinates, List<GeoPoint> points)
    {
        if (coordinates.ValueKind != JsonValueKind.Array)
        {
            return;
        }

        var items = coordinates.EnumerateArray().ToArray();
        if (items.Length >= 2 &&
            items[0].ValueKind == JsonValueKind.Number &&
            items[1].ValueKind == JsonValueKind.Number &&
            items[0].TryGetDouble(out var longitude) &&
            items[1].TryGetDouble(out var latitude))
        {
            points.Add(new GeoPoint(latitude, longitude));
            return;
        }

        foreach (var item in items)
        {
            CollectPoints(item, points);
        }
    }

    private static double GetDefaultRadiusKm(DisasterCategory category)
    {
        return category switch
        {
            DisasterCategory.Fire => 10,
            DisasterCategory.Flood => 60,
            DisasterCategory.Hurricane => 200,
            DisasterCategory.Storm => 120,
            DisasterCategory.Drought => 250,
            DisasterCategory.Earthquake => 50,
            _ => 30
        };
    }

    private static double? TryConvertAreaToRadiusKm(double? magnitude, string? magnitudeUnit)
    {
        var areaKm2 = TryConvertAreaToSquareKilometers(magnitude, magnitudeUnit);
        return areaKm2 is null ? null : Math.Sqrt(areaKm2.Value / Math.PI);
    }

    private static double? TryConvertAreaToSquareKilometers(double? magnitude, string? magnitudeUnit)
    {
        if (magnitude is null || string.IsNullOrWhiteSpace(magnitudeUnit))
        {
            return null;
        }

        var normalizedUnit = magnitudeUnit.Trim().ToUpperInvariant();
        if (normalizedUnit.Contains("ACRE", StringComparison.Ordinal))
        {
            return magnitude.Value * 0.0040468564224;
        }

        if (normalizedUnit.Contains("HECT", StringComparison.Ordinal))
        {
            return magnitude.Value * 0.01;
        }

        if ((normalizedUnit.Contains("KM", StringComparison.Ordinal) && normalizedUnit.Contains("2", StringComparison.Ordinal)) ||
            normalizedUnit.Contains("SQ KM", StringComparison.Ordinal) ||
            normalizedUnit.Contains("SQUARE KILOMETER", StringComparison.Ordinal))
        {
            return magnitude.Value;
        }

        if ((normalizedUnit.Contains("MI", StringComparison.Ordinal) && normalizedUnit.Contains("2", StringComparison.Ordinal)) ||
            normalizedUnit.Contains("SQ MI", StringComparison.Ordinal) ||
            normalizedUnit.Contains("SQUARE MILE", StringComparison.Ordinal))
        {
            return magnitude.Value * 2.5899881103;
        }

        return null;
    }

    private sealed record GeometrySnapshot(
        GeoPoint Centroid,
        double RadiusKm,
        IReadOnlyList<GeoPolygon> Polygons,
        double? Magnitude,
        string? MagnitudeUnit);
}
