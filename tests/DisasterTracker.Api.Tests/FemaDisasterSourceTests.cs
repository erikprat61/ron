using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Sources;
using DisasterTracker.Api.Tests.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Tests;

public sealed class FemaDisasterSourceTests
{
    [Fact]
    public async Task FetchAsync_maps_active_declarations()
    {
        var requestPath = string.Empty;
        var handler = new StubHttpMessageHandler((request, _) =>
        {
            requestPath = request.RequestUri!.PathAndQuery;
            return Task.FromResult(
                StubHttpMessageHandler.JsonResponse(
                    """
                    {
                      "DisasterDeclarationsSummaries": [
                        {
                          "id": "34315452-1557-4343-9900-0b52feba2378",
                          "femaDeclarationString": "FM-5627-OK",
                          "state": "OK",
                          "declarationType": "FM",
                          "declarationDate": "2026-03-22T00:00:00.000Z",
                          "incidentType": "Fire",
                          "declarationTitle": "DIBBLE CREEK FIRE",
                          "incidentBeginDate": "2026-03-22T00:00:00.000Z",
                          "incidentEndDate": null,
                          "fipsCountyCode": "087",
                          "designatedArea": "McClain (County)",
                          "disasterNumber": 5627
                        }
                      ]
                    }
                    """));
        });

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://www.fema.gov/api/open/v2/")
        };

        var source = new FemaDisasterSource(
            httpClient,
            Options.Create(new FemaOptions
            {
                ActiveWindowDays = 365,
                MaxRecords = 50
            }),
            TimeProvider.System);

        var events = await source.FetchAsync(CancellationToken.None);

        var declaration = Assert.Single(events);
        Assert.Contains("incidentEndDate%20eq%20null", requestPath);
        Assert.Equal(DisasterSourceKind.Fema, declaration.Source);
        Assert.Equal(DisasterStatus.Active, declaration.Status);
        Assert.Equal(DisasterSeverity.Severe, declaration.Severity);
        Assert.Equal(new[] { "OK" }, declaration.StateCodes);
        Assert.Equal(new[] { "087" }, declaration.CountyFipsCodes);
    }
}
