import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import promise from 'eslint-plugin-promise';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const promiseRecommendedRules =
    promise.configs?.['flat/recommended']?.rules ?? promise.configs?.recommended?.rules ?? {};
const unicornRecommendedRules =
    unicorn.configs?.['flat/recommended']?.rules ?? unicorn.configs?.recommended?.rules ?? {};

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            '.stryker-tmp/**',
            'reports/**',
            '**/dist/**',
            '**/node_modules/**',
            '**/.stryker-tmp/**',
            '**/reports/**',
        ],
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.es2022,
                ...globals.node,
            },
        },
        rules: {
            // Allow common conventions like `_next` in Express error middleware.
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
    {
        files: ['src/**/*.ts', 'tests/**/*.ts', 'vitest.config.ts'],
        plugins: {
            promise,
            unicorn,
        },
        languageOptions: {
            parserOptions: {
                project: './tsconfig.eslint.json',
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            ...promiseRecommendedRules,
            ...unicornRecommendedRules,

            // Prefer explicit type-only imports; helps runtime (ESM) correctness.
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports',
                },
            ],
            '@typescript-eslint/no-import-type-side-effects': 'error',

            // Promise/async safety.
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],
            '@typescript-eslint/no-misused-promises': 'error',

            // Avoid hiding real runtime problems.
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/only-throw-error': 'error',
            '@typescript-eslint/switch-exhaustiveness-check': 'error',

            // Unicorn: keep high-signal bug-prevention rules ON (via recommended),
            // and opt out of the ones that are mostly taste/too noisy for this codebase.
            'unicorn/prevent-abbreviations': 'off',
            'unicorn/filename-case': 'off',
            'unicorn/no-null': 'off',
            'unicorn/prefer-global-this': 'off',
            'unicorn/no-negated-condition': 'off',
            'unicorn/catch-error-name': 'off',
            'unicorn/no-array-callback-reference': 'off',
            'unicorn/no-array-sort': 'off',
            'unicorn/no-array-for-each': 'off',
            'unicorn/prefer-spread': 'off',
            'unicorn/prefer-ternary': 'off',
            'unicorn/prefer-array-some': 'off',
            'unicorn/switch-case-braces': 'off',
            'unicorn/no-zero-fractions': 'off',
            'unicorn/no-process-exit': 'off',
            'unicorn/prefer-number-properties': 'off',
            'unicorn/prefer-node-protocol': 'off',
            'unicorn/numeric-separators-style': 'off',
            'unicorn/prefer-at': 'off',
            'unicorn/no-useless-undefined': 'off',
            'unicorn/no-await-expression-member': 'off',
            'unicorn/no-lonely-if': 'off',
            'unicorn/prefer-response-static-json': 'off',

            // Promise defaults are useful; keep only the noisiest ones disabled.
            'promise/no-nesting': 'off',
            'promise/always-return': 'off',
            'promise/no-callback-in-promise': 'off',
        },
    },
    eslintConfigPrettier
);
