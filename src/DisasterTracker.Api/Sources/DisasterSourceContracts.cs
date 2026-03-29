using DisasterTracker.Api.Domain;

namespace DisasterTracker.Api.Sources;

public interface IDisasterSourceClient
{
    DisasterSourceKind Source { get; }

    Task<IReadOnlyList<DisasterEvent>> FetchAsync(CancellationToken cancellationToken);
}
