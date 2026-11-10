const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*', 'expo-env.d.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    // The server runs on Node, not in the app. It logs to the console and
    // imports with ".ts" extensions so Node can run the files directly.
    files: ['server/**/*.ts'],
    rules: {
      'no-console': 'off',
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
    },
  },
]);
