using System.Text.Json;
using System.Text.Json.Serialization;
using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Services;

public sealed class ResourceImpactAnalyzer : IResourceImpactAnalyzer
{
    private static readonly JsonSerializerOptions ProfileSerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters =
        {
            new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)
        }
    };

    private readonly IReadOnlyList<StrategicResourceProfile> _profiles;

    public ResourceImpactAnalyzer(IOptions<SupplyImpactOptions> options, IHostEnvironment hostEnvironment)
        : this(LoadProfiles(Path.Combine(hostEnvironment.ContentRootPath, options.Value.ResourceProfilePath)))
    {
    }

    internal ResourceImpactAnalyzer(IReadOnlyList<StrategicResourceProfile> profiles)
    {
        _profiles = profiles;
    }

    public IReadOnlyList<ResourceImpactSignal> Analyze(IReadOnlyList<DisasterEvent> events)
    {
        var signals = new List<ResourceImpactSignal>();
        foreach (var disasterEvent in events)
        {
            if (disasterEvent.Status == DisasterStatus.Resolved)
            {
                continue;
            }

            foreach (var profile in _profiles)
            {
                if (!MatchesProfile(profile, disasterEvent))
                {
                    continue;
                }

                var overlappingStates = profile.StateCodes.Count == 0
                    ? disasterEvent.StateCodes
                    : profile.StateCodes
                        .Intersect(disasterEvent.StateCodes, StringComparer.OrdinalIgnoreCase)
                        .ToArray();

                signals.Add(new ResourceImpactSignal
                {
                    ProfileId = profile.Id,
                    Resource = profile.Resource,
                    Region = profile.Region,
                    Summary = $"{profile.Summary} Triggered by '{disasterEvent.Title}'.",
                    Explanation = $"{profile.Explanation} Current event: '{disasterEvent.Title}'.",
                    Confidence = CalculateConfidence(profile, disasterEvent),
                    EventIds = new[] { disasterEvent.Id },
                    StateCodes = overlappingStates.Count == 0 ? profile.StateCodes : overlappingStates
                });
            }
        }

        return signals
            .OrderByDescending(signal => signal.Confidence)
            .ThenBy(signal => signal.Resource, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static bool MatchesProfile(StrategicResourceProfile profile, DisasterEvent disasterEvent)
    {
        if (profile.Categories.Count > 0 && !profile.Categories.Contains(disasterEvent.Category))
        {
            return false;
        }

        if (disasterEvent.Severity < profile.MinimumSeverity)
        {
            return false;
        }

        if (profile.MinimumMagnitude is not null &&
            (!disasterEvent.Magnitude.HasValue || disasterEvent.Magnitude.Value < profile.MinimumMagnitude.Value))
        {
            return false;
        }

        if (profile.StateCodes.Count > 0 &&
            !profile.StateCodes.Intersect(disasterEvent.StateCodes, StringComparer.OrdinalIgnoreCase).Any())
        {
            return false;
        }

        if (profile.CountyFipsCodes.Count > 0 &&
            !profile.CountyFipsCodes.Intersect(disasterEvent.CountyFipsCodes, StringComparer.OrdinalIgnoreCase).Any())
        {
            return false;
        }

        if (profile.LocationBounds.Count > 0)
        {
            if (disasterEvent.Centroid is null ||
                !profile.LocationBounds.Any(bounds => GeoMath.Contains(bounds, disasterEvent.Centroid.Value)))
            {
                return false;
            }
        }

        if (profile.LocationKeywords.Count > 0)
        {
            var locationText = BuildLocationText(disasterEvent);
            if (!profile.LocationKeywords.Any(keyword => locationText.Contains(keyword, StringComparison.OrdinalIgnoreCase)))
            {
                return false;
            }
        }

        return true;
    }

    private static ImpactConfidence CalculateConfidence(StrategicResourceProfile profile, DisasterEvent disasterEvent)
    {
        if (profile.CountyFipsCodes.Count > 0 &&
            profile.CountyFipsCodes.Intersect(disasterEvent.CountyFipsCodes, StringComparer.OrdinalIgnoreCase).Any())
        {
            return ImpactConfidence.High;
        }

        if (profile.LocationBounds.Count > 0 &&
            disasterEvent.Centroid is not null &&
            profile.LocationBounds.Any(bounds => GeoMath.Contains(bounds, disasterEvent.Centroid.Value)))
        {
            return disasterEvent.Severity >= DisasterSeverity.Severe
                ? ImpactConfidence.High
                : ImpactConfidence.Medium;
        }

        if (disasterEvent.Magnitude is >= 6.0 || disasterEvent.Severity >= DisasterSeverity.Severe)
        {
            return ImpactConfidence.High;
        }

        return disasterEvent.Severity >= DisasterSeverity.Moderate
            ? ImpactConfidence.Medium
            : ImpactConfidence.Low;
    }

    private static string BuildLocationText(DisasterEvent disasterEvent)
    {
        return string.Join(
            ' ',
            new[]
            {
                disasterEvent.Title,
                disasterEvent.AreaDescription,
                disasterEvent.Description,
                disasterEvent.SourceUrl,
                string.Join(' ', disasterEvent.StateCodes)
            }.Where(value => !string.IsNullOrWhiteSpace(value)));
    }

    private static IReadOnlyList<StrategicResourceProfile> LoadProfiles(string path)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Strategic resource profile catalog not found at '{path}'.", path);
        }

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<List<StrategicResourceProfile>>(json, ProfileSerializerOptions) ??
               throw new InvalidOperationException("Strategic resource profile catalog could not be deserialized.");
    }
}
