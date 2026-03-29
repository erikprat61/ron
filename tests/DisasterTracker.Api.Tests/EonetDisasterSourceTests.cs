using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Sources;
using DisasterTracker.Api.Tests.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Tests;

public sealed class EonetDisasterSourceTests
{
    [Fact]
    public async Task FetchAsync_maps_open_global_events_and_preserves_us_context()
    {
        var handler = new StubHttpMessageHandler((_, _) => Task.FromResult(
            StubHttpMessageHandler.JsonResponse(
                """
                {
                  "events": [
                    {
                      "id": "EONET_18975",
                      "title": "Rx Hardin 2806 Prescribed Fire, Hardin, Texas",
                      "description": null,
                      "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_18975",
                      "closed": null,
                      "categories": [
                        {
                          "id": "wildfires",
                          "title": "Wildfires"
                        }
                      ],
                      "sources": [
                        {
                          "id": "IRWIN",
                          "url": "https://irwin.doi.gov/observer/incidents/71af63bd-2474-4459-9992-de83e1205af0"
                        }
                      ],
                      "geometry": [
                        {
                          "magnitudeValue": 650.0,
                          "magnitudeUnit": "acres",
                          "date": "2026-03-27T12:21:00Z",
                          "type": "Point",
                          "coordinates": [-94.34081, 30.3957]
                        }
                      ]
                    },
                    {
                      "id": "EONET_20000",
                      "title": "Seasonal flooding near Chiang Rai, Thailand",
                      "description": "Flood conditions remain active.",
                      "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_20000",
                      "closed": null,
                      "categories": [
                        {
                          "id": "floods",
                          "title": "Floods"
                        }
                      ],
                      "geometry": [
                        {
                          "date": "2026-03-28T00:00:00Z",
                          "type": "Polygon",
                          "coordinates": [
                            [
                              [99.80, 19.85],
                              [99.95, 19.85],
                              [99.95, 19.95],
                              [99.80, 19.95],
                              [99.80, 19.85]
                            ]
                          ]
                        }
                      ]
                    }
                  ]
                }
                """)));

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://eonet.gsfc.nasa.gov/api/v3/")
        };

        var source = new EonetDisasterSource(
            httpClient,
            Options.Create(new EonetOptions
            {
                Enabled = true,
                MaxRecords = 10
            }));

        var events = await source.FetchAsync(CancellationToken.None);

        Assert.Equal(2, events.Count);

        var wildfire = Assert.Single(events, item => item.SourceEventId == "EONET_18975");
        Assert.Equal(DisasterSourceKind.Eonet, wildfire.Source);
        Assert.Equal(DisasterCategory.Fire, wildfire.Category);
        Assert.Equal(DisasterStatus.Active, wildfire.Status);
        Assert.Equal(new[] { "TX" }, wildfire.StateCodes);
        Assert.NotNull(wildfire.Centroid);
        Assert.True(wildfire.RadiusKm >= 10);
        Assert.Empty(wildfire.FootprintPolygons);

        var flood = Assert.Single(events, item => item.SourceEventId == "EONET_20000");
        Assert.Equal(DisasterCategory.Flood, flood.Category);
        Assert.Empty(flood.StateCodes);
        Assert.NotNull(flood.Centroid);
        Assert.True(flood.RadiusKm > 0);
        Assert.Single(flood.FootprintPolygons);
    }
}
