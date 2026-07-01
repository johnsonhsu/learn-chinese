import tsParser from '@typescript-eslint/parser';
import tseslint from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.husky/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended?.rules,
      'react-hooks/rules-of-hooks': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];