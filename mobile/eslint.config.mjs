import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['node_modules/**', 'dist/**', 'web-build/**', 'android/**', 'ios/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] },
  },
  {
    files: ['**/*.{mjs,cjs}'],
    languageOptions: { globals: { process: 'readonly', module: 'readonly' } },
  },
);
