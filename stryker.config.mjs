/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
    $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
    plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
    testRunner: 'vitest',
    coverageAnalysis: 'perTest',
    buildCommand: 'pnpm build',
    checkers: ['typescript'],
    tsconfigFile: 'tsconfig.json',
    mutate: [
        'src/config/tools.ts',
        'src/services/agentService.ts',
        'src/services/sessionService.ts',
        'src/services/transcriptService.ts',
    ],
    reporters: ['clear-text', 'progress', 'html'],
    htmlReporter: {
        fileName: 'reports/mutation/mutation.html',
    },
    jsonReporter: {
        fileName: 'reports/mutation/mutation.json',
    },
    thresholds: {
        high: 80,
        low: 60,
        break: null,
    },
    ignorePatterns: ['reports', 'data'],
    vitest: {
        configFile: 'vitest.mutation.config.ts',
        related: false,
    },
};
