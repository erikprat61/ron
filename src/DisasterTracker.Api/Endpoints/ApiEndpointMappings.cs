using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DisasterTracker.Api.Endpoints;

public static class ApiEndpointMappings
{
    public static IEndpointRouteBuilder MapDisasterTrackerApi(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/api");

        var disasters = api.MapGroup("/disasters").WithTags("Disasters");
        disasters.MapGet("/active", GetActiveDisasters)
            .WithName("GetActiveDisasters")
            .WithSummary("List active and monitoring disasters")
            .WithDescription("Returns normalized active disaster records aggregated from NWS, FEMA, and USGS.");

        disasters.MapGet("/zip/{zipCode}", GetZipImpact)
            .WithName("GetZipImpact")
            .WithSummary("Check whether a ZIP code is currently impacted")
            .WithDescription("Resolves a ZIP code to a point, weather zones, and county context, then matches active disaster records.");

        disasters.MapGet("/{id}", GetDisasterById)
            .WithName("GetDisasterById")
            .WithSummary("Get a single normalized disaster record")
            .WithDescription("Looks up a normalized disaster record by its API identifier.");

        var impacts = api.MapGroup("/impacts").WithTags("Resource impacts");
        impacts.MapGet("/resources", GetResourceImpacts)
            .WithName("GetResourceImpacts")
            .WithSummary("List heuristic resource and supply impact signals")
            .WithDescription("Uses rule-based strategic resource profiles to surface possible supply impacts from active events.");

        var sources = api.MapGroup("/sources").WithTags("Operations");
        sources.MapGet("/health", GetSourceHealth)
            .WithName("GetSourceHealth")
            .WithSummary("Inspect source freshness and failures")
            .WithDescription("Returns per-source refresh status so data gaps are visible to consumers.");

        return endpoints;
    }

    private static async Task<IResult> GetActiveDisasters(
        [AsParameters] DisasterSearchQuery query,
        IDisasterCatalogService disasterCatalogService,
        CancellationToken cancellationToken)
    {
        var snapshot = await disasterCatalogService.GetSnapshotAsync(cancellationToken: cancellationToken);
        var events = ApplyDisasterFilters(snapshot.Events, query);

        return TypedResults.Ok(new DisasterSearchResponse
        {
            GeneratedAt = snapshot.GeneratedAt,
            Items = events
        });
    }

    private static async Task<IResult> GetZipImpact(
        string zipCode,
        [AsParameters] ZipImpactQuery query,
        IZipCodeContextResolver zipCodeContextResolver,
        IDisasterCatalogService disasterCatalogService,
        IDisasterEventMatcher disasterEventMatcher,
        CancellationToken cancellationToken)
    {
        try
        {
            var location = await zipCodeContextResolver.ResolveAsync(zipCode, cancellationToken);
            var snapshot = await disasterCatalogService.GetSnapshotAsync(cancellationToken: cancellationToken);
            var filteredEvents = ApplySourceFilter(snapshot.Events, query.Source).ToArray();
            var matches = disasterEventMatcher.Match(location, filteredEvents);

            return TypedResults.Ok(new ZipImpactResponse
            {
                GeneratedAt = snapshot.GeneratedAt,
                Location = location,
                Matches = matches
            });
        }
        catch (ArgumentException exception)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["zipCode"] = new[] { exception.Message }
            });
        }
        catch (KeyNotFoundException exception)
        {
            return TypedResults.NotFound(new ProblemDetails
            {
                Title = "ZIP code not found",
                Detail = exception.Message,
                Status = StatusCodes.Status404NotFound
            });
        }
    }

    private static async Task<IResult> GetDisasterById(
        string id,
        IDisasterCatalogService disasterCatalogService,
        CancellationToken cancellationToken)
    {
        var snapshot = await disasterCatalogService.GetSnapshotAsync(cancellationToken: cancellationToken);
        var disasterEvent = snapshot.Events.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (disasterEvent is null)
        {
            return TypedResults.NotFound(new ProblemDetails
            {
                Title = "Disaster not found",
                Detail = $"No disaster record with id '{id}' exists in the current snapshot.",
                Status = StatusCodes.Status404NotFound
            });
        }

        return TypedResults.Ok(disasterEvent);
    }

    private static async Task<IResult> GetResourceImpacts(
        [AsParameters] ResourceImpactQuery query,
        IDisasterCatalogService disasterCatalogService,
        CancellationToken cancellationToken)
    {
        var snapshot = await disasterCatalogService.GetSnapshotAsync(cancellationToken: cancellationToken);
        var impacts = snapshot.ResourceImpacts.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(query.State))
        {
            var stateCode = query.State.Trim().ToUpperInvariant();
            impacts = impacts.Where(signal => signal.StateCodes.Contains(stateCode, StringComparer.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(query.Resource))
        {
            impacts = impacts.Where(signal =>
                signal.Resource.Contains(query.Resource, StringComparison.OrdinalIgnoreCase) ||
                signal.Region.Contains(query.Resource, StringComparison.OrdinalIgnoreCase));
        }

        if (query.MinimumConfidence is not null)
        {
            impacts = impacts.Where(signal => signal.Confidence >= query.MinimumConfidence.Value);
        }

        return TypedResults.Ok(new ResourceImpactResponse
        {
            GeneratedAt = snapshot.GeneratedAt,
            Items = impacts.ToArray()
        });
    }

    private static async Task<IResult> GetSourceHealth(
        IDisasterCatalogService disasterCatalogService,
        CancellationToken cancellationToken)
    {
        var snapshot = await disasterCatalogService.GetSnapshotAsync(cancellationToken: cancellationToken);
        return TypedResults.Ok(new SourceHealthResponse
        {
            GeneratedAt = snapshot.GeneratedAt,
            Items = snapshot.SourceHealth
        });
    }

    private static IReadOnlyList<DisasterEvent> ApplyDisasterFilters(IReadOnlyList<DisasterEvent> events, DisasterSearchQuery query)
    {
        var filtered = ApplySourceFilter(events, query.Source);

        if (!string.IsNullOrWhiteSpace(query.Category))
        {
            filtered = filtered.Where(disasterEvent =>
                string.Equals(disasterEvent.Category.ToString(), query.Category, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(query.Severity))
        {
            filtered = filtered.Where(disasterEvent =>
                string.Equals(disasterEvent.Severity.ToString(), query.Severity, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(query.State))
        {
            var stateCode = query.State.Trim().ToUpperInvariant();
            filtered = filtered.Where(disasterEvent =>
                disasterEvent.StateCodes.Contains(stateCode, StringComparer.OrdinalIgnoreCase));
        }

        filtered = query.Status is null
            ? filtered.Where(disasterEvent => disasterEvent.Status != DisasterStatus.Resolved)
            : filtered.Where(disasterEvent => disasterEvent.Status == query.Status);

        filtered = filtered
            .OrderByDescending(disasterEvent => disasterEvent.Status == DisasterStatus.Active)
            .ThenByDescending(disasterEvent => disasterEvent.Severity)
            .ThenByDescending(disasterEvent => disasterEvent.StartedAt);

        if (query.Limit is > 0)
        {
            filtered = filtered.Take(Math.Min(query.Limit.Value, 250));
        }

        return filtered.ToArray();
    }

    private static IEnumerable<DisasterEvent> ApplySourceFilter(IEnumerable<DisasterEvent> events, string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return events;
        }

        return events.Where(disasterEvent =>
            string.Equals(disasterEvent.Source.ToString(), source, StringComparison.OrdinalIgnoreCase));
    }
}
