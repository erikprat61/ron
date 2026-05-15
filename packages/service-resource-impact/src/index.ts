import { readFileSync } from "node:fs";
import {
  type DisasterEvent,
  type DisasterSeverity,
  type ImpactConfidence,
  type ResourceImpactSignal,
  type StrategicResourceProfile,
  disasterSeverityRank
} from "@ron/contract";
import { containsBoundingBoxPoint } from "@ron/geo";

export class ResourceImpactService {
  private readonly profiles: StrategicResourceProfile[];

  constructor(profilePath: string) {
    this.profiles = JSON.parse(readFileSync(profilePath, "utf8")) as StrategicResourceProfile[];
  }

  analyze(events: DisasterEvent[]): ResourceImpactSignal[] {
    const signals: ResourceImpactSignal[] = [];

    for (const event of events) {
      if (event.status === "resolved") {
        continue;
      }

      for (const profile of this.profiles) {
        if (!matchesProfile(profile, event)) {
          continue;
        }

        const overlappingStates =
          profile.stateCodes.length === 0
            ? event.stateCodes
            : profile.stateCodes.filter((stateCode) =>
                event.stateCodes.some((eventStateCode) => eventStateCode.toUpperCase() === stateCode.toUpperCase())
              );

        signals.push({
          profileId: profile.id,
          resource: profile.resource,
          region: profile.region,
          summary: `${profile.summary} Triggered by '${event.title}'.`,
          explanation: `${profile.explanation} Current event: '${event.title}'.`,
          reason: `${profile.summary} Triggered by '${event.title}'.`,
          confidence: calculateConfidence(profile, event),
          matchedEventIds: [event.id],
          stateCodes: overlappingStates.length > 0 ? overlappingStates : profile.stateCodes,
          countyFipsCodes: profile.countyFipsCodes
        });
      }
    }

    return signals.sort((left, right) => {
      const impactRank = confidenceRank[right.confidence] - confidenceRank[left.confidence];
      if (impactRank !== 0) {
        return impactRank;
      }

      return left.resource.localeCompare(right.resource);
    });
  }
}

const confidenceRank: Record<ImpactConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

function matchesProfile(profile: StrategicResourceProfile, event: DisasterEvent): boolean {
  if (profile.categories.length > 0 && !profile.categories.includes(event.category)) {
    return false;
  }

  if (!meetsMinimumSeverity(event.severity, profile.minimumSeverity)) {
    return false;
  }

  if (profile.minimumMagnitude !== undefined && (event.magnitude === undefined || event.magnitude < profile.minimumMagnitude)) {
    return false;
  }

  if (
    profile.stateCodes.length > 0 &&
    !profile.stateCodes.some((stateCode) => event.stateCodes.some((eventStateCode) => eventStateCode.toUpperCase() === stateCode.toUpperCase()))
  ) {
    return false;
  }

  if (
    profile.countyFipsCodes.length > 0 &&
    !profile.countyFipsCodes.some((countyFipsCode) =>
      event.countyFipsCodes.some((eventCountyFipsCode) => eventCountyFipsCode.toUpperCase() === countyFipsCode.toUpperCase())
    )
  ) {
    return false;
  }

  if (
    profile.locationBounds.length > 0 &&
    (!event.centroid || !profile.locationBounds.some((bounds) => containsBoundingBoxPoint(bounds, event.centroid!)))
  ) {
    return false;
  }

  if (profile.locationKeywords.length > 0) {
    const locationText = [
      event.title,
      event.areaDescription,
      event.description,
      event.sourceUrl,
      event.stateCodes.join(" ")
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(" ");

    if (!profile.locationKeywords.some((keyword) => locationText.toUpperCase().includes(keyword.toUpperCase()))) {
      return false;
    }
  }

  return true;
}

function calculateConfidence(profile: StrategicResourceProfile, event: DisasterEvent): ImpactConfidence {
  if (
    profile.countyFipsCodes.length > 0 &&
    profile.countyFipsCodes.some((countyFipsCode) =>
      event.countyFipsCodes.some((eventCountyFipsCode) => eventCountyFipsCode.toUpperCase() === countyFipsCode.toUpperCase())
    )
  ) {
    return "high";
  }

  if (
    profile.locationBounds.length > 0 &&
    event.centroid &&
    profile.locationBounds.some((bounds) => containsBoundingBoxPoint(bounds, event.centroid!))
  ) {
    return meetsMinimumSeverity(event.severity, "severe") ? "high" : "medium";
  }

  if ((event.magnitude ?? 0) >= 6.0 || meetsMinimumSeverity(event.severity, "severe")) {
    return "high";
  }

  return meetsMinimumSeverity(event.severity, "moderate") ? "medium" : "low";
}

function meetsMinimumSeverity(actual: DisasterSeverity, minimum: DisasterSeverity): boolean {
  return disasterSeverityRank[actual] >= disasterSeverityRank[minimum];
}
