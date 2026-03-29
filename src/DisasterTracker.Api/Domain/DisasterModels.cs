using System.Text.Json.Serialization;

namespace DisasterTracker.Api.Domain;

public enum DisasterSourceKind
{
    Nws,
    Fema,
    Usgs,
    Eonet
}

public enum DisasterCategory
{
    Weather,
    Fire,
    Flood,
    Storm,
    Hurricane,
    Earthquake,
    Drought,
    Other
}

public enum DisasterSeverity
{
    Unknown,
    Minor,
    Moderate,
    Severe,
    Extreme
}

public enum DisasterStatus
{
    Active,
    Monitoring,
    Resolved
}

public enum EndTimeConfidence
{
    None,
    Low,
    Medium,
    High
}

public readonly record struct GeoPoint(double Latitude, double Longitude);

public sealed class GeoPolygon
{
    public IReadOnlyList<GeoPoint> Coordinates { get; init; } = Array.Empty<GeoPoint>();
}

public readonly record struct GeoBoundingBox(
    double MinLatitude,
    double MaxLatitude,
    double MinLongitude,
    double MaxLongitude);

public sealed class DisasterEvent
{
    public required string Id { get; init; }

    public required DisasterSourceKind Source { get; init; }

    public required string SourceEventId { get; init; }

    public required string Title { get; init; }

    public required DisasterCategory Category { get; init; }

    public required DisasterSeverity Severity { get; init; }

    public required DisasterStatus Status { get; init; }

    public required DateTimeOffset StartedAt { get; init; }

    public DateTimeOffset? EndedAt { get; init; }

    public DateTimeOffset? ExpectedEndAt { get; init; }

    public required EndTimeConfidence EndTimeConfidence { get; init; }

    public required string EndTimeExplanation { get; init; }

    public required string Summary { get; init; }

    public string? Description { get; init; }

    public string? Instruction { get; init; }

    public string? SourceUrl { get; init; }

    public string? AreaDescription { get; init; }

    public IReadOnlyList<string> StateCodes { get; init; } = Array.Empty<string>();

    public IReadOnlyList<string> CountyFipsCodes { get; init; } = Array.Empty<string>();

    public IReadOnlyList<string> ZoneIds { get; init; } = Array.Empty<string>();

    public GeoPoint? Centroid { get; init; }

    public double? RadiusKm { get; init; }

    [JsonIgnore]
    public IReadOnlyList<GeoPolygon> FootprintPolygons { get; init; } = Array.Empty<GeoPolygon>();

    public double? Magnitude { get; init; }

    public string? MagnitudeUnit { get; init; }

    public IReadOnlyList<ResourceImpactSignal> ImpactedResources { get; set; } = Array.Empty<ResourceImpactSignal>();
}
