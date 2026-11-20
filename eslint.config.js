import js from '@eslint/js';
import globals from 'globals';

/** Lint rules for the server and its tests. The React app in web/ has its own config. */
export default [
  { ignores: ['web/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-shadow': 'error',
      'no-implicit-coercion': ['error', { allow: ['!!'] }],
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-return-assign': 'error',
      curly: ['error', 'multi-line'],
    },
  },
  {
    // Keep application code in small, single-purpose functions.
    files: ['server.js', 'src/**/*.js', 'shared/**/*.js'],
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-statements': ['error', 20],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
    },
  },
];
