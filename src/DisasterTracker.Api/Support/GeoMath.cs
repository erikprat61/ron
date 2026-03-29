using DisasterTracker.Api.Domain;

namespace DisasterTracker.Api.Support;

public static class GeoMath
{
    private const double EarthRadiusKm = 6371.0;

    public static double HaversineDistanceKm(GeoPoint start, GeoPoint end)
    {
        var latitudeDelta = DegreesToRadians(end.Latitude - start.Latitude);
        var longitudeDelta = DegreesToRadians(end.Longitude - start.Longitude);
        var startLatitude = DegreesToRadians(start.Latitude);
        var endLatitude = DegreesToRadians(end.Latitude);

        var a =
            Math.Pow(Math.Sin(latitudeDelta / 2), 2) +
            Math.Cos(startLatitude) * Math.Cos(endLatitude) * Math.Pow(Math.Sin(longitudeDelta / 2), 2);

        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return EarthRadiusKm * c;
    }

    public static GeoPoint CalculateCentroid(IEnumerable<GeoPoint> points)
    {
        var pointArray = points.ToArray();
        return new GeoPoint(
            pointArray.Average(point => point.Latitude),
            pointArray.Average(point => point.Longitude));
    }

    public static bool Contains(GeoBoundingBox bounds, GeoPoint point)
    {
        return point.Latitude >= bounds.MinLatitude &&
               point.Latitude <= bounds.MaxLatitude &&
               point.Longitude >= bounds.MinLongitude &&
               point.Longitude <= bounds.MaxLongitude;
    }

    public static bool ContainsPoint(IReadOnlyList<GeoPolygon> polygons, GeoPoint point)
    {
        return polygons.Any(polygon => ContainsPoint(polygon, point));
    }

    public static bool ContainsPoint(GeoPolygon polygon, GeoPoint point)
    {
        var coordinates = polygon.Coordinates;
        if (coordinates.Count < 3)
        {
            return false;
        }

        var contains = false;
        for (var index = 0; index < coordinates.Count; index++)
        {
            var current = coordinates[index];
            var previous = coordinates[(index + coordinates.Count - 1) % coordinates.Count];

            var longitudeCrosses = (current.Longitude > point.Longitude) != (previous.Longitude > point.Longitude);
            if (!longitudeCrosses)
            {
                continue;
            }

            var boundaryLatitude =
                (previous.Latitude - current.Latitude) * (point.Longitude - current.Longitude) /
                (previous.Longitude - current.Longitude) +
                current.Latitude;

            if (point.Latitude < boundaryLatitude)
            {
                contains = !contains;
            }
        }

        return contains;
    }

    public static bool Intersects(IReadOnlyList<GeoPolygon> left, IReadOnlyList<GeoPolygon> right)
    {
        if (left.Count == 0 || right.Count == 0)
        {
            return false;
        }

        foreach (var leftPolygon in left)
        {
            foreach (var rightPolygon in right)
            {
                if (Intersects(leftPolygon, rightPolygon))
                {
                    return true;
                }
            }
        }

        return false;
    }

    public static bool CircleIntersectsPolygons(GeoPoint center, double radiusKm, IReadOnlyList<GeoPolygon> polygons)
    {
        if (polygons.Count == 0)
        {
            return false;
        }

        if (ContainsPoint(polygons, center))
        {
            return true;
        }

        foreach (var polygon in polygons)
        {
            var coordinates = polygon.Coordinates;
            if (coordinates.Count == 0)
            {
                continue;
            }

            if (coordinates.Any(point => HaversineDistanceKm(center, point) <= radiusKm))
            {
                return true;
            }

            foreach (var (start, end) in GetSegments(coordinates))
            {
                if (DistanceToSegmentKm(center, start, end) <= radiusKm)
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180.0;

    private static bool Intersects(GeoPolygon left, GeoPolygon right)
    {
        var leftCoordinates = left.Coordinates;
        var rightCoordinates = right.Coordinates;
        if (leftCoordinates.Count < 3 || rightCoordinates.Count < 3)
        {
            return false;
        }

        if (leftCoordinates.Any(point => ContainsPoint(right, point)) ||
            rightCoordinates.Any(point => ContainsPoint(left, point)))
        {
            return true;
        }

        foreach (var (leftStart, leftEnd) in GetSegments(leftCoordinates))
        {
            foreach (var (rightStart, rightEnd) in GetSegments(rightCoordinates))
            {
                if (SegmentsIntersect(leftStart, leftEnd, rightStart, rightEnd))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static IEnumerable<(GeoPoint Start, GeoPoint End)> GetSegments(IReadOnlyList<GeoPoint> coordinates)
    {
        if (coordinates.Count < 2)
        {
            yield break;
        }

        for (var index = 0; index < coordinates.Count; index++)
        {
            yield return (coordinates[index], coordinates[(index + 1) % coordinates.Count]);
        }
    }

    private static bool SegmentsIntersect(GeoPoint firstStart, GeoPoint firstEnd, GeoPoint secondStart, GeoPoint secondEnd)
    {
        var firstStartOrientation = Orientation(firstStart, firstEnd, secondStart);
        var firstEndOrientation = Orientation(firstStart, firstEnd, secondEnd);
        var secondStartOrientation = Orientation(secondStart, secondEnd, firstStart);
        var secondEndOrientation = Orientation(secondStart, secondEnd, firstEnd);

        if (firstStartOrientation == 0 && OnSegment(firstStart, secondStart, firstEnd))
        {
            return true;
        }

        if (firstEndOrientation == 0 && OnSegment(firstStart, secondEnd, firstEnd))
        {
            return true;
        }

        if (secondStartOrientation == 0 && OnSegment(secondStart, firstStart, secondEnd))
        {
            return true;
        }

        if (secondEndOrientation == 0 && OnSegment(secondStart, firstEnd, secondEnd))
        {
            return true;
        }

        return (firstStartOrientation > 0) != (firstEndOrientation > 0) &&
               (secondStartOrientation > 0) != (secondEndOrientation > 0);
    }

    private static int Orientation(GeoPoint start, GeoPoint middle, GeoPoint end)
    {
        var crossProduct =
            (middle.Longitude - start.Longitude) * (end.Latitude - middle.Latitude) -
            (middle.Latitude - start.Latitude) * (end.Longitude - middle.Longitude);

        if (Math.Abs(crossProduct) < 1e-12)
        {
            return 0;
        }

        return crossProduct > 0 ? 1 : -1;
    }

    private static bool OnSegment(GeoPoint start, GeoPoint point, GeoPoint end)
    {
        return point.Longitude <= Math.Max(start.Longitude, end.Longitude) &&
               point.Longitude >= Math.Min(start.Longitude, end.Longitude) &&
               point.Latitude <= Math.Max(start.Latitude, end.Latitude) &&
               point.Latitude >= Math.Min(start.Latitude, end.Latitude);
    }

    private static double DistanceToSegmentKm(GeoPoint point, GeoPoint start, GeoPoint end)
    {
        var startProjected = ProjectToKilometers(point, start);
        var endProjected = ProjectToKilometers(point, end);
        var segmentX = endProjected.X - startProjected.X;
        var segmentY = endProjected.Y - startProjected.Y;
        var segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
        if (segmentLengthSquared == 0)
        {
            return Math.Sqrt(startProjected.X * startProjected.X + startProjected.Y * startProjected.Y);
        }

        var t = Math.Clamp(
            -(startProjected.X * segmentX + startProjected.Y * segmentY) / segmentLengthSquared,
            0,
            1);

        var closestX = startProjected.X + (segmentX * t);
        var closestY = startProjected.Y + (segmentY * t);
        return Math.Sqrt(closestX * closestX + closestY * closestY);
    }

    private static (double X, double Y) ProjectToKilometers(GeoPoint origin, GeoPoint point)
    {
        var averageLatitude = DegreesToRadians((origin.Latitude + point.Latitude) / 2);
        var x = DegreesToRadians(point.Longitude - origin.Longitude) * EarthRadiusKm * Math.Cos(averageLatitude);
        var y = DegreesToRadians(point.Latitude - origin.Latitude) * EarthRadiusKm;
        return (x, y);
    }
}
