using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Services;

public sealed class DisasterSourceHealthCheck(
    IDisasterCatalogService disasterCatalogService,
    IOptions<DisasterRefreshOptions> options,
    TimeProvider timeProvider) : IHealthCheck
{
    private readonly DisasterRefreshOptions _options = options.Value;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var snapshot = await disasterCatalogService.GetSnapshotAsync(cancellationToken: cancellationToken);
        if (snapshot.SourceHealth.Count == 0)
        {
            return HealthCheckResult.Unhealthy("No disaster sources are configured.");
        }

        var staleFor = timeProvider.GetUtcNow() - snapshot.GeneratedAt;
        if (staleFor > _options.MaxHealthyStaleness)
        {
            return HealthCheckResult.Degraded(
                $"Disaster snapshot is stale by {staleFor:g}.",
                data: CreateHealthData(snapshot.SourceHealth, snapshot.GeneratedAt));
        }

        var unhealthySources = snapshot.SourceHealth.Count(source => source.Status != SourceHealthStatus.Healthy);
        if (unhealthySources == snapshot.SourceHealth.Count)
        {
            return HealthCheckResult.Unhealthy(
                "All configured disaster sources are currently failing.",
                data: CreateHealthData(snapshot.SourceHealth, snapshot.GeneratedAt));
        }

        if (unhealthySources > 0)
        {
            return HealthCheckResult.Degraded(
                "One or more disaster sources are currently failing.",
                data: CreateHealthData(snapshot.SourceHealth, snapshot.GeneratedAt));
        }

        return HealthCheckResult.Healthy(
            "Disaster sources refreshed successfully.",
            data: CreateHealthData(snapshot.SourceHealth, snapshot.GeneratedAt));
    }

    private static Dictionary<string, object> CreateHealthData(IReadOnlyList<SourceHealthSnapshot> sourceHealth, DateTimeOffset generatedAt)
    {
        return new Dictionary<string, object>
        {
            ["generatedAt"] = generatedAt,
            ["sources"] = sourceHealth.Select(source => new
            {
                source = source.Source,
                status = source.Status,
                source.LastAttemptedRefreshUtc,
                source.LastSuccessfulRefreshUtc,
                source.EventCount,
                source.ErrorMessage
            }).ToArray()
        };
    }
}
