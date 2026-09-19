import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["pages-dist/", ".wrangler/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    // Both runtimes are in play: the reader runs in a browser, the API in a
    // Worker, and the test scripts in Node.
    languageOptions: {
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly", location: "readonly",
        localStorage: "readonly", screen: "readonly", innerWidth: "readonly", innerHeight: "readonly",
        devicePixelRatio: "readonly", console: "readonly", setTimeout: "readonly",
        prompt: "readonly", confirm: "readonly", process: "readonly", React: "readonly",
        fetch: "readonly", crypto: "readonly", Request: "readonly", Response: "readonly",
        Headers: "readonly", Blob: "readonly", URL: "readonly", URLSearchParams: "readonly",
        AbortController: "readonly", AbortSignal: "readonly", TextDecoder: "readonly",
        TextEncoder: "readonly", Intl: "readonly", Buffer: "readonly", globalThis: "readonly",
        getComputedStyle: "readonly",
      },
    },
    rules: {
      // Storage and clipboard calls fail on locked-down browsers by design, and
      // an empty catch is how this project says "carry on without it".
      "no-empty": ["error", {allowEmptyCatch: true}],
      // Stripping control characters from a name is the point of that pattern.
      "no-control-regex": "off",
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // Vendored verbatim from shadcn@4.17.0. Keep the registry source intact
      // while the stricter rules apply to this project's own code.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "no-undef": "off",
    },
  },
]);
