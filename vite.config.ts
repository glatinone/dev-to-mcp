import { defineConfig } from "vite";
import { resolve } from "path";

const externals = [
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/sdk/server/mcp.js",
  "@modelcontextprotocol/sdk/server/streamableHttp.js",
  "@modelcontextprotocol/sdk/server/stdio.js",
  "@modelcontextprotocol/sdk/types.js",
  "express",
  "zod",
  "pino",
  "pino-pretty",
  "node:crypto",
  "node:http",
  "node:path",
  "node:fs",
  "node:url",
  "node:buffer",
  "node:stream",
  "node:events",
  "node:util",
  "crypto",
  "http",
  "path",
  "fs",
  "url",
  "buffer",
  "stream",
  "events",
  "util",
];

export default defineConfig(() => ({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/index.ts"),
        stdio: resolve(__dirname, "src/stdio.ts"),
      },
      external: externals,
      output: {
        format: "es",
        entryFileNames: "[name].js",
      },
    },
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    ssr: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  ssr: {
    external: ["@modelcontextprotocol/sdk", "express", "zod", "pino"],
  },
}));
