using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Sources;
using DisasterTracker.Api.Tests.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Tests;

public sealed class UsgsDisasterSourceTests
{
    [Fact]
    public async Task FetchAsync_returns_only_us_events_that_clear_thresholds()
    {
        var handler = new StubHttpMessageHandler((_, _) => Task.FromResult(
            StubHttpMessageHandler.JsonResponse(
                """
                {
                  "features": [
                    {
                      "id": "ci41427496",
                      "properties": {
                        "mag": 2.2,
                        "place": "10 km SW of Idyllwild, CA",
                        "time": 1774798361620,
                        "sig": 76,
                        "alert": null,
                        "magType": "ml",
                        "url": "https://earthquake.usgs.gov/earthquakes/eventpage/ci41427496",
                        "title": "M 2.2 - 10 km SW of Idyllwild, CA"
                      },
                      "geometry": {
                        "type": "Point",
                        "coordinates": [-116.8015, 33.681, 16.56]
                      }
                    },
                    {
                      "id": "jp123",
                      "properties": {
                        "mag": 5.4,
                        "place": "Near the east coast of Honshu, Japan",
                        "time": 1774798361620,
                        "sig": 450,
                        "alert": "yellow",
                        "magType": "mb",
                        "url": "https://example.test/jp123",
                        "title": "M 5.4 - Near the east coast of Honshu, Japan"
                      },
                      "geometry": {
                        "type": "Point",
                        "coordinates": [141.0, 38.0, 30.0]
                      }
                    }
                  ]
                }
                """)));

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://earthquake.usgs.gov/")
        };

        var source = new UsgsDisasterSource(
            httpClient,
            Options.Create(new UsgsOptions
            {
                MinimumMagnitude = 2.0,
                MinimumSignificance = 50
            }));

        var events = await source.FetchAsync(CancellationToken.None);

        var earthquake = Assert.Single(events);
        Assert.Equal(DisasterSourceKind.Usgs, earthquake.Source);
        Assert.Equal(DisasterStatus.Monitoring, earthquake.Status);
        Assert.Equal(new[] { "CA" }, earthquake.StateCodes);
        Assert.NotNull(earthquake.Centroid);
        Assert.True(earthquake.RadiusKm > 0);
    }
}
