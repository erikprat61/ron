import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  impactConfidenceRank,
  jsonContentType,
  resourceImpactQuerySchema,
  type ProblemDetails,
  disasterSearchQuerySchema,
  zipImpactQuerySchema
} from "@ron/contract";
import type { RonConfig } from "@ron/contract";
import type { DisasterCatalogService } from "@ron/service-disaster-catalog";
import type { SourceHealthService } from "@ron/service-source-health";
import type { ZipContextService } from "@ron/service-zip-context";
import { NotFoundError } from "@ron/http";
import { buildOpenApiDocument } from "./openapi/schema.ts";

export interface AppServices {
  config: RonConfig;
  disasterCatalogService: DisasterCatalogService;
  zipContextService: ZipContextService;
  sourceHealthService: SourceHealthService;
}

export function createApp(services: AppServices) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: services.config.demoUi.allowedOrigins
    })
  );

  app.get("/", (context) =>
    json(context, {
      generatedAt: new Date().toISOString(),
      service: "Ron API",
      version: "v1",
      health: "/health",
      openApi: "/openapi.json",
      disasters: "/disasters",
      zipImpact: "/zip-codes/:zip/impact"
    })
  );

  app.get("/health", async (context) => {
    return json(context, {
      generatedAt: new Date().toISOString(),
      status: "ok",
      ready: true
    });
  });

  app.get("/openapi.json", (context) => json(context, buildOpenApiDocument(new URL(context.req.url).origin)));

  app.get("/sources/health", async (context) => {
    const response = await services.sourceHealthService.getSourceHealth();
    return json(context, response);
  });

  app.get("/snapshot", async (context) => {
    const response = await services.disasterCatalogService.getSnapshot();
    return json(context, response);
  });

  app.get("/disasters", async (context) => {
    const parsed = disasterSearchQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return problem(context, validationProblem(parsed.error.flatten().fieldErrors));
    }

    const snapshot = await services.disasterCatalogService.getSnapshot();
    let items = snapshot.events.slice();

    if (parsed.data.source) {
      items = items.filter((event) => event.source === parsed.data.source);
    }
    if (parsed.data.category) {
      items = items.filter((event) => event.category === parsed.data.category);
    }
    if (parsed.data.severity) {
      items = items.filter((event) => event.severity === parsed.data.severity);
    }
    if (parsed.data.state) {
      items = items.filter((event) => event.stateCodes.includes(parsed.data.state!));
    }
    if (parsed.data.status) {
      items = items.filter((event) => event.status === parsed.data.status);
    } else {
      items = items.filter((event) => event.status !== "resolved");
    }
    if (parsed.data.limit) {
      items = items.slice(0, Math.min(parsed.data.limit, 250));
    }

    return json(context, {
      generatedAt: snapshot.generatedAt,
      count: items.length,
      items
    });
  });

  app.get("/disasters/:id", async (context) => {
    const snapshot = await services.disasterCatalogService.getSnapshot();
    const event = snapshot.events.find((item) => item.id.toLowerCase() === context.req.param("id").toLowerCase());
    if (!event) {
      return problem(
        context,
        {
          title: "Disaster not found",
          detail: `No disaster record with id '${context.req.param("id")}' exists in the current snapshot.`,
          status: 404
        },
        404
      );
    }

    return json(context, event);
  });

  app.get("/zip-codes/:zip/impact", async (context) => {
    const parsed = zipImpactQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return problem(context, validationProblem(parsed.error.flatten().fieldErrors));
    }

    try {
      const location = await services.zipContextService.resolve(context.req.param("zip"));
      const snapshot = await services.disasterCatalogService.getSnapshot();
      const matches = services.zipContextService.match(location, snapshot.events, parsed.data.source);

      return json(context, {
        generatedAt: snapshot.generatedAt,
        location,
        isImpacted: matches.length > 0,
        matches
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return problem(context, { title: "ZIP code not found", detail: error.message, status: 404 }, 404);
      }

      if (error instanceof Error) {
        return problem(context, { title: "Invalid ZIP code", detail: error.message, status: 400 }, 400);
      }

      return problem(context, { title: "Unexpected error", status: 500 }, 500);
    }
  });

  app.get("/resource-impacts", async (context) => {
    const parsed = resourceImpactQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return problem(context, validationProblem(parsed.error.flatten().fieldErrors));
    }

    const snapshot = await services.disasterCatalogService.getSnapshot();
    let items = snapshot.resourceImpacts.slice();

    if (parsed.data.state) {
      items = items.filter((signal) => signal.stateCodes.includes(parsed.data.state!));
    }
    if (parsed.data.resource) {
      items = items.filter((signal) =>
        signal.resource.toLowerCase().includes(parsed.data.resource!.toLowerCase()) ||
        signal.region.toLowerCase().includes(parsed.data.resource!.toLowerCase())
      );
    }
    if (parsed.data.minimumConfidence) {
      items = items.filter(
        (signal) => impactConfidenceRank[signal.confidence] >= impactConfidenceRank[parsed.data.minimumConfidence!]
      );
    }

    return json(context, {
      generatedAt: snapshot.generatedAt,
      count: items.length,
      items
    });
  });

  app.onError((error, context) => {
    return problem(
      context,
      {
        title: "Internal server error",
        detail: error.message,
        status: 500
      },
      500
    );
  });

  return app;
}

function json(context: Context, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": jsonContentType
    }
  });
}

function problem(context: Context, details: ProblemDetails, status = details.status) {
  return new Response(JSON.stringify(details), {
    status,
    headers: {
      "content-type": "application/problem+json; charset=utf-8"
    }
  });
}

function validationProblem(errors: Record<string, string[] | undefined>): ProblemDetails {
  return {
    title: "Validation error",
    status: 400,
    detail: "One or more request parameters were invalid.",
    errors: Object.fromEntries(
      Object.entries(errors).map(([key, value]) => [key, value?.filter(Boolean) ?? []])
    )
  };
}
