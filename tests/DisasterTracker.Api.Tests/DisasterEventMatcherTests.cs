using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Services;

namespace DisasterTracker.Api.Tests;

public sealed class DisasterEventMatcherTests
{
    private readonly DisasterEventMatcher _matcher = new();

    [Fact]
    public void Match_returns_zone_match_for_nws_alerts()
    {
        var location = new ZipCodeLocation
        {
            ZipCode = "90210",
            City = "Beverly Hills",
            StateCode = "CA",
            Coordinates = new GeoPoint(34.0901, -118.4065),
            CountyZoneId = "CAC037",
            ForecastZoneId = "CAZ368",
            FireWeatherZoneId = "CAZ368",
            CountyFipsCode = "037",
            ZoneIds = new[] { "CAZ368", "CAC037" }
        };

        var disasterEvent = CreateEvent(
            DisasterSourceKind.Nws,
            DisasterCategory.Fire,
            DisasterStatus.Active,
            zoneIds: new[] { "CAZ368" });

        var match = Assert.Single(_matcher.Match(location, new[] { disasterEvent }));
        Assert.Equal(DisasterMatchKind.Zone, match.MatchKind);
        Assert.Equal(MatchConfidence.High, match.Confidence);
    }

    [Fact]
    public void Match_returns_boundary_match_when_published_geometry_intersects_zip_polygon()
    {
        var location = new ZipCodeLocation
        {
            ZipCode = "90210",
            City = "Beverly Hills",
            StateCode = "CA",
            Coordinates = new GeoPoint(34.0901, -118.4065),
            ZoneIds = Array.Empty<string>(),
            BoundaryPolygons = new[]
            {
                CreateSquarePolygon(34.0901, -118.4065, 0.03)
            }
        };

        var disasterEvent = CreateEvent(
            DisasterSourceKind.Eonet,
            DisasterCategory.Fire,
            DisasterStatus.Active,
            centroid: new GeoPoint(34.0901, -118.4065),
            radiusKm: 5,
            footprintPolygons: new[]
            {
                CreateSquarePolygon(34.095, -118.402, 0.02)
            });

        var match = Assert.Single(_matcher.Match(location, new[] { disasterEvent }));
        Assert.Equal(DisasterMatchKind.Boundary, match.MatchKind);
        Assert.Equal(MatchConfidence.High, match.Confidence);
    }

    [Fact]
    public void Match_returns_county_match_for_fema_declarations()
    {
        var location = new ZipCodeLocation
        {
            ZipCode = "73010",
            City = "Blanchard",
            StateCode = "OK",
            Coordinates = new GeoPoint(35.137, -97.659),
            CountyFipsCode = "087",
            ZoneIds = Array.Empty<string>()
        };

        var disasterEvent = CreateEvent(
            DisasterSourceKind.Fema,
            DisasterCategory.Fire,
            DisasterStatus.Active,
            stateCodes: new[] { "OK" },
            countyFipsCodes: new[] { "087" });

        var match = Assert.Single(_matcher.Match(location, new[] { disasterEvent }));
        Assert.Equal(DisasterMatchKind.County, match.MatchKind);
        Assert.Equal(MatchConfidence.Medium, match.Confidence);
    }

    [Fact]
    public void Match_returns_radius_match_for_usgs_events()
    {
        var location = new ZipCodeLocation
        {
            ZipCode = "92549",
            City = "Idyllwild",
            StateCode = "CA",
            Coordinates = new GeoPoint(33.74, -116.72),
            ZoneIds = Array.Empty<string>()
        };

        var disasterEvent = CreateEvent(
            DisasterSourceKind.Usgs,
            DisasterCategory.Earthquake,
            DisasterStatus.Monitoring,
            centroid: new GeoPoint(33.681, -116.8015),
            radiusKm: 40);

        var match = Assert.Single(_matcher.Match(location, new[] { disasterEvent }));
        Assert.Equal(DisasterMatchKind.Radius, match.MatchKind);
        Assert.NotNull(match.DistanceKm);
    }

    [Fact]
    public void Match_returns_radius_match_for_eonet_events()
    {
        var location = new ZipCodeLocation
        {
            ZipCode = "77627",
            City = "Hardin",
            StateCode = "TX",
            Coordinates = new GeoPoint(30.39, -94.34),
            ZoneIds = Array.Empty<string>()
        };

        var disasterEvent = CreateEvent(
            DisasterSourceKind.Eonet,
            DisasterCategory.Fire,
            DisasterStatus.Active,
            stateCodes: new[] { "TX" },
            centroid: new GeoPoint(30.3957, -94.34081),
            radiusKm: 12);

        var match = Assert.Single(_matcher.Match(location, new[] { disasterEvent }));
        Assert.Equal(DisasterMatchKind.Radius, match.MatchKind);
        Assert.NotNull(match.DistanceKm);
    }

    private static DisasterEvent CreateEvent(
        DisasterSourceKind source,
        DisasterCategory category,
        DisasterStatus status,
        IReadOnlyList<string>? stateCodes = null,
        IReadOnlyList<string>? countyFipsCodes = null,
        IReadOnlyList<string>? zoneIds = null,
        GeoPoint? centroid = null,
        double? radiusKm = null,
        IReadOnlyList<GeoPolygon>? footprintPolygons = null)
    {
        return new DisasterEvent
        {
            Id = Guid.NewGuid().ToString("N"),
            Source = source,
            SourceEventId = Guid.NewGuid().ToString("N"),
            Title = "Test event",
            Category = category,
            Severity = DisasterSeverity.Severe,
            Status = status,
            StartedAt = DateTimeOffset.Parse("2026-03-29T12:00:00Z"),
            EndTimeConfidence = EndTimeConfidence.None,
            EndTimeExplanation = "Test",
            Summary = "Test summary",
            StateCodes = stateCodes ?? Array.Empty<string>(),
            CountyFipsCodes = countyFipsCodes ?? Array.Empty<string>(),
            ZoneIds = zoneIds ?? Array.Empty<string>(),
            Centroid = centroid,
            RadiusKm = radiusKm,
            FootprintPolygons = footprintPolygons ?? Array.Empty<GeoPolygon>()
        };
    }

    private static GeoPolygon CreateSquarePolygon(double latitude, double longitude, double halfSizeDegrees)
    {
        return new GeoPolygon
        {
            Coordinates = new[]
            {
                new GeoPoint(latitude - halfSizeDegrees, longitude - halfSizeDegrees),
                new GeoPoint(latitude - halfSizeDegrees, longitude + halfSizeDegrees),
                new GeoPoint(latitude + halfSizeDegrees, longitude + halfSizeDegrees),
                new GeoPoint(latitude + halfSizeDegrees, longitude - halfSizeDegrees),
                new GeoPoint(latitude - halfSizeDegrees, longitude - halfSizeDegrees)
            }
        };
    }
}
