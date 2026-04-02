const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "node_modules",
      "node_modules.dockerroot.bak",
      "**/node_modules.dockerroot.bak/**",
      "prisma/migrations/**"
    ]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-console": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  }
];
