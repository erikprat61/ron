using System.Text.Json;
using DisasterTracker.Api.Configuration;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Support;
using Microsoft.Extensions.Options;

namespace DisasterTracker.Api.Sources;

public sealed class FemaDisasterSource(
    HttpClient httpClient,
    IOptions<FemaOptions> options,
    TimeProvider timeProvider) : IDisasterSourceClient
{
    public DisasterSourceKind Source => DisasterSourceKind.Fema;

    public async Task<IReadOnlyList<DisasterEvent>> FetchAsync(CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return Array.Empty<DisasterEvent>();
        }

        var earliestDeclaration = timeProvider.GetUtcNow().AddDays(-options.Value.ActiveWindowDays);
        var filter = Uri.EscapeDataString(
            $"incidentEndDate eq null and declarationDate ge '{earliestDeclaration.UtcDateTime:yyyy-MM-ddTHH:mm:ss.fffZ}'");
        var requestUri = $"DisasterDeclarationsSummaries?$top={options.Value.MaxRecords}&$filter={filter}&$orderby=declarationDate desc";

        using var document = await httpClient.GetJsonDocumentAsync(requestUri, cancellationToken);
        var records = document.RootElement.GetPropertyOrNull("DisasterDeclarationsSummaries");
        if (records is null || records.Value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<DisasterEvent>();
        }

        var events = new List<DisasterEvent>();
        foreach (var record in records.Value.EnumerateArray())
        {
            var sourceEventId = record.GetStringOrNull("id") ?? record.GetStringOrNull("femaDeclarationString");
            if (string.IsNullOrWhiteSpace(sourceEventId))
            {
                continue;
            }

            var declarationDate = record.GetDateTimeOffsetOrNull("declarationDate");
            var incidentBeginDate = record.GetDateTimeOffsetOrNull("incidentBeginDate");
            var incidentEndDate = record.GetDateTimeOffsetOrNull("incidentEndDate");

            if (declarationDate is null && incidentBeginDate is null)
            {
                continue;
            }

            var stateCode = DisasterDataHelpers.NormalizeStateCode(record.GetStringOrNull("state"));
            var countyFips = DisasterDataHelpers.NormalizeCountyFips(record.GetStringOrNull("fipsCountyCode"));
            var declarationType = record.GetStringOrNull("declarationType");
            var title = record.GetStringOrNull("declarationTitle") ??
                        record.GetStringOrNull("incidentType") ??
                        "FEMA disaster declaration";
            var designatedArea = record.GetStringOrNull("designatedArea");
            var disasterNumber = record.GetInt32OrNull("disasterNumber");

            events.Add(new DisasterEvent
            {
                Id = DisasterDataHelpers.CreateStableId("fema", sourceEventId),
                Source = Source,
                SourceEventId = sourceEventId,
                Title = title,
                Category = MapCategory(record.GetStringOrNull("incidentType")),
                Severity = MapSeverity(declarationType),
                Status = incidentEndDate is null ? DisasterStatus.Active : DisasterStatus.Resolved,
                StartedAt = incidentBeginDate ?? declarationDate!.Value,
                EndedAt = incidentEndDate,
                ExpectedEndAt = incidentEndDate,
                EndTimeConfidence = incidentEndDate is null ? EndTimeConfidence.None : EndTimeConfidence.High,
                EndTimeExplanation = incidentEndDate is null
                    ? "FEMA has not published an incident end date for this open declaration."
                    : "Provided by the FEMA incident end date field.",
                Summary = BuildSummary(record.GetStringOrNull("incidentType"), designatedArea, stateCode),
                Description = record.GetStringOrNull("femaDeclarationString"),
                SourceUrl = disasterNumber is null ? null : $"https://www.fema.gov/disaster/{disasterNumber.Value}",
                AreaDescription = string.IsNullOrWhiteSpace(designatedArea)
                    ? stateCode
                    : $"{designatedArea}, {stateCode}",
                StateCodes = stateCode is null ? Array.Empty<string>() : new[] { stateCode },
                CountyFipsCodes = countyFips is null ? Array.Empty<string>() : new[] { countyFips }
            });
        }

        return events;
    }

    private static DisasterCategory MapCategory(string? incidentType)
    {
        var normalized = incidentType?.Trim().ToUpperInvariant() ?? string.Empty;
        if (normalized.Contains("FIRE", StringComparison.Ordinal))
        {
            return DisasterCategory.Fire;
        }

        if (normalized.Contains("FLOOD", StringComparison.Ordinal))
        {
            return DisasterCategory.Flood;
        }

        if (normalized.Contains("HURRICANE", StringComparison.Ordinal) ||
            normalized.Contains("TROPICAL", StringComparison.Ordinal))
        {
            return DisasterCategory.Hurricane;
        }

        if (normalized.Contains("STORM", StringComparison.Ordinal) ||
            normalized.Contains("TORNADO", StringComparison.Ordinal) ||
            normalized.Contains("WIND", StringComparison.Ordinal))
        {
            return DisasterCategory.Storm;
        }

        if (normalized.Contains("DROUGHT", StringComparison.Ordinal))
        {
            return DisasterCategory.Drought;
        }

        if (normalized.Contains("EARTHQUAKE", StringComparison.Ordinal))
        {
            return DisasterCategory.Earthquake;
        }

        return DisasterCategory.Other;
    }

    private static DisasterSeverity MapSeverity(string? declarationType)
    {
        return declarationType?.Trim().ToUpperInvariant() switch
        {
            "DR" => DisasterSeverity.Severe,
            "FM" => DisasterSeverity.Severe,
            "EM" => DisasterSeverity.Moderate,
            _ => DisasterSeverity.Moderate
        };
    }

    private static string BuildSummary(string? incidentType, string? designatedArea, string? stateCode)
    {
        var incident = string.IsNullOrWhiteSpace(incidentType) ? "Disaster declaration" : incidentType;
        return string.IsNullOrWhiteSpace(designatedArea)
            ? $"{incident} declaration in {stateCode}"
            : $"{incident} declaration for {designatedArea}, {stateCode}";
    }
}
