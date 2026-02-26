export type AppEnv = 'dev' | 'staging' | 'production';

function parseAppEnv(value: string | undefined): AppEnv {
    const normalized = value?.trim().toLowerCase() ?? '';
    if (normalized === 'dev' || normalized === 'staging' || normalized === 'production') {
        return normalized;
    }

    throw new Error('APP_ENV must be one of: dev, staging, production');
}

export function getAppEnv(): AppEnv {
    return parseAppEnv(process.env.APP_ENV);
}

export function isProductionEnv(): boolean {
    return getAppEnv() === 'production';
}

export function isDevEnv(): boolean {
    return getAppEnv() === 'dev';
}

export function isStagingEnv(): boolean {
    return getAppEnv() === 'staging';
}

// Legacy helpers (prefer `isDevEnv` / `isProductionEnv`).
export function isProduction(): boolean {
    return isProductionEnv();
}

export function isDevelopment(): boolean {
    return isDevEnv();
}
