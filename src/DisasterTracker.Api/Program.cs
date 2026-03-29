using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Endpoints;
using DisasterTracker.Api.Services;
using DisasterTracker.Api.Sources;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info.Title = "Disaster Tracker API";
        document.Info.Version = "v1";
        document.Info.Description =
            "Aggregates free public disaster feeds for U.S.-first situational awareness, optional global coverage, ZIP code lookups, and resource-impact heuristics.";

        return Task.CompletedTask;
    });
});

builder.Services.Configure<DisasterRefreshOptions>(builder.Configuration.GetSection(DisasterRefreshOptions.SectionName));
builder.Services.Configure<NationalWeatherServiceOptions>(builder.Configuration.GetSection(NationalWeatherServiceOptions.SectionName));
builder.Services.Configure<FemaOptions>(builder.Configuration.GetSection(FemaOptions.SectionName));
builder.Services.Configure<UsgsOptions>(builder.Configuration.GetSection(UsgsOptions.SectionName));
builder.Services.Configure<EonetOptions>(builder.Configuration.GetSection(EonetOptions.SectionName));
builder.Services.Configure<ZipCodeLookupOptions>(builder.Configuration.GetSection(ZipCodeLookupOptions.SectionName));
builder.Services.Configure<ZipBoundaryOptions>(builder.Configuration.GetSection(ZipBoundaryOptions.SectionName));
builder.Services.Configure<SupplyImpactOptions>(builder.Configuration.GetSection(SupplyImpactOptions.SectionName));

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);

builder.Services.AddSingleton<IDisasterCatalogService, DisasterCatalogService>();
builder.Services.AddSingleton<IResourceImpactAnalyzer, ResourceImpactAnalyzer>();
builder.Services.AddSingleton<IZipCodeContextResolver, ZipCodeContextResolver>();
builder.Services.AddSingleton<IDisasterEventMatcher, DisasterEventMatcher>();
builder.Services.AddHostedService<DisasterRefreshWorker>();

builder.Services.AddSingleton<IDisasterSourceClient>(serviceProvider =>
    serviceProvider.GetRequiredService<NationalWeatherServiceSource>());
builder.Services.AddSingleton<IDisasterSourceClient>(serviceProvider =>
    serviceProvider.GetRequiredService<FemaDisasterSource>());
builder.Services.AddSingleton<IDisasterSourceClient>(serviceProvider =>
    serviceProvider.GetRequiredService<UsgsDisasterSource>());
builder.Services.AddSingleton<IDisasterSourceClient>(serviceProvider =>
    serviceProvider.GetRequiredService<EonetDisasterSource>());

builder.Services.AddHttpClient<NationalWeatherServiceSource>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<NationalWeatherServiceOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(options.UserAgent);
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/geo+json"));
});

builder.Services.AddHttpClient<FemaDisasterSource>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<FemaOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
});

builder.Services.AddHttpClient<UsgsDisasterSource>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<UsgsOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
});

builder.Services.AddHttpClient<EonetDisasterSource>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<EonetOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
});

builder.Services.AddHttpClient("zip-lookup", (serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<ZipCodeLookupOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
});

builder.Services.AddHttpClient("nws-points", (serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<NationalWeatherServiceOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.UserAgent.ParseAdd(options.UserAgent);
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/geo+json"));
});

builder.Services.AddHttpClient("zip-boundaries", (serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<ZipBoundaryOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/geo+json"));
});

builder.Services
    .AddHealthChecks()
    .AddCheck<DisasterSourceHealthCheck>("disaster-sources");

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapGet("/", () => TypedResults.Ok(new
{
    service = "Disaster Tracker API",
    version = "v1",
    health = "/health",
    activeDisasters = "/api/disasters/active",
    zipLookup = "/api/disasters/zip/{zipCode}",
    openApi = app.Environment.IsDevelopment() ? "/openapi/v1.json" : null
}))
.ExcludeFromDescription();

app.MapHealthChecks("/health", new HealthCheckOptions());
app.MapDisasterTrackerApi();

app.Run();

public partial class Program
{
}
