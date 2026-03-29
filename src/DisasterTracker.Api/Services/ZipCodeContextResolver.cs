using System.Globalization;
using System.Net;
using System.Text.Json;
using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Support;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Services;

public sealed class ZipCodeContextResolver(
    IHttpClientFactory httpClientFactory,
    IMemoryCache memoryCache,
    IOptions<ZipCodeLookupOptions> options,
    IOptions<ZipBoundaryOptions> boundaryOptions,
    ILogger<ZipCodeContextResolver> logger) : IZipCodeContextResolver
{
    private readonly ZipCodeLookupOptions _options = options.Value;
    private readonly ZipBoundaryOptions _boundaryOptions = boundaryOptions.Value;

    public async Task<ZipCodeLocation> ResolveAsync(string zipCode, CancellationToken cancellationToken = default)
    {
        var normalizedZipCode = NormalizeZipCode(zipCode);
        return await memoryCache.GetOrCreateAsync(
                   $"zip-context:{normalizedZipCode}",
                   async cacheEntry =>
                   {
                       cacheEntry.AbsoluteExpirationRelativeToNow = _options.CacheDuration;
                       return await ResolveCoreAsync(normalizedZipCode, cancellationToken);
                   }) ??
               throw new InvalidOperationException($"The ZIP code context for {normalizedZipCode} could not be loaded.");
    }

    private async Task<ZipCodeLocation> ResolveCoreAsync(string zipCode, CancellationToken cancellationToken)
    {
        var zipLookupClient = httpClientFactory.CreateClient("zip-lookup");

        JsonDocument zipDocument;
        try
        {
            zipDocument = await zipLookupClient.GetJsonDocumentAsync($"us/{zipCode}", cancellationToken);
        }
        catch (HttpRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            throw new KeyNotFoundException($"ZIP code '{zipCode}' was not found.", exception);
        }

        using (zipDocument)
        {
            var places = zipDocument.RootElement.GetPropertyOrNull("places");
            if (places is null || places.Value.ValueKind != JsonValueKind.Array)
            {
                throw new InvalidOperationException($"ZIP lookup did not return any place information for '{zipCode}'.");
            }

            var primaryPlace = places.Value.EnumerateArray().FirstOrDefault();
            if (primaryPlace.ValueKind == JsonValueKind.Undefined)
            {
                throw new KeyNotFoundException($"ZIP code '{zipCode}' was not found.");
            }

            var latitude = double.Parse(primaryPlace.GetStringOrNull("latitude") ?? throw new InvalidOperationException("ZIP lookup response did not include a latitude."), CultureInfo.InvariantCulture);
            var longitude = double.Parse(primaryPlace.GetStringOrNull("longitude") ?? throw new InvalidOperationException("ZIP lookup response did not include a longitude."), CultureInfo.InvariantCulture);
            var city = primaryPlace.GetStringOrNull("place name") ?? "Unknown";
            var stateCode = primaryPlace.GetStringOrNull("state abbreviation") ?? throw new InvalidOperationException("ZIP lookup response did not include a state abbreviation.");

            var pointsClient = httpClientFactory.CreateClient("nws-points");
            var boundaryTask = LoadBoundaryPolygonsAsync(zipCode, cancellationToken);
            using var pointsDocument = await pointsClient.GetJsonDocumentAsync(
                $"points/{latitude.ToString(CultureInfo.InvariantCulture)},{longitude.ToString(CultureInfo.InvariantCulture)}",
                cancellationToken);
            var boundaryPolygons = await boundaryTask;

            var properties = pointsDocument.RootElement.GetPropertyOrNull("properties") ??
                             throw new InvalidOperationException("NWS points lookup did not return a properties object.");

            var forecastZoneId = DisasterDataHelpers.ExtractTrailingSegment(properties.GetStringOrNull("forecastZone"));
            var fireWeatherZoneId = DisasterDataHelpers.ExtractTrailingSegment(properties.GetStringOrNull("fireWeatherZone"));
            var countyZoneId = DisasterDataHelpers.ExtractTrailingSegment(properties.GetStringOrNull("county"));
            var sameCode = properties.GetPropertyOrNull("nwr") is { } nwr
                ? nwr.GetStringOrNull("sameCode")
                : null;

            return new ZipCodeLocation
            {
                ZipCode = zipCode,
                City = city,
                StateCode = stateCode.ToUpperInvariant(),
                Coordinates = new GeoPoint(latitude, longitude),
                ForecastZoneId = forecastZoneId,
                FireWeatherZoneId = fireWeatherZoneId,
                CountyZoneId = countyZoneId,
                CountyFipsCode = countyZoneId is null ? null : DisasterDataHelpers.ExtractCountyFipsFromZoneId(countyZoneId),
                SameCode = sameCode,
                ZoneIds = DisasterDataHelpers.NormalizeIdentifiers(new[]
                {
                    forecastZoneId,
                    fireWeatherZoneId,
                    countyZoneId
                }),
                BoundaryPolygons = boundaryPolygons
            };
        }
    }

    private async Task<IReadOnlyList<GeoPolygon>> LoadBoundaryPolygonsAsync(string zipCode, CancellationToken cancellationToken)
    {
        if (!_boundaryOptions.Enabled)
        {
            return Array.Empty<GeoPolygon>();
        }

        try
        {
            var boundaryClient = httpClientFactory.CreateClient("zip-boundaries");
            var requestUri =
                $"query?where={Uri.EscapeDataString($"ZCTA5='{zipCode}'")}&returnGeometry=true&outFields=ZCTA5&f=geojson";

            using var boundaryDocument = await boundaryClient.GetJsonDocumentAsync(requestUri, cancellationToken);
            var feature = boundaryDocument.RootElement.GetPropertyOrNull("features") is { } features &&
                          features.ValueKind == JsonValueKind.Array
                ? features.EnumerateArray().FirstOrDefault()
                : default;

            if (feature.ValueKind != JsonValueKind.Object)
            {
                logger.LogWarning("ZIP boundary lookup returned no geometry for {ZipCode}; using centroid-only matching.", zipCode);
                return Array.Empty<GeoPolygon>();
            }

            var geometry = feature.GetPropertyOrNull("geometry");
            if (geometry is null)
            {
                logger.LogWarning("ZIP boundary lookup returned a feature without geometry for {ZipCode}; using centroid-only matching.", zipCode);
                return Array.Empty<GeoPolygon>();
            }

            var boundaryPolygons = GeoJsonGeometryParser.ParsePolygons(geometry.Value);
            if (boundaryPolygons.Count == 0)
            {
                logger.LogWarning("ZIP boundary lookup geometry for {ZipCode} could not be parsed; using centroid-only matching.", zipCode);
            }

            return boundaryPolygons;
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "ZIP boundary lookup failed for {ZipCode}; using centroid-only matching.", zipCode);
            return Array.Empty<GeoPolygon>();
        }
        catch (JsonException exception)
        {
            logger.LogWarning(exception, "ZIP boundary lookup returned invalid JSON for {ZipCode}; using centroid-only matching.", zipCode);
            return Array.Empty<GeoPolygon>();
        }
    }

    private static string NormalizeZipCode(string rawZipCode)
    {
        if (string.IsNullOrWhiteSpace(rawZipCode))
        {
            throw new ArgumentException("A ZIP code is required.", nameof(rawZipCode));
        }

        var digits = new string(rawZipCode.Where(char.IsDigit).ToArray());
        if (digits.Length < 5)
        {
            throw new ArgumentException("ZIP codes must contain at least five digits.", nameof(rawZipCode));
        }

        return digits[..5];
    }
}
