namespace DisasterTracker.Api.Tests.Support;

public sealed class StubHttpClientFactory(IReadOnlyDictionary<string, HttpClient> clients) : IHttpClientFactory
{
    private readonly IReadOnlyDictionary<string, HttpClient> _clients = clients;

    public HttpClient CreateClient(string name)
    {
        return _clients.TryGetValue(name, out var client)
            ? client
            : throw new KeyNotFoundException($"No stub HttpClient was registered for '{name}'.");
    }
}
