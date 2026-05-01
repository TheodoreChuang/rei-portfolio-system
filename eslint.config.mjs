import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // React hooks rules
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // set-state-in-effect is too strict — setLoading(true) at effect start is a valid pattern
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // Project rules — apply to all app and lib code
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  // scripts/, config files, and test files: allow process.env! and ! assertions
  // These run outside Next.js or are test setup — direct env access is acceptable.
  {
    files: ['scripts/**', '__tests__/**', 'playwright/**', 'drizzle.config.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },

  // These files cannot import lib/env.ts because it eagerly reads server-only env vars:
  // - middleware.ts: runs in edge runtime (no DATABASE_URL)
  // - lib/supabase/client.ts: runs in the browser (no server env vars at all)
  // NEXT_PUBLIC_ vars are inlined by Next.js at build time so ! assertions are safe.
  {
    files: ['middleware.ts', 'lib/supabase/client.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Workstream 5 cleanup targets: complex TypeScript narrowing limitations
  // These files use ! after runtime checks that TypeScript cannot statically narrow.
  // Remove this override once the narrowing is fixed in cleanup.
  {
    files: ['app/api/statements/route.ts', 'app/upload/page.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'playwright-report/**',
      'test-results/**',
      'supabase/.temp/**',
    ],
  },
)
