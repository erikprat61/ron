using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Services;
using DisasterTracker.Api.Tests.Support;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Tests;

public sealed class ZipCodeContextResolverTests
{
    [Fact]
    public async Task ResolveAsync_loads_zip_boundary_geometry_when_available()
    {
        using var zipLookupClient = new HttpClient(
            new StubHttpMessageHandler((_, _) => Task.FromResult(
                StubHttpMessageHandler.JsonResponse(
                    """
                    {
                      "post code": "90210",
                      "country": "United States",
                      "places": [
                        {
                          "place name": "Beverly Hills",
                          "state abbreviation": "CA",
                          "latitude": "34.0901",
                          "longitude": "-118.4065"
                        }
                      ]
                    }
                    """))))
        {
            BaseAddress = new Uri("https://api.zippopotam.us/")
        };

        using var pointsClient = new HttpClient(
            new StubHttpMessageHandler((_, _) => Task.FromResult(
                StubHttpMessageHandler.JsonResponse(
                    """
                    {
                      "properties": {
                        "forecastZone": "https://api.weather.gov/zones/forecast/CAZ368",
                        "fireWeatherZone": "https://api.weather.gov/zones/fire/CAZ368",
                        "county": "https://api.weather.gov/zones/county/CAC037",
                        "nwr": {
                          "sameCode": "006037"
                        }
                      }
                    }
                    """,
                    "application/geo+json"))))
        {
            BaseAddress = new Uri("https://api.weather.gov/")
        };

        using var boundaryClient = new HttpClient(
            new StubHttpMessageHandler((_, _) => Task.FromResult(
                StubHttpMessageHandler.JsonResponse(
                    """
                    {
                      "type": "FeatureCollection",
                      "features": [
                        {
                          "type": "Feature",
                          "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                              [
                                [-118.43, 34.07],
                                [-118.38, 34.07],
                                [-118.38, 34.11],
                                [-118.43, 34.11],
                                [-118.43, 34.07]
                              ]
                            ]
                          }
                        }
                      ]
                    }
                    """,
                    "application/geo+json"))))
        {
            BaseAddress = new Uri("https://tigerweb.geo.census.gov/")
        };

        var resolver = new ZipCodeContextResolver(
            new StubHttpClientFactory(new Dictionary<string, HttpClient>(StringComparer.OrdinalIgnoreCase)
            {
                ["zip-lookup"] = zipLookupClient,
                ["nws-points"] = pointsClient,
                ["zip-boundaries"] = boundaryClient
            }),
            new MemoryCache(new MemoryCacheOptions()),
            Options.Create(new ZipCodeLookupOptions()),
            Options.Create(new ZipBoundaryOptions()),
            NullLogger<ZipCodeContextResolver>.Instance);

        var location = await resolver.ResolveAsync("90210", CancellationToken.None);

        Assert.Equal("90210", location.ZipCode);
        Assert.Equal("CA", location.StateCode);
        Assert.Single(location.BoundaryPolygons);
        Assert.Contains("CAZ368", location.ZoneIds);
    }
}
