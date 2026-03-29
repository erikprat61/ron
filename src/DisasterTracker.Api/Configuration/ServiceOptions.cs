namespace DisasterTracker.Api.Configuration;

public sealed class DisasterRefreshOptions
{
    public const string SectionName = "DisasterRefresh";

    public TimeSpan CacheDuration { get; init; } = TimeSpan.FromMinutes(10);

    public TimeSpan BackgroundRefreshInterval { get; init; } = TimeSpan.FromMinutes(5);

    public bool WarmCacheOnStartup { get; init; } = true;

    public TimeSpan MaxHealthyStaleness { get; init; } = TimeSpan.FromMinutes(30);
}

public sealed class NationalWeatherServiceOptions
{
    public const string SectionName = "NationalWeatherService";

    public bool Enabled { get; init; } = true;

    public string BaseUrl { get; init; } = "https://api.weather.gov";

    public string UserAgent { get; init; } = "DisasterTracker.Api/1.0 (contact@example.com)";

    public int TimeoutSeconds { get; init; } = 20;
}

public sealed class FemaOptions
{
    public const string SectionName = "Fema";

    public bool Enabled { get; init; } = true;

    public string BaseUrl { get; init; } = "https://www.fema.gov/api/open/v2/";

    public int TimeoutSeconds { get; init; } = 20;

    public int ActiveWindowDays { get; init; } = 365;

    public int MaxRecords { get; init; } = 250;
}

public sealed class UsgsOptions
{
    public const string SectionName = "Usgs";

    public bool Enabled { get; init; } = true;

    public string BaseUrl { get; init; } = "https://earthquake.usgs.gov/";

    public int TimeoutSeconds { get; init; } = 20;

    public double MinimumMagnitude { get; init; } = 1.5;

    public int MinimumSignificance { get; init; } = 50;
}

public sealed class EonetOptions
{
    public const string SectionName = "Eonet";

    public bool Enabled { get; init; } = true;

    public string BaseUrl { get; init; } = "https://eonet.gsfc.nasa.gov/api/v3/";

    public int TimeoutSeconds { get; init; } = 20;

    public int MaxRecords { get; init; } = 250;
}

public sealed class ZipCodeLookupOptions
{
    public const string SectionName = "ZipCodeLookup";

    public string BaseUrl { get; init; } = "https://api.zippopotam.us/";

    public int TimeoutSeconds { get; init; } = 15;

    public TimeSpan CacheDuration { get; init; } = TimeSpan.FromHours(24);
}

public sealed class ZipBoundaryOptions
{
    public const string SectionName = "ZipBoundary";

    public bool Enabled { get; init; } = true;

    public string BaseUrl { get; init; } = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/";

    public int TimeoutSeconds { get; init; } = 20;
}

public sealed class SupplyImpactOptions
{
    public const string SectionName = "SupplyImpact";

    public string ResourceProfilePath { get; init; } = "Data/strategic-resource-profiles.json";
}
