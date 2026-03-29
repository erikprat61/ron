using DisasterTracker.Api.Domain;

namespace DisasterTracker.Api.Support;

public static class UsRegionCatalog
{
    private static readonly Dictionary<string, string> StateNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Alabama"] = "AL",
        ["Alaska"] = "AK",
        ["American Samoa"] = "AS",
        ["Arizona"] = "AZ",
        ["Arkansas"] = "AR",
        ["California"] = "CA",
        ["Colorado"] = "CO",
        ["Connecticut"] = "CT",
        ["Delaware"] = "DE",
        ["District of Columbia"] = "DC",
        ["Florida"] = "FL",
        ["Georgia"] = "GA",
        ["Guam"] = "GU",
        ["Hawaii"] = "HI",
        ["Idaho"] = "ID",
        ["Illinois"] = "IL",
        ["Indiana"] = "IN",
        ["Iowa"] = "IA",
        ["Kansas"] = "KS",
        ["Kentucky"] = "KY",
        ["Louisiana"] = "LA",
        ["Maine"] = "ME",
        ["Maryland"] = "MD",
        ["Massachusetts"] = "MA",
        ["Michigan"] = "MI",
        ["Minnesota"] = "MN",
        ["Mississippi"] = "MS",
        ["Missouri"] = "MO",
        ["Montana"] = "MT",
        ["Nebraska"] = "NE",
        ["Nevada"] = "NV",
        ["New Hampshire"] = "NH",
        ["New Jersey"] = "NJ",
        ["New Mexico"] = "NM",
        ["New York"] = "NY",
        ["North Carolina"] = "NC",
        ["North Dakota"] = "ND",
        ["Northern Mariana Islands"] = "MP",
        ["Ohio"] = "OH",
        ["Oklahoma"] = "OK",
        ["Oregon"] = "OR",
        ["Pennsylvania"] = "PA",
        ["Puerto Rico"] = "PR",
        ["Rhode Island"] = "RI",
        ["South Carolina"] = "SC",
        ["South Dakota"] = "SD",
        ["Tennessee"] = "TN",
        ["Texas"] = "TX",
        ["Utah"] = "UT",
        ["Vermont"] = "VT",
        ["Virgin Islands"] = "VI",
        ["Virginia"] = "VA",
        ["Washington"] = "WA",
        ["West Virginia"] = "WV",
        ["Wisconsin"] = "WI",
        ["Wyoming"] = "WY"
    };

    private static readonly HashSet<string> StateCodes = new(StateNames.Values, StringComparer.OrdinalIgnoreCase);

    public static bool IsWithinUnitedStates(GeoPoint point)
    {
        return
            IsWithin(point, 24.396308, 49.384358, -124.848974, -66.885444) ||
            IsWithin(point, 51.214183, 71.365162, -179.148909, -129.9795) ||
            IsWithin(point, 18.86546, 22.2356, -160.2471, -154.806773) ||
            IsWithin(point, 17.8, 18.6, -67.3, -65.2) ||
            IsWithin(point, 17.5, 18.5, -65.2, -64.3) ||
            IsWithin(point, 13.1, 13.8, 144.4, 145.1) ||
            IsWithin(point, 14.0, 20.7, 144.7, 146.2) ||
            IsWithin(point, -14.5, -10.9, -171.1, -168.0);
    }

    public static string? TryResolveStateCode(string? place, GeoPoint? point = null)
    {
        if (!string.IsNullOrWhiteSpace(place))
        {
            var token = place.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
            if (TryNormalizeStateCode(token, out var stateCode))
            {
                return stateCode;
            }

            if (point is not null && IsWithinUnitedStates(point.Value))
            {
                foreach (var value in place.Split([',', ';', '-', '/', '(', ')'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
                {
                    if (TryNormalizeStateCode(value, out stateCode))
                    {
                        return stateCode;
                    }
                }

                foreach (var pair in StateNames.OrderByDescending(entry => entry.Key.Length))
                {
                    if (place.Contains(pair.Key, StringComparison.OrdinalIgnoreCase))
                    {
                        return pair.Value;
                    }
                }
            }
        }

        if (point is null)
        {
            return null;
        }

        if (IsWithin(point.Value, 13.1, 13.8, 144.4, 145.1))
        {
            return "GU";
        }

        if (IsWithin(point.Value, 17.8, 18.6, -67.3, -65.2))
        {
            return "PR";
        }

        if (IsWithin(point.Value, 17.5, 18.5, -65.2, -64.3))
        {
            return "VI";
        }

        if (IsWithin(point.Value, -14.5, -10.9, -171.1, -168.0))
        {
            return "AS";
        }

        if (IsWithin(point.Value, 18.86546, 22.2356, -160.2471, -154.806773))
        {
            return "HI";
        }

        if (IsWithin(point.Value, 51.214183, 71.365162, -179.148909, -129.9795))
        {
            return "AK";
        }

        return null;
    }

    private static bool TryNormalizeStateCode(string? rawValue, out string? stateCode)
    {
        stateCode = null;
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return false;
        }

        var trimmed = rawValue.Trim();
        if (trimmed.Length == 2)
        {
            var upper = trimmed.ToUpperInvariant();
            if (StateCodes.Contains(upper))
            {
                stateCode = upper;
                return true;
            }
        }

        if (StateNames.TryGetValue(trimmed, out var normalized))
        {
            stateCode = normalized;
            return true;
        }

        return false;
    }

    private static bool IsWithin(GeoPoint point, double minLatitude, double maxLatitude, double minLongitude, double maxLongitude)
    {
        return point.Latitude >= minLatitude &&
               point.Latitude <= maxLatitude &&
               point.Longitude >= minLongitude &&
               point.Longitude <= maxLongitude;
    }
}
