using System.Collections.Concurrent;
using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Sources;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Services;

public sealed class DisasterCatalogService(
    IEnumerable<IDisasterSourceClient> sources,
    IOptions<DisasterRefreshOptions> options,
    IResourceImpactAnalyzer resourceImpactAnalyzer,
    TimeProvider timeProvider,
    ILogger<DisasterCatalogService> logger) : IDisasterCatalogService
{
    private readonly IReadOnlyList<IDisasterSourceClient> _sources = sources.ToArray();
    private readonly DisasterRefreshOptions _options = options.Value;
    private readonly ConcurrentDictionary<DisasterSourceKind, DateTimeOffset> _lastSuccessfulRefresh = new();
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    private DisasterSnapshot? _snapshot;

    public Task<DisasterSnapshot> GetSnapshotAsync(bool forceRefresh = false, CancellationToken cancellationToken = default)
    {
        return RefreshCoreAsync(forceRefresh, cancellationToken);
    }

    public Task<DisasterSnapshot> RefreshAsync(CancellationToken cancellationToken = default)
    {
        return RefreshCoreAsync(forceRefresh: true, cancellationToken);
    }

    private async Task<DisasterSnapshot> RefreshCoreAsync(bool forceRefresh, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        if (!forceRefresh &&
            _snapshot is not null &&
            now - _snapshot.GeneratedAt < _options.CacheDuration)
        {
            return _snapshot;
        }

        await _refreshLock.WaitAsync(cancellationToken);
        try
        {
            now = timeProvider.GetUtcNow();
            if (!forceRefresh &&
                _snapshot is not null &&
                now - _snapshot.GeneratedAt < _options.CacheDuration)
            {
                return _snapshot;
            }

            var refreshedSnapshot = await BuildSnapshotAsync(cancellationToken);
            _snapshot = refreshedSnapshot;
            return refreshedSnapshot;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private async Task<DisasterSnapshot> BuildSnapshotAsync(CancellationToken cancellationToken)
    {
        var generatedAt = timeProvider.GetUtcNow();
        var refreshResults = await Task.WhenAll(_sources.Select(source => RefreshSourceAsync(source, cancellationToken)));

        var orderedEvents = refreshResults
            .SelectMany(result => result.Events)
            .OrderByDescending(disasterEvent => disasterEvent.Status == DisasterStatus.Active)
            .ThenByDescending(disasterEvent => disasterEvent.Severity)
            .ThenByDescending(disasterEvent => disasterEvent.StartedAt)
            .ToArray();

        var impacts = resourceImpactAnalyzer.Analyze(orderedEvents);
        var impactsByEventId = impacts
            .SelectMany(signal => signal.EventIds.Select(eventId => (eventId, signal)))
            .GroupBy(item => item.eventId, item => item.signal, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => (IReadOnlyList<ResourceImpactSignal>)group.ToArray(), StringComparer.OrdinalIgnoreCase);

        foreach (var disasterEvent in orderedEvents)
        {
            disasterEvent.ImpactedResources = impactsByEventId.TryGetValue(disasterEvent.Id, out var disasterImpacts)
                ? disasterImpacts
                : Array.Empty<ResourceImpactSignal>();
        }

        return new DisasterSnapshot
        {
            GeneratedAt = generatedAt,
            Events = orderedEvents,
            SourceHealth = refreshResults.Select(result => result.Health).ToArray(),
            ResourceImpacts = impacts
        };
    }

    private async Task<SourceRefreshResult> RefreshSourceAsync(IDisasterSourceClient source, CancellationToken cancellationToken)
    {
        var attemptedAt = timeProvider.GetUtcNow();

        try
        {
            var events = await source.FetchAsync(cancellationToken);
            _lastSuccessfulRefresh[source.Source] = attemptedAt;

            return new SourceRefreshResult(
                events,
                new SourceHealthSnapshot
                {
                    Source = source.Source,
                    Status = SourceHealthStatus.Healthy,
                    LastAttemptedRefreshUtc = attemptedAt,
                    LastSuccessfulRefreshUtc = attemptedAt,
                    EventCount = events.Count
                });
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(exception, "Refreshing disaster source {Source} failed.", source.Source);

            return new SourceRefreshResult(
                Array.Empty<DisasterEvent>(),
                new SourceHealthSnapshot
                {
                    Source = source.Source,
                    Status = SourceHealthStatus.Unhealthy,
                    LastAttemptedRefreshUtc = attemptedAt,
                    LastSuccessfulRefreshUtc = _lastSuccessfulRefresh.TryGetValue(source.Source, out var lastSuccessful)
                        ? lastSuccessful
                        : null,
                    EventCount = 0,
                    ErrorMessage = exception.Message
                });
        }
    }

    private sealed record SourceRefreshResult(
        IReadOnlyList<DisasterEvent> Events,
        SourceHealthSnapshot Health);
}
