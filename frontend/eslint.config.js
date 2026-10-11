// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    // Teach the import plugin the "@/..." alias from tsconfig.json.
    settings: { 'import/resolver': { typescript: { project: './tsconfig.json' } } },
  },
]);
