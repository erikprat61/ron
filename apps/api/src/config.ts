import { z } from "zod";
import { defaultRonConfig, type RonConfig } from "@ron/contract";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().optional(),
  UI_PORT: z.coerce.number().int().positive().optional(),
  NWS_USER_AGENT: z.string().optional(),
  SUPPLY_IMPACT_PROFILE_PATH: z.string().optional()
});

export function loadConfig(): RonConfig {
  const env = envSchema.parse(process.env);

  return {
    ...defaultRonConfig,
    nodeEnv: env.NODE_ENV ?? defaultRonConfig.nodeEnv,
    port: env.PORT ?? defaultRonConfig.port,
    uiPort: env.UI_PORT ?? defaultRonConfig.uiPort,
    nationalWeatherService: {
      ...defaultRonConfig.nationalWeatherService,
      userAgent: env.NWS_USER_AGENT ?? defaultRonConfig.nationalWeatherService.userAgent
    },
    supplyImpact: {
      ...defaultRonConfig.supplyImpact,
      resourceProfilePath: env.SUPPLY_IMPACT_PROFILE_PATH ?? defaultRonConfig.supplyImpact.resourceProfilePath
    }
  };
}
