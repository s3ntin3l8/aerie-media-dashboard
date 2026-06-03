import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Idiomatic effects (mount-time localStorage restore, reset-state-on-prop-
    // change, interval tick) trip this strict React-Compiler heuristic; they are
    // intentional here, so surface as warnings rather than build-blocking errors.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reference design bundle (prototype source kept for provenance only).
    "design/**",
    "drizzle/**",
    "data/**",
    // Local agent state — may contain git worktrees with full repo copies and
    // built .next output, which would otherwise be linted as false errors.
    ".claude/**",
  ]),
]);

export default eslintConfig;
