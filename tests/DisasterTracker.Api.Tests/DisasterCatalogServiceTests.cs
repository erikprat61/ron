using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Services;
using DisasterTracker.Api.Sources;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Tests;

public sealed class DisasterCatalogServiceTests
{
    [Fact]
    public async Task RefreshAsync_surfaces_source_failures_and_attaches_impacts()
    {
        var disasterEvent = new DisasterEvent
        {
            Id = "evt-1",
            Source = DisasterSourceKind.Nws,
            SourceEventId = "evt-1",
            Title = "Active wildfire conditions",
            Category = DisasterCategory.Fire,
            Severity = DisasterSeverity.Severe,
            Status = DisasterStatus.Active,
            StartedAt = DateTimeOffset.Parse("2026-03-29T12:00:00Z"),
            EndTimeConfidence = EndTimeConfidence.Medium,
            EndTimeExplanation = "Provided by an alert expiration window.",
            Summary = "Critical fire weather."
        };

        var impactSignal = new ResourceImpactSignal
        {
            ProfileId = "southern-plains-grain-cattle",
            Resource = "Wheat and cattle",
            Region = "Southern Plains",
            Summary = "Potential supply disruption.",
            Explanation = "A severe fire weather event can disrupt livestock and grain production.",
            Confidence = ImpactConfidence.High,
            EventIds = new[] { disasterEvent.Id },
            StateCodes = new[] { "OK" }
        };

        var service = new DisasterCatalogService(
            new IDisasterSourceClient[]
            {
                new StaticSource(DisasterSourceKind.Nws, new[] { disasterEvent }),
                new ThrowingSource(DisasterSourceKind.Fema)
            },
            Options.Create(new DisasterRefreshOptions
            {
                CacheDuration = TimeSpan.FromMinutes(5)
            }),
            new StaticImpactAnalyzer(new[] { impactSignal }),
            TimeProvider.System,
            NullLogger<DisasterCatalogService>.Instance);

        var snapshot = await service.RefreshAsync();

        Assert.Single(snapshot.Events);
        Assert.Single(snapshot.ResourceImpacts);
        Assert.Single(snapshot.Events[0].ImpactedResources);
        Assert.Equal(SourceHealthStatus.Unhealthy, snapshot.SourceHealth.Single(health => health.Source == DisasterSourceKind.Fema).Status);
        Assert.Equal(SourceHealthStatus.Healthy, snapshot.SourceHealth.Single(health => health.Source == DisasterSourceKind.Nws).Status);
    }

    private sealed class StaticSource(DisasterSourceKind source, IReadOnlyList<DisasterEvent> events) : IDisasterSourceClient
    {
        public DisasterSourceKind Source => source;

        public Task<IReadOnlyList<DisasterEvent>> FetchAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult(events);
        }
    }

    private sealed class ThrowingSource(DisasterSourceKind source) : IDisasterSourceClient
    {
        public DisasterSourceKind Source => source;

        public Task<IReadOnlyList<DisasterEvent>> FetchAsync(CancellationToken cancellationToken)
        {
            throw new HttpRequestException("boom");
        }
    }

    private sealed class StaticImpactAnalyzer(IReadOnlyList<ResourceImpactSignal> impacts) : IResourceImpactAnalyzer
    {
        public IReadOnlyList<ResourceImpactSignal> Analyze(IReadOnlyList<DisasterEvent> events)
        {
            return impacts;
        }
    }
}
