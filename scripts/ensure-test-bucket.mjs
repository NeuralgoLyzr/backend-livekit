import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

function env(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

function maybeBoolean(value) {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return undefined;
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function buildS3Client() {
    const region = env('S3_TEST_REGION');
    const endpoint = process.env.S3_TEST_ENDPOINT?.trim() || undefined;
    const forcePathStyle = maybeBoolean(process.env.S3_TEST_FORCE_PATH_STYLE);
    const accessKeyId = process.env.S3_TEST_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_TEST_SECRET_ACCESS_KEY?.trim();

    return new S3Client({
        region,
        endpoint,
        forcePathStyle,
        ...(accessKeyId && secretAccessKey
            ? { credentials: { accessKeyId, secretAccessKey } }
            : {}),
    });
}

async function main() {
    const bucket = env('S3_TEST_BUCKET');
    const client = buildS3Client();

    try {
        for (let attempt = 1; attempt <= 45; attempt++) {
            try {
                await client.send(new HeadBucketCommand({ Bucket: bucket }));
                console.log(`Bucket is ready: ${bucket}`);
                return;
            } catch (error) {
                const errorName = error?.name;
                const statusCode = error?.$metadata?.httpStatusCode;
                const bucketMissing =
                    errorName === 'NotFound' || errorName === 'NoSuchBucket' || statusCode === 404;

                if (bucketMissing) {
                    try {
                        await client.send(new CreateBucketCommand({ Bucket: bucket }));
                    } catch (createError) {
                        const createErrorName = createError?.name;
                        if (
                            createErrorName !== 'BucketAlreadyOwnedByYou' &&
                            createErrorName !== 'BucketAlreadyExists'
                        ) {
                            throw createError;
                        }
                    }
                    console.log(`Bucket created/confirmed: ${bucket}`);
                    return;
                }

                if (attempt === 45) {
                    throw error;
                }

                await sleep(1000);
            }
        }
    } finally {
        client.destroy();
    }
}

await main();
