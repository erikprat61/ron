using System.Globalization;
using System.Text.Json;

namespace DisasterTracker.Api.Support;

public static class JsonElementExtensions
{
    public static JsonElement? GetPropertyOrNull(this JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property) ? property : null;
    }

    public static string? GetStringOrNull(this JsonElement element, string propertyName)
    {
        var property = element.GetPropertyOrNull(propertyName);
        if (property is null)
        {
            return null;
        }

        return property.Value.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.String => property.Value.GetString(),
            _ => property.Value.ToString()
        };
    }

    public static IReadOnlyList<string> GetStringArray(this JsonElement element, string propertyName)
    {
        var property = element.GetPropertyOrNull(propertyName);
        if (property is null || property.Value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        var values = new List<string>();
        foreach (var item in property.Value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var value = item.GetString();
            if (!string.IsNullOrWhiteSpace(value))
            {
                values.Add(value);
            }
        }

        return values;
    }

    public static int? GetInt32OrNull(this JsonElement element, string propertyName)
    {
        var property = element.GetPropertyOrNull(propertyName);
        if (property is null)
        {
            return null;
        }

        return property.Value.ValueKind switch
        {
            JsonValueKind.Number when property.Value.TryGetInt32(out var number) => number,
            JsonValueKind.String when int.TryParse(property.Value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) => number,
            _ => null
        };
    }

    public static long? GetInt64OrNull(this JsonElement element, string propertyName)
    {
        var property = element.GetPropertyOrNull(propertyName);
        if (property is null)
        {
            return null;
        }

        return property.Value.ValueKind switch
        {
            JsonValueKind.Number when property.Value.TryGetInt64(out var number) => number,
            JsonValueKind.String when long.TryParse(property.Value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) => number,
            _ => null
        };
    }

    public static double? GetDoubleOrNull(this JsonElement element, string propertyName)
    {
        var property = element.GetPropertyOrNull(propertyName);
        if (property is null)
        {
            return null;
        }

        return property.Value.ValueKind switch
        {
            JsonValueKind.Number when property.Value.TryGetDouble(out var number) => number,
            JsonValueKind.String when double.TryParse(property.Value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var number) => number,
            _ => null
        };
    }

    public static DateTimeOffset? GetDateTimeOffsetOrNull(this JsonElement element, string propertyName)
    {
        var property = element.GetPropertyOrNull(propertyName);
        if (property is null)
        {
            return null;
        }

        return property.Value.ValueKind switch
        {
            JsonValueKind.String when DateTimeOffset.TryParse(property.Value.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value) => value,
            _ => null
        };
    }

    public static DateTimeOffset? GetUnixMillisecondsAsDateTimeOffsetOrNull(this JsonElement element, string propertyName)
    {
        var value = element.GetInt64OrNull(propertyName);
        return value is null ? null : DateTimeOffset.FromUnixTimeMilliseconds(value.Value);
    }
}
