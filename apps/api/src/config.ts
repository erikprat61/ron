import { z } from "zod";
import { defaultRonConfig, type RonConfig } from "@ron/contract";

const optionalBooleanSchema = z.preprocess((value) => {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const optionalCsvSchema = z.string().trim().min(1).transform((value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
).optional();

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  RON_ENVIRONMENT: z.string().trim().min(1).optional(),
  PORT: z.coerce.number().int().positive().optional(),
  UI_PORT: z.coerce.number().int().positive().optional(),
  NWS_USER_AGENT: z.string().optional(),
  SUPPLY_IMPACT_PROFILE_PATH: z.string().optional(),
  RON_PUBLIC_API_BASE_URL: z.string().url().optional(),
  RON_DEMO_UI_ALLOWED_ORIGINS: optionalCsvSchema,
  RON_REFRESH_AUTH_TOKEN: z.string().trim().min(1).optional(),
  RON_REFRESH_ALLOWED_INVOKER_EMAILS: optionalCsvSchema,
  RON_REDIS_ENABLED: optionalBooleanSchema,
  RON_REDIS_URL: z.string().trim().min(1).optional(),
  RON_REDIS_KEY_PREFIX: z.string().trim().min(1).optional(),
  RON_DATABASE_ENABLED: optionalBooleanSchema,
  RON_DATABASE_URL: z.string().trim().min(1).optional(),
  DISASTER_BACKGROUND_REFRESH_ENABLED: optionalBooleanSchema,
  DISASTER_BACKGROUND_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  DISASTER_WARM_CACHE_ON_STARTUP: optionalBooleanSchema
});

export function loadConfig(): RonConfig {
  const env = envSchema.parse(process.env);
  const nodeEnv = env.NODE_ENV ?? defaultRonConfig.nodeEnv;
  const environmentName = env.RON_ENVIRONMENT ?? nodeEnv;
  const backgroundRefreshEnabled = env.DISASTER_BACKGROUND_REFRESH_ENABLED ?? nodeEnv === "development";
  const warmCacheOnStartup = env.DISASTER_WARM_CACHE_ON_STARTUP ?? nodeEnv === "development";

  return {
    ...defaultRonConfig,
    environmentName,
    nodeEnv,
    port: env.PORT ?? defaultRonConfig.port,
    uiPort: env.UI_PORT ?? defaultRonConfig.uiPort,
    disasterRefresh: {
      ...defaultRonConfig.disasterRefresh,
      backgroundRefreshEnabled,
      backgroundRefreshIntervalMs:
        env.DISASTER_BACKGROUND_REFRESH_INTERVAL_MS ?? defaultRonConfig.disasterRefresh.backgroundRefreshIntervalMs,
      warmCacheOnStartup
    },
    nationalWeatherService: {
      ...defaultRonConfig.nationalWeatherService,
      userAgent: env.NWS_USER_AGENT ?? defaultRonConfig.nationalWeatherService.userAgent
    },
    demoUi: {
      ...defaultRonConfig.demoUi,
      allowedOrigins: env.RON_DEMO_UI_ALLOWED_ORIGINS ?? defaultRonConfig.demoUi.allowedOrigins,
      publicApiBaseUrl: env.RON_PUBLIC_API_BASE_URL ?? defaultRonConfig.demoUi.publicApiBaseUrl
    },
    refreshTrigger: {
      ...defaultRonConfig.refreshTrigger,
      authToken: env.RON_REFRESH_AUTH_TOKEN ?? defaultRonConfig.refreshTrigger.authToken,
      allowedInvokerEmails:
        env.RON_REFRESH_ALLOWED_INVOKER_EMAILS ?? defaultRonConfig.refreshTrigger.allowedInvokerEmails
    },
    redis: {
      ...defaultRonConfig.redis,
      enabled: env.RON_REDIS_ENABLED ?? defaultRonConfig.redis.enabled,
      url: env.RON_REDIS_URL ?? defaultRonConfig.redis.url,
      keyPrefix: env.RON_REDIS_KEY_PREFIX ?? defaultRonConfig.redis.keyPrefix
    },
    database: {
      ...defaultRonConfig.database,
      enabled: env.RON_DATABASE_ENABLED ?? defaultRonConfig.database.enabled,
      url: env.RON_DATABASE_URL ?? defaultRonConfig.database.url
    },
    supplyImpact: {
      ...defaultRonConfig.supplyImpact,
      resourceProfilePath: env.SUPPLY_IMPACT_PROFILE_PATH ?? defaultRonConfig.supplyImpact.resourceProfilePath
    }
  };
}
