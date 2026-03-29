using System.Globalization;
using DisasterTracker.Api.Domain;
using DisasterTracker.Api.Support;

namespace DisasterTracker.Api.Services;

public sealed class DisasterEventMatcher : IDisasterEventMatcher
{
    public IReadOnlyList<ZipCodeImpactMatch> Match(ZipCodeLocation location, IReadOnlyList<DisasterEvent> events)
    {
        var matches = new List<ZipCodeImpactMatch>();
        foreach (var disasterEvent in events)
        {
            var match = disasterEvent.Source switch
            {
                DisasterSourceKind.Nws => MatchNwsEvent(location, disasterEvent),
                DisasterSourceKind.Fema => MatchFemaEvent(location, disasterEvent),
                DisasterSourceKind.Usgs => MatchRadiusEvent(location, disasterEvent, "earthquake"),
                DisasterSourceKind.Eonet => MatchRadiusEvent(location, disasterEvent, "EONET event"),
                _ => null
            };

            if (match is not null)
            {
                matches.Add(match);
            }
        }

        return matches
            .OrderByDescending(match => match.Confidence)
            .ThenByDescending(match => match.Event.Severity)
            .ThenByDescending(match => match.Event.StartedAt)
            .ToArray();
    }

    private static ZipCodeImpactMatch? MatchNwsEvent(ZipCodeLocation location, DisasterEvent disasterEvent)
    {
        var boundaryMatch = MatchPublishedBoundary(
            location,
            disasterEvent,
            "The ZIP boundary intersects the National Weather Service alert geometry.");
        if (boundaryMatch is not null)
        {
            return boundaryMatch;
        }

        var matchingZones = disasterEvent.ZoneIds
            .Intersect(location.ZoneIds, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (matchingZones.Length > 0)
        {
            return new ZipCodeImpactMatch
            {
                Event = disasterEvent,
                MatchKind = DisasterMatchKind.Zone,
                Confidence = MatchConfidence.High,
                Reason = $"The ZIP code belongs to NWS zone(s) {string.Join(", ", matchingZones)}, which this alert explicitly covers.",
                DistanceKm = null
            };
        }

        if (!string.IsNullOrWhiteSpace(location.CountyFipsCode) &&
            disasterEvent.CountyFipsCodes.Contains(location.CountyFipsCode, StringComparer.OrdinalIgnoreCase))
        {
            return new ZipCodeImpactMatch
            {
                Event = disasterEvent,
                MatchKind = DisasterMatchKind.County,
                Confidence = MatchConfidence.Medium,
                Reason = "The alert includes the same county FIPS code resolved from the ZIP code.",
                DistanceKm = null
            };
        }

        return null;
    }

    private static ZipCodeImpactMatch? MatchFemaEvent(ZipCodeLocation location, DisasterEvent disasterEvent)
    {
        if (!disasterEvent.StateCodes.Contains(location.StateCode, StringComparer.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(location.CountyFipsCode))
        {
            return null;
        }

        if (!disasterEvent.CountyFipsCodes.Contains(location.CountyFipsCode, StringComparer.OrdinalIgnoreCase))
        {
            return null;
        }

        return new ZipCodeImpactMatch
        {
            Event = disasterEvent,
            MatchKind = DisasterMatchKind.County,
            Confidence = MatchConfidence.Medium,
            Reason = "The FEMA declaration applies to the county resolved from the ZIP code.",
            DistanceKm = null
        };
    }

    private static ZipCodeImpactMatch? MatchRadiusEvent(ZipCodeLocation location, DisasterEvent disasterEvent, string eventTypeLabel)
    {
        var boundaryMatch = MatchPublishedBoundary(
            location,
            disasterEvent,
            $"The ZIP boundary intersects the published {eventTypeLabel} footprint.");
        if (boundaryMatch is not null)
        {
            return boundaryMatch;
        }

        if (disasterEvent.Centroid is null || disasterEvent.RadiusKm is null)
        {
            return null;
        }

        var distance = GeoMath.HaversineDistanceKm(location.Coordinates, disasterEvent.Centroid.Value);
        var intersectsZipBoundary =
            location.BoundaryPolygons.Count > 0 &&
            GeoMath.CircleIntersectsPolygons(disasterEvent.Centroid.Value, disasterEvent.RadiusKm.Value, location.BoundaryPolygons);

        if (!intersectsZipBoundary && distance > disasterEvent.RadiusKm.Value)
        {
            return null;
        }

        var confidence = intersectsZipBoundary || distance <= disasterEvent.RadiusKm.Value / 3
            ? MatchConfidence.High
            : distance <= disasterEvent.RadiusKm.Value * 0.75
                ? MatchConfidence.Medium
                : MatchConfidence.Low;

        var reason = intersectsZipBoundary
            ? $"The {eventTypeLabel} footprint radius intersects the ZIP boundary, and the event centroid is {distance.ToString("0.0", CultureInfo.InvariantCulture)} km away."
            : $"The {eventTypeLabel} centroid is {distance.ToString("0.0", CultureInfo.InvariantCulture)} km away and inside the {disasterEvent.RadiusKm.Value.ToString("0.0", CultureInfo.InvariantCulture)} km footprint radius used for ZIP lookups.";

        return new ZipCodeImpactMatch
        {
            Event = disasterEvent,
            MatchKind = DisasterMatchKind.Radius,
            Confidence = confidence,
            Reason = reason,
            DistanceKm = Math.Round(distance, 1)
        };
    }

    private static ZipCodeImpactMatch? MatchPublishedBoundary(ZipCodeLocation location, DisasterEvent disasterEvent, string reason)
    {
        if (location.BoundaryPolygons.Count == 0 || disasterEvent.FootprintPolygons.Count == 0)
        {
            return null;
        }

        if (!GeoMath.Intersects(location.BoundaryPolygons, disasterEvent.FootprintPolygons))
        {
            return null;
        }

        return new ZipCodeImpactMatch
        {
            Event = disasterEvent,
            MatchKind = DisasterMatchKind.Boundary,
            Confidence = MatchConfidence.High,
            Reason = reason,
            DistanceKm = disasterEvent.Centroid is null
                ? null
                : Math.Round(GeoMath.HaversineDistanceKm(location.Coordinates, disasterEvent.Centroid.Value), 1)
        };
    }
}
