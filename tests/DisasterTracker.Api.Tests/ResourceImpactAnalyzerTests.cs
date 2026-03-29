using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Services;
using DisasterTracker.Api.Tests.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Tests;

public sealed class ResourceImpactAnalyzerTests
{
    [Fact]
    public void Analyze_returns_matching_resource_signals()
    {
        var tempDirectory = Directory.CreateTempSubdirectory("resource-impact-tests");

        try
        {
            var dataDirectory = Path.Combine(tempDirectory.FullName, "Data");
            Directory.CreateDirectory(dataDirectory);

            File.WriteAllText(
                Path.Combine(dataDirectory, "profiles.json"),
                """
                [
                  {
                    "id": "central-valley-agriculture",
                    "resource": "Specialty agriculture",
                    "region": "California Central Valley",
                    "summary": "Agricultural disruption is possible.",
                    "explanation": "Flood and fire conditions can affect high-value crop output.",
                    "stateCodes": ["CA"],
                    "categories": ["fire"],
                    "minimumSeverity": "moderate"
                  }
                ]
                """);

            var analyzer = new ResourceImpactAnalyzer(
                Options.Create(new SupplyImpactOptions
                {
                    ResourceProfilePath = "Data/profiles.json"
                }),
                new TestHostEnvironment(tempDirectory.FullName));

            var disasterEvent = new DisasterEvent
            {
                Id = "evt-1",
                Source = DisasterSourceKind.Nws,
                SourceEventId = "evt-1",
                Title = "Major fire weather event",
                Category = DisasterCategory.Fire,
                Severity = DisasterSeverity.Severe,
                Status = DisasterStatus.Active,
                StartedAt = DateTimeOffset.Parse("2026-03-29T12:00:00Z"),
                EndTimeConfidence = EndTimeConfidence.Medium,
                EndTimeExplanation = "Test",
                Summary = "Test summary",
                StateCodes = new[] { "CA" }
            };

            var signals = analyzer.Analyze(new[] { disasterEvent });

            var signal = Assert.Single(signals);
            Assert.Equal("central-valley-agriculture", signal.ProfileId);
            Assert.Equal(ImpactConfidence.High, signal.Confidence);
            Assert.Contains(disasterEvent.Id, signal.EventIds);
        }
        finally
        {
            tempDirectory.Delete(recursive: true);
        }
    }

    [Fact]
    public void Analyze_matches_global_profiles_by_location_bounds_and_keywords()
    {
        var tempDirectory = Directory.CreateTempSubdirectory("resource-impact-global-tests");

        try
        {
            var dataDirectory = Path.Combine(tempDirectory.FullName, "Data");
            Directory.CreateDirectory(dataDirectory);

            File.WriteAllText(
                Path.Combine(dataDirectory, "profiles.json"),
                """
                [
                  {
                    "id": "central-thailand-storage-electronics",
                    "resource": "Storage devices and electronics assembly",
                    "region": "Central Thailand industrial corridor",
                    "summary": "Flooding can disrupt electronics output.",
                    "explanation": "Historic industrial clustering makes this region supply-sensitive.",
                    "categories": ["flood"],
                    "minimumSeverity": "severe",
                    "locationBounds": [
                      {
                        "minLatitude": 13.2,
                        "maxLatitude": 14.9,
                        "minLongitude": 99.8,
                        "maxLongitude": 101.8
                      }
                    ],
                    "locationKeywords": ["THAILAND", "AYUTTHAYA"]
                  }
                ]
                """);

            var analyzer = new ResourceImpactAnalyzer(
                Options.Create(new SupplyImpactOptions
                {
                    ResourceProfilePath = "Data/profiles.json"
                }),
                new TestHostEnvironment(tempDirectory.FullName));

            var disasterEvent = new DisasterEvent
            {
                Id = "evt-thailand-1",
                Source = DisasterSourceKind.Eonet,
                SourceEventId = "evt-thailand-1",
                Title = "Major flooding near Ayutthaya, Thailand",
                Category = DisasterCategory.Flood,
                Severity = DisasterSeverity.Severe,
                Status = DisasterStatus.Active,
                StartedAt = DateTimeOffset.Parse("2026-03-29T12:00:00Z"),
                EndTimeConfidence = EndTimeConfidence.None,
                EndTimeExplanation = "Test",
                Summary = "Test summary",
                Centroid = new GeoPoint(14.35, 100.57)
            };

            var signal = Assert.Single(analyzer.Analyze(new[] { disasterEvent }));
            Assert.Equal("central-thailand-storage-electronics", signal.ProfileId);
            Assert.Equal(ImpactConfidence.High, signal.Confidence);
        }
        finally
        {
            tempDirectory.Delete(recursive: true);
        }
    }
}
