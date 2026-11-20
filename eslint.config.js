// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**", "**/drizzle/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": [
        "error",
        {
          // Ahead must never send email. Gmail drafts are created; the user sends them.
          // See docs/adr/0002-never-send-email.md.
          selector: "MemberExpression[property.name='send'][object.property.name=/^(messages|drafts)$/]",
          message: "Ahead never sends Gmail messages or drafts. Create a draft instead (ADR 0002).",
        },
      ],
    },
  },
);
