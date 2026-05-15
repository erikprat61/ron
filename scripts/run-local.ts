export {};

const apiProc = Bun.spawn(["bun", "run", "apps/api/src/server.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env
  }
});

const uiProc = Bun.spawn(["bun", "run", "apps/demo-ui/src/server.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env
  }
});

const shutdown = () => {
  apiProc.kill();
  uiProc.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.all([apiProc.exited, uiProc.exited]);
