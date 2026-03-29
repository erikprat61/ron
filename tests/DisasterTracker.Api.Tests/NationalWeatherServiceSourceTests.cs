using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Sources;
using DisasterTracker.Api.Tests.Support;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Tests;

public sealed class NationalWeatherServiceSourceTests
{
    [Fact]
    public async Task FetchAsync_maps_actual_alerts_and_skips_non_actual_items()
    {
        var handler = new StubHttpMessageHandler((_, _) => Task.FromResult(
            StubHttpMessageHandler.JsonResponse(
                """
                {
                  "features": [
                    {
                      "id": "https://api.weather.gov/alerts/actual",
                      "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                          [
                            [-118.48, 34.00],
                            [-118.32, 34.00],
                            [-118.32, 34.15],
                            [-118.48, 34.15],
                            [-118.48, 34.00]
                          ]
                        ]
                      },
                      "properties": {
                        "id": "urn:oid:actual",
                        "status": "Actual",
                        "event": "Fire Weather Watch",
                        "headline": "Critical fire weather expected",
                        "description": "Dry and windy conditions are expected.",
                        "instruction": "Avoid outdoor burning.",
                        "effective": "2026-03-29T15:00:00+00:00",
                        "expires": "2026-03-29T23:00:00+00:00",
                        "areaDesc": "Los Angeles County",
                        "geocode": {
                          "SAME": ["006037"],
                          "UGC": ["CAZ368", "CAC037"]
                        },
                        "affectedZones": [
                          "https://api.weather.gov/zones/fire/CAZ368"
                        ],
                        "@id": "https://api.weather.gov/alerts/actual"
                      }
                    },
                    {
                      "id": "https://api.weather.gov/alerts/test",
                      "properties": {
                        "id": "urn:oid:test",
                        "status": "Test",
                        "event": "Test Message",
                        "effective": "2026-03-29T15:00:00+00:00"
                      }
                    }
                  ]
                }
                """,
                "application/geo+json")));

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://api.weather.gov/")
        };

        var source = new NationalWeatherServiceSource(
            httpClient,
            Options.Create(new NationalWeatherServiceOptions()),
            NullLogger<NationalWeatherServiceSource>.Instance);

        var events = await source.FetchAsync(CancellationToken.None);

        var alert = Assert.Single(events);
        Assert.Equal(DisasterSourceKind.Nws, alert.Source);
        Assert.Equal(DisasterCategory.Fire, alert.Category);
        Assert.Equal(DisasterStatus.Active, alert.Status);
        Assert.Contains("CAZ368", alert.ZoneIds);
        Assert.Contains("037", alert.CountyFipsCodes);
        Assert.Equal(EndTimeConfidence.Medium, alert.EndTimeConfidence);
        Assert.Single(alert.FootprintPolygons);
    }

    [Fact]
    public async Task FetchAsync_handles_alerts_without_geometry()
    {
        var handler = new StubHttpMessageHandler((_, _) => Task.FromResult(
            StubHttpMessageHandler.JsonResponse(
                """
                {
                  "features": [
                    {
                      "id": "https://api.weather.gov/alerts/actual-no-geometry",
                      "geometry": null,
                      "properties": {
                        "id": "urn:oid:actual-no-geometry",
                        "status": "Actual",
                        "event": "Red Flag Warning",
                        "headline": "Critical fire weather ongoing",
                        "effective": "2026-03-29T15:00:00+00:00",
                        "expires": "2026-03-29T23:00:00+00:00",
                        "areaDesc": "Los Angeles County",
                        "geocode": {
                          "SAME": ["006037"],
                          "UGC": ["CAZ368", "CAC037"]
                        },
                        "@id": "https://api.weather.gov/alerts/actual-no-geometry"
                      }
                    }
                  ]
                }
                """,
                "application/geo+json")));

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://api.weather.gov/")
        };

        var source = new NationalWeatherServiceSource(
            httpClient,
            Options.Create(new NationalWeatherServiceOptions()),
            NullLogger<NationalWeatherServiceSource>.Instance);

        var alert = Assert.Single(await source.FetchAsync(CancellationToken.None));
        Assert.Empty(alert.FootprintPolygons);
        Assert.Contains("CAZ368", alert.ZoneIds);
    }
}
