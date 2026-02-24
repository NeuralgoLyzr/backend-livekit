## Docker storage testing (Redis + S3/MinIO + backend-livekit)

This runbook validates:
- Redis-backed session store adapter
- S3-backed recording storage adapter (using MinIO)
- Backend `/session/observability` recording upload path

### Prereqs

- Docker Desktop (or Docker Engine) with `docker compose`

### Start stack

From repo root:

```bash
docker compose -f backend-livekit/docker-compose.storage.yml up -d --build
```

Services started:
- `backend` on `http://localhost:4000`
- `redis` on `localhost:6380`
- `minio` S3 API on `http://localhost:9002` (console `http://localhost:9003`)
- `mongo` on `localhost:27018`

Bucket auto-created by `minio-init`: `livekit-recordings`

### 1) Verify adapter-level integration tests against real Redis + MinIO

```bash
REDIS_TEST_URL=redis://localhost:6380 \
S3_TEST_BUCKET=livekit-recordings \
S3_TEST_REGION=us-east-1 \
S3_TEST_ENDPOINT=http://localhost:9002 \
S3_TEST_FORCE_PATH_STYLE=true \
S3_TEST_ACCESS_KEY_ID=minioadmin \
S3_TEST_SECRET_ACCESS_KEY=minioadmin \
pnpm -C backend-livekit exec vitest run tests/storageBackends.integration.test.ts
```

### 2) Verify backend `/session/observability` stores audio into S3 (MinIO)

```bash
curl -i -X POST http://localhost:4000/session/observability \
  -F 'payload={"roomName":"room-storage-1","sessionId":"00000000-0000-4000-8000-000000000000","orgId":"96f0cee4-bb87-4477-8eff-577ef2780614","closeReason":null,"sessionReport":{"job_id":"job-1","room_id":"rid-1","room":"room-storage-1","events":[{"type":"unknown_event","created_at":1}],"timestamp":2}}' \
  -F "audio=@backend-livekit/data/recordings/sample.ogg;type=audio/ogg"
```

If you don't have a sample file, create one quickly:

```bash
mkdir -p backend-livekit/data/recordings
printf 'fake-ogg-data' > backend-livekit/data/recordings/sample.ogg
```

Then verify object exists in MinIO:

```bash
pnpm -C backend-livekit exec node -e "
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
(async () => {
  const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://localhost:9002',
    forcePathStyle: true,
    credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
  });
  await s3.send(new HeadObjectCommand({
    Bucket: 'livekit-recordings',
    Key: 'recordings/00000000-0000-4000-8000-000000000000.ogg',
  }));
  console.log('ok');
})();
"
```

### Stop / cleanup

Keep data:

```bash
docker compose -f backend-livekit/docker-compose.storage.yml down
```

Wipe data volumes:

```bash
docker compose -f backend-livekit/docker-compose.storage.yml down -v
```
