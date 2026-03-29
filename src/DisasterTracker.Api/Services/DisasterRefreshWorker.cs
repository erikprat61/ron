using DisasterTracker.Api.Configuration;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Services;

public sealed class DisasterRefreshWorker(
    IDisasterCatalogService disasterCatalogService,
    IOptions<DisasterRefreshOptions> options,
    ILogger<DisasterRefreshWorker> logger) : BackgroundService
{
    private readonly DisasterRefreshOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (_options.WarmCacheOnStartup)
        {
            try
            {
                await disasterCatalogService.RefreshAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Initial disaster feed warm-up failed.");
            }
        }

        if (_options.BackgroundRefreshInterval <= TimeSpan.Zero)
        {
            return;
        }

        using var timer = new PeriodicTimer(_options.BackgroundRefreshInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await disasterCatalogService.RefreshAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Background disaster refresh failed.");
            }
        }
    }
}
