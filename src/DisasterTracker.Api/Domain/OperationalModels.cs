using System.Text.Json.Serialization;

namespace DisasterTracker.Api.Domain;

public enum SourceHealthStatus
{
    Healthy,
    Degraded,
    Unhealthy
}

public enum MatchConfidence
{
    Low,
    Medium,
    High
}

public enum DisasterMatchKind
{
    Boundary,
    Zone,
    County,
    Radius
}

public enum ImpactConfidence
{
    Low,
    Medium,
    High
}

public sealed class SourceHealthSnapshot
{
    public required DisasterSourceKind Source { get; init; }

    public required SourceHealthStatus Status { get; init; }

    public required DateTimeOffset LastAttemptedRefreshUtc { get; init; }

    public DateTimeOffset? LastSuccessfulRefreshUtc { get; init; }

    public required int EventCount { get; init; }

    public string? ErrorMessage { get; init; }
}

public sealed class DisasterSnapshot
{
    public required DateTimeOffset GeneratedAt { get; init; }

    public required IReadOnlyList<DisasterEvent> Events { get; init; }

    public required IReadOnlyList<SourceHealthSnapshot> SourceHealth { get; init; }

    public required IReadOnlyList<ResourceImpactSignal> ResourceImpacts { get; init; }
}

public sealed class ZipCodeLocation
{
    public required string ZipCode { get; init; }

    public required string City { get; init; }

    public required string StateCode { get; init; }

    public required GeoPoint Coordinates { get; init; }

    public string? CountyZoneId { get; init; }

    public string? ForecastZoneId { get; init; }

    public string? FireWeatherZoneId { get; init; }

    public string? CountyFipsCode { get; init; }

    public string? SameCode { get; init; }

    public IReadOnlyList<string> ZoneIds { get; init; } = Array.Empty<string>();

    [JsonIgnore]
    public IReadOnlyList<GeoPolygon> BoundaryPolygons { get; init; } = Array.Empty<GeoPolygon>();
}

public sealed class ZipCodeImpactMatch
{
    public required DisasterEvent Event { get; init; }

    public required DisasterMatchKind MatchKind { get; init; }

    public required MatchConfidence Confidence { get; init; }

    public required string Reason { get; init; }

    public double? DistanceKm { get; init; }
}

public sealed class ResourceImpactSignal
{
    public required string ProfileId { get; init; }

    public required string Resource { get; init; }

    public required string Region { get; init; }

    public required string Summary { get; init; }

    public required string Explanation { get; init; }

    public required ImpactConfidence Confidence { get; init; }

    public required IReadOnlyList<string> EventIds { get; init; }

    public required IReadOnlyList<string> StateCodes { get; init; }
}

public sealed class StrategicResourceProfile
{
    public required string Id { get; init; }

    public required string Resource { get; init; }

    public required string Region { get; init; }

    public required string Summary { get; init; }

    public required string Explanation { get; init; }

    public IReadOnlyList<string> StateCodes { get; init; } = Array.Empty<string>();

    public IReadOnlyList<string> CountyFipsCodes { get; init; } = Array.Empty<string>();

    public IReadOnlyList<GeoBoundingBox> LocationBounds { get; init; } = Array.Empty<GeoBoundingBox>();

    public IReadOnlyList<string> LocationKeywords { get; init; } = Array.Empty<string>();

    public IReadOnlyList<DisasterCategory> Categories { get; init; } = Array.Empty<DisasterCategory>();

    public DisasterSeverity MinimumSeverity { get; init; } = DisasterSeverity.Moderate;

    public double? MinimumMagnitude { get; init; }
}

public sealed class DisasterSearchQuery
{
    public string? Source { get; init; }

    public string? Category { get; init; }

    public string? Severity { get; init; }

    public string? State { get; init; }

    public DisasterStatus? Status { get; init; }

    public int? Limit { get; init; }
}

public sealed class ZipImpactQuery
{
    public string? Source { get; init; }
}

public sealed class ResourceImpactQuery
{
    public string? State { get; init; }

    public string? Resource { get; init; }

    public ImpactConfidence? MinimumConfidence { get; init; }
}

public sealed class DisasterSearchResponse
{
    public required DateTimeOffset GeneratedAt { get; init; }

    public required IReadOnlyList<DisasterEvent> Items { get; init; }

    public int Count => Items.Count;
}

public sealed class ZipImpactResponse
{
    public required DateTimeOffset GeneratedAt { get; init; }

    public required ZipCodeLocation Location { get; init; }

    public required IReadOnlyList<ZipCodeImpactMatch> Matches { get; init; }

    public bool IsImpacted => Matches.Count > 0;
}

public sealed class ResourceImpactResponse
{
    public required DateTimeOffset GeneratedAt { get; init; }

    public required IReadOnlyList<ResourceImpactSignal> Items { get; init; }

    public int Count => Items.Count;
}

public sealed class SourceHealthResponse
{
    public required DateTimeOffset GeneratedAt { get; init; }

    public required IReadOnlyList<SourceHealthSnapshot> Items { get; init; }
}
