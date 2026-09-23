import { createRequire } from "node:module";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const devCerts = require("office-addin-dev-certs") as { getHttpsServerOptions(): Promise<{ key: Buffer; cert: Buffer; ca: Buffer }> };

export default defineConfig(async ({ command, mode }) => {
  const https = command === "serve" && mode !== "test" ? await devCerts.getHttpsServerOptions() : undefined;
  return {
    server: {
      port: 3001,
      strictPort: true,
      https,
      proxy: {
        "/fraudlens-api": {
          target: "http://localhost:4000",
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/fraudlens-api/, "/api"),
        },
      },
    },
    preview: { port: 3001, strictPort: true, https },
    build: {
      target: "es2020",
      sourcemap: false,
      rollupOptions: { input: { taskpane: "index.html", commands: "commands.html" } },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
      restoreMocks: true,
    },
  };
});
