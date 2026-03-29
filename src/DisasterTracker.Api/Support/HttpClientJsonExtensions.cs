using System.Text.Json;

namespace DisasterTracker.Api.Support;

public static class HttpClientJsonExtensions
{
    public static async Task<JsonDocument> GetJsonDocumentAsync(this HttpClient httpClient, string requestUri, CancellationToken cancellationToken)
    {
        using var response = await httpClient.GetAsync(requestUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }
}
