import {
  disasterCategories,
  disasterMatchKinds,
  disasterSeverities,
  disasterSourceKinds,
  disasterStatuses,
  endTimeConfidences,
  impactConfidences,
  matchConfidences,
  sourceHealthStatuses,
  upstreamSourceKinds
} from "@ron/contract";

const isoDateTimeSchema = {
  type: "string",
  format: "date-time"
} as const;

const geoPointSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    latitude: { type: "number" },
    longitude: { type: "number" }
  },
  required: ["latitude", "longitude"]
} as const;

const geoPolygonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    coordinates: {
      type: "array",
      items: geoPointSchema
    }
  },
  required: ["coordinates"]
} as const;

const resourceImpactSignalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    profileId: { type: "string" },
    resource: { type: "string" },
    region: { type: "string" },
    summary: { type: "string" },
    explanation: { type: "string" },
    reason: { type: "string" },
    confidence: { type: "string", enum: [...impactConfidences] },
    matchedEventIds: {
      type: "array",
      items: { type: "string" }
    },
    stateCodes: {
      type: "array",
      items: { type: "string" }
    },
    countyFipsCodes: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "profileId",
    "resource",
    "region",
    "summary",
    "explanation",
    "reason",
    "confidence",
    "matchedEventIds",
    "stateCodes",
    "countyFipsCodes"
  ]
} as const;

const disasterEventSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    source: { type: "string", enum: [...disasterSourceKinds] },
    sourceEventId: { type: "string" },
    title: { type: "string" },
    category: { type: "string", enum: [...disasterCategories] },
    severity: { type: "string", enum: [...disasterSeverities] },
    status: { type: "string", enum: [...disasterStatuses] },
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema,
    expectedEndAt: isoDateTimeSchema,
    endTimeConfidence: { type: "string", enum: [...endTimeConfidences] },
    endTimeExplanation: { type: "string" },
    summary: { type: "string" },
    description: { type: "string" },
    instruction: { type: "string" },
    sourceUrl: { type: "string", format: "uri" },
    areaDescription: { type: "string" },
    stateCodes: {
      type: "array",
      items: { type: "string" }
    },
    countyFipsCodes: {
      type: "array",
      items: { type: "string" }
    },
    zoneIds: {
      type: "array",
      items: { type: "string" }
    },
    centroid: geoPointSchema,
    radiusKm: { type: "number" },
    footprintPolygons: {
      type: "array",
      items: geoPolygonSchema
    },
    magnitude: { type: "number" },
    magnitudeUnit: { type: "string" },
    impactedResources: {
      type: "array",
      items: resourceImpactSignalSchema
    }
  },
  required: [
    "id",
    "source",
    "sourceEventId",
    "title",
    "category",
    "severity",
    "status",
    "startedAt",
    "endTimeConfidence",
    "endTimeExplanation",
    "summary",
    "stateCodes",
    "countyFipsCodes",
    "zoneIds",
    "footprintPolygons",
    "impactedResources"
  ]
} as const;

const sourceHealthSnapshotSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    source: { type: "string", enum: [...upstreamSourceKinds] },
    status: { type: "string", enum: [...sourceHealthStatuses] },
    lastAttemptedRefreshUtc: isoDateTimeSchema,
    lastSuccessfulRefreshUtc: isoDateTimeSchema,
    eventCount: { type: "integer", minimum: 0 },
    errorMessage: { type: "string" }
  },
  required: ["source", "status", "eventCount"]
} as const;

const disasterSnapshotSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    generatedAt: isoDateTimeSchema,
    events: {
      type: "array",
      items: disasterEventSchema
    },
    sourceHealth: {
      type: "array",
      items: sourceHealthSnapshotSchema
    },
    resourceImpacts: {
      type: "array",
      items: resourceImpactSignalSchema
    }
  },
  required: ["generatedAt", "events", "sourceHealth", "resourceImpacts"]
} as const;

const zipCodeLocationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    zipCode: { type: "string" },
    city: { type: "string" },
    stateCode: { type: "string", pattern: "^[A-Z]{2}$" },
    countyZoneId: { type: "string" },
    forecastZoneId: { type: "string" },
    fireWeatherZoneId: { type: "string" },
    countyFipsCode: { type: "string" },
    sameCode: { type: "string" },
    zoneIds: {
      type: "array",
      items: { type: "string" }
    },
    centroid: geoPointSchema,
    boundaryPolygons: {
      type: "array",
      items: geoPolygonSchema
    }
  },
  required: ["zipCode", "city", "stateCode", "zoneIds", "centroid", "boundaryPolygons"]
} as const;

const zipCodeImpactMatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    disasterId: { type: "string" },
    title: { type: "string" },
    event: disasterEventSchema,
    matchKind: { type: "string", enum: [...disasterMatchKinds] },
    confidence: { type: "string", enum: [...matchConfidences] },
    reason: { type: "string" },
    distanceKm: { type: "number" }
  },
  required: ["disasterId", "title", "matchKind", "confidence", "reason"]
} as const;

const problemDetailsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", format: "uri-reference" },
    title: { type: "string" },
    status: { type: "integer", minimum: 100, maximum: 599 },
    detail: { type: "string" },
    instance: { type: "string", format: "uri-reference" },
    errors: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" }
      }
    }
  },
  required: ["title", "status"]
} as const;

const healthResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    generatedAt: isoDateTimeSchema,
    status: {
      type: "string",
      enum: ["ok"]
    },
    ready: { type: "boolean" }
  },
  required: ["generatedAt", "status", "ready"]
} as const;

const refreshTriggerResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    generatedAt: isoDateTimeSchema,
    eventCount: { type: "integer", minimum: 0 },
    sourceHealthCount: { type: "integer", minimum: 0 },
    resourceImpactCount: { type: "integer", minimum: 0 },
    triggeredBy: { type: "string" },
    authenticationMethod: {
      type: "string",
      enum: ["auth-token", "oidc"]
    }
  },
  required: [
    "generatedAt",
    "eventCount",
    "sourceHealthCount",
    "resourceImpactCount",
    "triggeredBy",
    "authenticationMethod"
  ]
} as const;

const disasterSearchResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    generatedAt: isoDateTimeSchema,
    count: { type: "integer", minimum: 0 },
    items: {
      type: "array",
      items: disasterEventSchema
    }
  },
  required: ["generatedAt", "count", "items"]
} as const;

const zipImpactResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    generatedAt: isoDateTimeSchema,
    location: zipCodeLocationSchema,
    isImpacted: { type: "boolean" },
    matches: {
      type: "array",
      items: zipCodeImpactMatchSchema
    }
  },
  required: ["generatedAt", "location", "isImpacted", "matches"]
} as const;

const resourceImpactResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    generatedAt: isoDateTimeSchema,
    count: { type: "integer", minimum: 0 },
    items: {
      type: "array",
      items: resourceImpactSignalSchema
    }
  },
  required: ["generatedAt", "count", "items"]
} as const;

const sourceHealthResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    generatedAt: isoDateTimeSchema,
    items: {
      type: "array",
      items: sourceHealthSnapshotSchema
    }
  },
  required: ["generatedAt", "items"]
} as const;

function jsonResponse(description: string, schema: object) {
  return {
    description,
    content: {
      "application/json": {
        schema
      }
    }
  };
}

function problemResponse(description: string) {
  return {
    description,
    content: {
      "application/problem+json": {
        schema: problemDetailsSchema
      }
    }
  };
}

const sourceQueryParameter = {
  name: "source",
  in: "query",
  schema: {
    type: "string",
    enum: [...disasterSourceKinds]
  }
} as const;

const stateQueryParameter = {
  name: "state",
  in: "query",
  schema: {
    type: "string",
    pattern: "^[A-Z]{2}$"
  }
} as const;

export function buildOpenApiDocument(baseUrl = "http://localhost:5096") {
  return {
    openapi: "3.1.0",
    info: {
      title: "Ron API",
      version: "1.0.0",
      description:
        "Normalized disaster intelligence API built as a Bun workspace. Routes expose Ron contract models only, never raw upstream payloads."
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "system", description: "API health, snapshot, and schema endpoints." },
      { name: "disasters", description: "Normalized disaster search and event detail routes." },
      { name: "zip-impact", description: "ZIP-code resolution and disaster impact matching." },
      { name: "resource-impacts", description: "Strategic resource impact signals." },
      { name: "sources", description: "Per-upstream source health and freshness." }
    ],
    paths: {
      "/": {
        get: {
          tags: ["system"],
          summary: "Get API index",
          operationId: "getApiIndex",
          responses: {
            200: jsonResponse("Top-level API index.", {
              type: "object",
              additionalProperties: false,
              properties: {
                generatedAt: isoDateTimeSchema,
                service: { type: "string" },
                version: { type: "string" },
                health: { type: "string" },
                openApi: { type: "string" },
                disasters: { type: "string" },
                zipImpact: { type: "string" }
              },
              required: ["generatedAt", "service", "version", "health", "openApi", "disasters", "zipImpact"]
            })
          }
        }
      },
      "/health": {
        get: {
          tags: ["system"],
          summary: "Get API health",
          operationId: "getHealth",
          responses: {
            200: jsonResponse("Current process liveness and Cloud Run-safe readiness.", healthResponseSchema)
          }
        }
      },
      "/internal/refresh": {
        post: {
          tags: ["system"],
          summary: "Trigger an authenticated snapshot refresh",
          operationId: "triggerRefresh",
          responses: {
            200: jsonResponse("Refresh completed and returned the latest snapshot counts.", refreshTriggerResponseSchema),
            401: problemResponse("Refresh trigger credentials were rejected."),
            503: problemResponse("Refresh trigger authentication is not configured.")
          }
        }
      },
      "/openapi.json": {
        get: {
          tags: ["system"],
          summary: "Get OpenAPI document",
          operationId: "getOpenApiDocument",
          responses: {
            200: jsonResponse("OpenAPI 3.1 document for this API.", {
              type: "object"
            })
          }
        }
      },
      "/sources/health": {
        get: {
          tags: ["sources"],
          summary: "Get upstream source health",
          operationId: "getSourceHealth",
          responses: {
            200: jsonResponse("Current source health snapshot.", sourceHealthResponseSchema)
          }
        }
      },
      "/disasters": {
        get: {
          tags: ["disasters"],
          summary: "Search normalized disasters",
          operationId: "searchDisasters",
          parameters: [
            sourceQueryParameter,
            {
              name: "category",
              in: "query",
              schema: {
                type: "string",
                enum: [...disasterCategories]
              }
            },
            {
              name: "severity",
              in: "query",
              schema: {
                type: "string",
                enum: [...disasterSeverities]
              }
            },
            stateQueryParameter,
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: [...disasterStatuses]
              }
            },
            {
              name: "limit",
              in: "query",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 250
              }
            }
          ],
          responses: {
            200: jsonResponse("Filtered disaster events.", disasterSearchResponseSchema),
            400: problemResponse("Invalid query parameters.")
          }
        }
      },
      "/disasters/{id}": {
        get: {
          tags: ["disasters"],
          summary: "Get a single disaster by ID",
          operationId: "getDisasterById",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            200: jsonResponse("Single normalized disaster event.", disasterEventSchema),
            404: problemResponse("No event exists with the requested ID.")
          }
        }
      },
      "/zip-codes/{zip}/impact": {
        get: {
          tags: ["zip-impact"],
          summary: "Resolve ZIP impact",
          operationId: "getZipImpact",
          parameters: [
            {
              name: "zip",
              in: "path",
              required: true,
              schema: {
                type: "string",
                minLength: 3
              }
            },
            sourceQueryParameter
          ],
          responses: {
            200: jsonResponse("ZIP resolution and matched disaster events.", zipImpactResponseSchema),
            400: problemResponse("Invalid ZIP lookup request."),
            404: problemResponse("ZIP code was not found.")
          }
        }
      },
      "/resource-impacts": {
        get: {
          tags: ["resource-impacts"],
          summary: "Get resource impact signals",
          operationId: "getResourceImpacts",
          parameters: [
            stateQueryParameter,
            {
              name: "resource",
              in: "query",
              schema: {
                type: "string",
                minLength: 1
              }
            },
            {
              name: "minimumConfidence",
              in: "query",
              schema: {
                type: "string",
                enum: [...impactConfidences]
              }
            }
          ],
          responses: {
            200: jsonResponse("Resource impact signals for the current snapshot.", resourceImpactResponseSchema),
            400: problemResponse("Invalid query parameters.")
          }
        }
      },
      "/snapshot": {
        get: {
          tags: ["system"],
          summary: "Get the full snapshot",
          operationId: "getSnapshot",
          responses: {
            200: jsonResponse("Complete disaster, source-health, and resource-impact snapshot.", disasterSnapshotSchema)
          }
        }
      }
    },
    components: {
      schemas: {
        GeoPoint: geoPointSchema,
        GeoPolygon: geoPolygonSchema,
        ResourceImpactSignal: resourceImpactSignalSchema,
        DisasterEvent: disasterEventSchema,
        SourceHealthSnapshot: sourceHealthSnapshotSchema,
        DisasterSnapshot: disasterSnapshotSchema,
        ZipCodeLocation: zipCodeLocationSchema,
        ZipCodeImpactMatch: zipCodeImpactMatchSchema,
        DisasterSearchResponse: disasterSearchResponseSchema,
        ZipImpactResponse: zipImpactResponseSchema,
        ResourceImpactResponse: resourceImpactResponseSchema,
        SourceHealthResponse: sourceHealthResponseSchema,
        HealthResponse: healthResponseSchema,
        RefreshTriggerResponse: refreshTriggerResponseSchema,
        ProblemDetails: problemDetailsSchema
      }
    }
  };
}
