export function buildOpenApiDocument(baseUrl = "http://localhost:5096") {
  return {
    openapi: "3.1.0",
    info: {
      title: "Ron API",
      version: "1.0.0",
      description: "Bun + Hono disaster aggregation API."
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/health": {
        get: {
          summary: "Get API health"
        }
      },
      "/sources/health": {
        get: {
          summary: "Get upstream source health"
        }
      },
      "/disasters": {
        get: {
          summary: "Search normalized disasters"
        }
      },
      "/disasters/{id}": {
        get: {
          summary: "Get a single disaster by ID"
        }
      },
      "/zip-codes/{zip}/impact": {
        get: {
          summary: "Resolve ZIP impact"
        }
      },
      "/resource-impacts": {
        get: {
          summary: "Get resource impact signals"
        }
      },
      "/snapshot": {
        get: {
          summary: "Get the full snapshot"
        }
      }
    }
  };
}
