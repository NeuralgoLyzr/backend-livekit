import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        exclude: [
            'tests/**/*Live.test.ts',
            'tests/**/*live.test.ts',
            'tests/telnyxOnboardingLive.test.ts',
            'tests/twilioOnboardingLive.test.ts',
        ],
        clearMocks: true,
        restoreMocks: true,
        mockReset: true,
    },
});
