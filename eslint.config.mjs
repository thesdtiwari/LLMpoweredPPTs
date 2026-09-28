import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const serverOnly = {
  group: ['@/server/*', '@/ai/server/*'],
  message: 'Server-only module: never import it from client code (API keys must stay on the server).',
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'coverage/**', 'next-env.d.ts']),

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // Architecture boundaries.
  {
    files: ['src/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react', message: 'domain/ is pure TypeScript and must not depend on React.' }],
          patterns: [
            { group: ['@/store/*', '@/editor/*', '@/app/*'], message: 'domain/ must not depend on UI or store code.' },
            serverOnly,
          ],
        },
      ],
    },
  },
  {
    files: ['src/editor/**', 'src/store/**', 'src/ai/client/**', 'src/ai/shared/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [serverOnly] }] },
  },
]);
