using DisasterTracker.Api.Domain;

namespace DisasterTracker.Api.Services;

public interface IDisasterCatalogService
{
    Task<DisasterSnapshot> GetSnapshotAsync(bool forceRefresh = false, CancellationToken cancellationToken = default);

    Task<DisasterSnapshot> RefreshAsync(CancellationToken cancellationToken = default);
}

public interface IZipCodeContextResolver
{
    Task<ZipCodeLocation> ResolveAsync(string zipCode, CancellationToken cancellationToken = default);
}

public interface IDisasterEventMatcher
{
    IReadOnlyList<ZipCodeImpactMatch> Match(ZipCodeLocation location, IReadOnlyList<DisasterEvent> events);
}

public interface IResourceImpactAnalyzer
{
    IReadOnlyList<ResourceImpactSignal> Analyze(IReadOnlyList<DisasterEvent> events);
}
