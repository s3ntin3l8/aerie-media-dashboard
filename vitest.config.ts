import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const rootAlias = { "@": path.resolve(__dirname, "./") };

export default defineConfig({
  plugins: [react()],
  resolve: { alias: rootAlias },
  test: {
    globals: true,
    coverage: {
      reporter: ["text", "lcov"],
      include: ["app/**", "components/**", "lib/**"],
      exclude: ["node_modules/", "tests/", "tests/setup.ts"],
    },
    projects: [
      {
        resolve: { alias: rootAlias },
        test: {
          name: "browser",
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
          globals: true,
          include: ["tests/components/**"],
        },
      },
      {
        resolve: { alias: rootAlias },
        test: {
          name: "server",
          environment: "node",
          setupFiles: ["./tests/unit/server.env.ts", "./tests/unit/server.setup.ts"],
          globals: true,
          include: ["tests/unit/**/*.test.ts"],
        },
      },
    ],
  },
});

