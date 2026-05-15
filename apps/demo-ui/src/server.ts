import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.UI_PORT ?? "4173");

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const pathName = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = join(currentDirectory, pathName);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream"
      }
    });
  }
});

console.log(`Ron demo UI listening on http://localhost:${port}`);
