// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const neverSendMessage = "Ahead never sends Gmail messages or drafts. Create a draft instead (ADR 0002).";
// `field` names `x` or `x.y` whose identifier or string-literal key matches `pattern`.
const named = (field, pattern) => `:matches([${field}.name=${pattern}], [${field}.value=${pattern}])`;
const MAILBOX = "/^(messages|drafts)$/";
const SEND = "'send'";
const neverSendSelectors = [
  // x.messages.send, x["drafts"]["send"]
  `MemberExpression${named("property", SEND)}${named("object.property", MAILBOX)}`,
  // const { messages } = x.users; messages.send()
  `MemberExpression${named("property", SEND)}${named("object", MAILBOX)}`,
  // x.drafts[`send`]
  `MemberExpression[property.type='TemplateLiteral'][property.quasis.0.value.cooked='send']`,
  // const { send } = x.messages
  `VariableDeclarator${named("init.property", MAILBOX)} > ObjectPattern > Property${named("key", SEND)}`,
  // const { messages: { send } } = x.users
  `Property${named("key", MAILBOX)} > ObjectPattern > Property${named("key", SEND)}`,
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/drizzle/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      // Ahead must never send email. Gmail drafts are created; the user sends them.
      // See docs/adr/0002-never-send-email.md.
      "no-restricted-syntax": [
        "error",
        ...neverSendSelectors.map((selector) => ({ selector, message: neverSendMessage })),
      ],
    },
  },
);
