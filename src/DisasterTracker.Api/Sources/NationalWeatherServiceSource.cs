using System.Text.Json;
using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Sources;

public sealed class NationalWeatherServiceSource(
    HttpClient httpClient,
    IOptions<NationalWeatherServiceOptions> options,
    ILogger<NationalWeatherServiceSource> logger) : IDisasterSourceClient
{
    public DisasterSourceKind Source => DisasterSourceKind.Nws;

    public async Task<IReadOnlyList<DisasterEvent>> FetchAsync(CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return Array.Empty<DisasterEvent>();
        }

        using var document = await httpClient.GetJsonDocumentAsync("alerts/active", cancellationToken);
        var features = document.RootElement.GetPropertyOrNull("features");
        if (features is null || features.Value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<DisasterEvent>();
        }

        var events = new List<DisasterEvent>();
        foreach (var feature in features.Value.EnumerateArray())
        {
            var properties = feature.GetPropertyOrNull("properties");
            if (properties is null)
            {
                continue;
            }

            if (!string.Equals(properties.Value.GetStringOrNull("status"), "Actual", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var sourceEventId = properties.Value.GetStringOrNull("id") ?? feature.GetStringOrNull("id");
            if (string.IsNullOrWhiteSpace(sourceEventId))
            {
                logger.LogWarning("Skipping NWS alert without a stable identifier.");
                continue;
            }

            var startedAt = properties.Value.GetDateTimeOffsetOrNull("effective") ??
                            properties.Value.GetDateTimeOffsetOrNull("sent");

            if (startedAt is null)
            {
                logger.LogWarning("Skipping NWS alert {AlertId} because no effective or sent timestamp was present.", sourceEventId);
                continue;
            }

            var title = properties.Value.GetStringOrNull("event") ?? "Weather alert";
            var ends = properties.Value.GetDateTimeOffsetOrNull("ends");
            var expires = properties.Value.GetDateTimeOffsetOrNull("expires");
            var zoneIds = ParseZoneIds(properties.Value);
            var countyFipsCodes = ParseCountyFipsCodes(properties.Value, zoneIds);
            var footprintPolygons = feature.GetPropertyOrNull("geometry") is { } geometry
                ? GeoJsonGeometryParser.ParsePolygons(geometry)
                : Array.Empty<GeoPolygon>();
            var stateCodes = DisasterDataHelpers.NormalizeIdentifiers(
                zoneIds.Select(DisasterDataHelpers.ExtractStateCodeFromZoneId));

            var (expectedEndAt, endConfidence, endExplanation) = ends is not null
                ? (ends, EndTimeConfidence.High, "Provided by the National Weather Service alert ends field.")
                : expires is not null
                    ? (expires, EndTimeConfidence.Medium, "Provided by the National Weather Service alert expires field.")
                    : ((DateTimeOffset?)null, EndTimeConfidence.None, "The National Weather Service alert does not publish an expected end time.");

            events.Add(new DisasterEvent
            {
                Id = DisasterDataHelpers.CreateStableId("nws", sourceEventId),
                Source = Source,
                SourceEventId = sourceEventId,
                Title = title,
                Category = MapCategory(title, properties.Value.GetStringOrNull("category")),
                Severity = MapSeverity(properties.Value.GetStringOrNull("severity")),
                Status = DisasterStatus.Active,
                StartedAt = startedAt.Value,
                EndedAt = null,
                ExpectedEndAt = expectedEndAt,
                EndTimeConfidence = endConfidence,
                EndTimeExplanation = endExplanation,
                Summary = properties.Value.GetStringOrNull("headline") ?? title,
                Description = properties.Value.GetStringOrNull("description"),
                Instruction = properties.Value.GetStringOrNull("instruction"),
                SourceUrl = properties.Value.GetStringOrNull("@id"),
                AreaDescription = properties.Value.GetStringOrNull("areaDesc"),
                StateCodes = stateCodes,
                CountyFipsCodes = countyFipsCodes,
                ZoneIds = zoneIds,
                FootprintPolygons = footprintPolygons
            });
        }

        return events;
    }

    private static IReadOnlyList<string> ParseZoneIds(JsonElement properties)
    {
        var geocode = properties.GetPropertyOrNull("geocode");
        var ugcCodes = geocode is { } value
            ? value.GetStringArray("UGC")
            : Array.Empty<string>();

        var affectedZones = properties
            .GetStringArray("affectedZones")
            .Select(DisasterDataHelpers.ExtractTrailingSegment);

        return DisasterDataHelpers.NormalizeIdentifiers(ugcCodes.Concat(affectedZones));
    }

    private static IReadOnlyList<string> ParseCountyFipsCodes(JsonElement properties, IReadOnlyList<string> zoneIds)
    {
        var geocode = properties.GetPropertyOrNull("geocode");
        var sameCodes = geocode is { } value
            ? value.GetStringArray("SAME").Select(DisasterDataHelpers.NormalizeCountyFips)
            : Array.Empty<string?>();

        var zoneDerived = zoneIds.Select(DisasterDataHelpers.ExtractCountyFipsFromZoneId);
        return DisasterDataHelpers.NormalizeIdentifiers(sameCodes.Concat(zoneDerived));
    }

    private static DisasterCategory MapCategory(string eventName, string? sourceCategory)
    {
        var normalized = $"{sourceCategory} {eventName}".ToUpperInvariant();
        if (normalized.Contains("FIRE", StringComparison.Ordinal))
        {
            return DisasterCategory.Fire;
        }

        if (normalized.Contains("FLOOD", StringComparison.Ordinal))
        {
            return DisasterCategory.Flood;
        }

        if (normalized.Contains("HURRICANE", StringComparison.Ordinal) ||
            normalized.Contains("TROPICAL", StringComparison.Ordinal))
        {
            return DisasterCategory.Hurricane;
        }

        if (normalized.Contains("STORM", StringComparison.Ordinal) ||
            normalized.Contains("TORNADO", StringComparison.Ordinal) ||
            normalized.Contains("THUNDER", StringComparison.Ordinal) ||
            normalized.Contains("WIND", StringComparison.Ordinal))
        {
            return DisasterCategory.Storm;
        }

        if (normalized.Contains("DROUGHT", StringComparison.Ordinal))
        {
            return DisasterCategory.Drought;
        }

        return DisasterCategory.Weather;
    }

    private static DisasterSeverity MapSeverity(string? severity)
    {
        return severity?.Trim().ToUpperInvariant() switch
        {
            "EXTREME" => DisasterSeverity.Extreme,
            "SEVERE" => DisasterSeverity.Severe,
            "MODERATE" => DisasterSeverity.Moderate,
            "MINOR" => DisasterSeverity.Minor,
            _ => DisasterSeverity.Unknown
        };
    }
}
