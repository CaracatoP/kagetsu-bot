const js = require("@eslint/js");
module.exports = [
  { ignores: ["node_modules/**", "apps/web/**", "artifacts/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      sourceType: "commonjs",
      ecmaVersion: 2024,
      globals: Object.fromEntries(
        [
          "console",
          "process",
          "Buffer",
          "module",
          "require",
          "exports",
          "__dirname",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "setImmediate",
          "URL",
          "URLSearchParams",
          "fetch",
          "AbortSignal",
          "structuredClone",
        ].map((k) => [k, "readonly"]),
      ),
    },
    rules: {
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
];
