import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRonConfig } from "../packages/contract/src/index.ts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDirectory, "..");
const sourceDirectory = resolve(repoRoot, "apps/demo-ui/src");
const outputDirectory = resolve(repoRoot, "apps/demo-ui/dist");
const publicApiBaseUrl = normalizeBaseUrl(process.env.RON_PUBLIC_API_BASE_URL ?? defaultRonConfig.demoUi.publicApiBaseUrl);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const fileName of ["index.html", "app.js", "styles.css"]) {
  await copyFile(resolve(sourceDirectory, fileName), resolve(outputDirectory, fileName));
}

await writeFile(
  resolve(outputDirectory, "app-config.js"),
  `window.__RON_DEMO_UI_CONFIG__ = Object.freeze({ apiBaseUrl: ${JSON.stringify(publicApiBaseUrl)} });\n`
);

console.log(`Built demo UI assets in ${outputDirectory}`);

function normalizeBaseUrl(baseUrl: string) {
  const value = baseUrl.trim() || defaultRonConfig.demoUi.publicApiBaseUrl;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
