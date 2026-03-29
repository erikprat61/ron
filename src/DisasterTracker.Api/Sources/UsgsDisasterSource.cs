using System.Globalization;
using System.Text.Json;
using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Sources;

public sealed class UsgsDisasterSource(
    HttpClient httpClient,
    IOptions<UsgsOptions> options) : IDisasterSourceClient
{
    public DisasterSourceKind Source => DisasterSourceKind.Usgs;

    public async Task<IReadOnlyList<DisasterEvent>> FetchAsync(CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return Array.Empty<DisasterEvent>();
        }

        using var document = await httpClient.GetJsonDocumentAsync("earthquakes/feed/v1.0/summary/all_day.geojson", cancellationToken);
        var features = document.RootElement.GetPropertyOrNull("features");
        if (features is null || features.Value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<DisasterEvent>();
        }

        var events = new List<DisasterEvent>();
        foreach (var feature in features.Value.EnumerateArray())
        {
            var properties = feature.GetPropertyOrNull("properties");
            var geometry = feature.GetPropertyOrNull("geometry");
            if (properties is null || geometry is null)
            {
                continue;
            }

            var sourceEventId = feature.GetStringOrNull("id");
            var occurredAt = properties.Value.GetUnixMillisecondsAsDateTimeOffsetOrNull("time");
            var magnitude = properties.Value.GetDoubleOrNull("mag");
            if (string.IsNullOrWhiteSpace(sourceEventId) || occurredAt is null || magnitude is null)
            {
                continue;
            }

            var point = TryParsePoint(geometry.Value);
            if (point is null || !UsRegionCatalog.IsWithinUnitedStates(point.Value))
            {
                continue;
            }

            var significance = properties.Value.GetInt32OrNull("sig") ?? 0;
            var tsunami = properties.Value.GetInt32OrNull("tsunami") ?? 0;
            var alertLevel = properties.Value.GetStringOrNull("alert");
            if (magnitude.Value < options.Value.MinimumMagnitude &&
                significance < options.Value.MinimumSignificance &&
                tsunami == 0 &&
                string.IsNullOrWhiteSpace(alertLevel))
            {
                continue;
            }

            var place = properties.Value.GetStringOrNull("place");
            var stateCode = UsRegionCatalog.TryResolveStateCode(place, point.Value);
            var title = properties.Value.GetStringOrNull("title") ??
                        $"M {magnitude.Value.ToString("0.0", CultureInfo.InvariantCulture)} earthquake";

            events.Add(new DisasterEvent
            {
                Id = DisasterDataHelpers.CreateStableId("usgs", sourceEventId),
                Source = Source,
                SourceEventId = sourceEventId,
                Title = title,
                Category = DisasterCategory.Earthquake,
                Severity = MapSeverity(magnitude.Value, alertLevel),
                Status = DisasterStatus.Monitoring,
                StartedAt = occurredAt.Value,
                EndedAt = occurredAt.Value,
                ExpectedEndAt = occurredAt.Value,
                EndTimeConfidence = EndTimeConfidence.High,
                EndTimeExplanation = "Earthquakes are point-in-time events, so the recorded occurrence time is treated as the event end time.",
                Summary = place ?? title,
                SourceUrl = properties.Value.GetStringOrNull("url") ?? properties.Value.GetStringOrNull("detail"),
                AreaDescription = place,
                StateCodes = stateCode is null ? Array.Empty<string>() : new[] { stateCode },
                Centroid = point.Value,
                RadiusKm = ComputeImpactRadiusKm(magnitude.Value, significance),
                Magnitude = magnitude.Value,
                MagnitudeUnit = properties.Value.GetStringOrNull("magType")
            });
        }

        return events;
    }

    private static GeoPoint? TryParsePoint(JsonElement geometry)
    {
        var coordinates = geometry.GetPropertyOrNull("coordinates");
        if (coordinates is null || coordinates.Value.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var values = coordinates.Value.EnumerateArray().Take(2).ToArray();
        if (values.Length < 2 ||
            !values[0].TryGetDouble(out var longitude) ||
            !values[1].TryGetDouble(out var latitude))
        {
            return null;
        }

        return new GeoPoint(latitude, longitude);
    }

    private static DisasterSeverity MapSeverity(double magnitude, string? alertLevel)
    {
        var normalizedAlert = alertLevel?.Trim().ToUpperInvariant();
        if (normalizedAlert == "RED" || magnitude >= 7.0)
        {
            return DisasterSeverity.Extreme;
        }

        if (normalizedAlert == "ORANGE" || magnitude >= 6.0)
        {
            return DisasterSeverity.Severe;
        }

        if (normalizedAlert == "YELLOW" || magnitude >= 4.5)
        {
            return DisasterSeverity.Moderate;
        }

        return DisasterSeverity.Minor;
    }

    private static double ComputeImpactRadiusKm(double magnitude, int significance)
    {
        var radius = 20 + (magnitude * 15);
        if (significance >= 400)
        {
            radius += 40;
        }

        return Math.Clamp(radius, 20, 300);
    }
}
