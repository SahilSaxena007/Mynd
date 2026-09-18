import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    ignores: ["lib/model/anthropic.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/*"],
          message: "Only lib/model/anthropic.ts may import the provider SDK." }],
      }],
    },
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    ignores: ["lib/model/index.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "ImportDeclaration[source.value=/^(.*\\/)?anthropic(\\.ts)?$/]",
        message: "Use lib/model/complete(); only lib/model/index.ts may import the internal adapter.",
      }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
