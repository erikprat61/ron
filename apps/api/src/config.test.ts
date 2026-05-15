import { afterEach, describe, expect, it } from "bun:test";
import { loadConfig } from "./config.ts";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
});

describe("loadConfig", () => {
  it("disables startup warming and background refresh outside development by default", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DISASTER_BACKGROUND_REFRESH_ENABLED;
    delete process.env.DISASTER_WARM_CACHE_ON_STARTUP;

    const config = loadConfig();

    expect(config.environmentName).toBe("production");
    expect(config.disasterRefresh.backgroundRefreshEnabled).toBe(false);
    expect(config.disasterRefresh.warmCacheOnStartup).toBe(false);
  });

  it("parses deployment-oriented environment overrides", () => {
    process.env.NODE_ENV = "production";
    process.env.RON_ENVIRONMENT = "staging";
    process.env.RON_PUBLIC_API_BASE_URL = "https://api.staging.example.com/";
    process.env.RON_DEMO_UI_ALLOWED_ORIGINS = "https://ui.staging.example.com, https://preview.example.com";
    process.env.RON_REFRESH_AUTH_TOKEN = "test-token";
    process.env.RON_REDIS_ENABLED = "true";
    process.env.RON_REDIS_URL = "redis://cache.internal:6379";
    process.env.RON_REDIS_KEY_PREFIX = "ron-staging";
    process.env.RON_DATABASE_ENABLED = "true";
    process.env.RON_DATABASE_URL = "postgres://user:pass@db.internal:5432/ron";
    process.env.DISASTER_BACKGROUND_REFRESH_ENABLED = "true";
    process.env.DISASTER_WARM_CACHE_ON_STARTUP = "true";
    process.env.DISASTER_BACKGROUND_REFRESH_INTERVAL_MS = "60000";

    const config = loadConfig();

    expect(config.environmentName).toBe("staging");
    expect(config.demoUi.publicApiBaseUrl).toBe("https://api.staging.example.com/");
    expect(config.demoUi.allowedOrigins).toEqual([
      "https://ui.staging.example.com",
      "https://preview.example.com"
    ]);
    expect(config.refreshTrigger.authToken).toBe("test-token");
    expect(config.redis).toEqual({
      enabled: true,
      url: "redis://cache.internal:6379",
      keyPrefix: "ron-staging"
    });
    expect(config.database).toEqual({
      enabled: true,
      url: "postgres://user:pass@db.internal:5432/ron"
    });
    expect(config.disasterRefresh.backgroundRefreshEnabled).toBe(true);
    expect(config.disasterRefresh.backgroundRefreshIntervalMs).toBe(60000);
    expect(config.disasterRefresh.warmCacheOnStartup).toBe(true);
  });
});
