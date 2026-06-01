import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

export default [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "supabase/.temp/**"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      sourceType: "module"
    },
    rules: {
      "no-control-regex": "off",
      "no-useless-assignment": "warn",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  prettier
];
