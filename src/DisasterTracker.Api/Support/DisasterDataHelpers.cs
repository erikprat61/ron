using System.Security.Cryptography;
using System.Text;

namespace DisasterTracker.Api.Support;

public static class DisasterDataHelpers
{
    public static string CreateStableId(string source, string sourceEventId)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{source}:{sourceEventId}"));
        return Convert.ToHexString(bytes[..12]).ToLowerInvariant();
    }

    public static IReadOnlyList<string> NormalizeIdentifiers(IEnumerable<string?> values)
    {
        return values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public static string? ExtractTrailingSegment(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return null;
        }

        var trimmed = rawValue.Trim().TrimEnd('/');
        var separatorIndex = trimmed.LastIndexOf('/');
        var segment = separatorIndex >= 0 ? trimmed[(separatorIndex + 1)..] : trimmed;
        return segment.Trim().ToUpperInvariant();
    }

    public static string? ExtractStateCodeFromZoneId(string? zoneId)
    {
        if (string.IsNullOrWhiteSpace(zoneId) || zoneId.Length < 2)
        {
            return null;
        }

        var prefix = zoneId[..2].ToUpperInvariant();
        return prefix.All(char.IsLetter) ? prefix : null;
    }

    public static string? ExtractCountyFipsFromZoneId(string? zoneId)
    {
        if (string.IsNullOrWhiteSpace(zoneId))
        {
            return null;
        }

        var normalized = zoneId.Trim().ToUpperInvariant();
        if (normalized.Length < 6 || normalized[2] != 'C')
        {
            return null;
        }

        return normalized[^3..];
    }

    public static string? NormalizeStateCode(string? stateCode)
    {
        return string.IsNullOrWhiteSpace(stateCode)
            ? null
            : stateCode.Trim().ToUpperInvariant();
    }

    public static string? NormalizeCountyFips(string? countyFips)
    {
        if (string.IsNullOrWhiteSpace(countyFips))
        {
            return null;
        }

        var digits = new string(countyFips.Where(char.IsDigit).ToArray());
        if (digits.Length == 0)
        {
            return null;
        }

        return digits.Length > 3 ? digits[^3..] : digits.PadLeft(3, '0');
    }
}
