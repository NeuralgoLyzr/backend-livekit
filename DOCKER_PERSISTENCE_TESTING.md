## Docker persistence testing (MongoDB + backend-livekit)

This runbook validates agent persistence (`/agents`) using Docker Compose.

### Prereqs

- Docker Desktop (or Docker Engine) with `docker compose`

### Start (build + run)

From repo root:

```bash
docker compose -f backend-livekit/docker-compose.persistence.yml up -d --build
```

Note: This stack maps MongoDB to host port `27018` (to avoid clashing with any local MongoDB on `27017`).

### Required environment variables (for this Compose stack)

The backend currently validates these at process startup:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

For persistence-only testing you can leave them as the dummy values already set in
`docker-compose.persistence.yml`, as long as you don’t call `POST /session`.

Persistence itself requires:

- `MONGODB_URI` (already set to `mongodb://mongo:27017/livekit_dev` in the Compose file)

### Smoke checks (curl)

```bash
curl -sS http://localhost:4000/health
curl -sS http://localhost:4000/ | head -c 500 && echo
```

Create an agent:

```bash
curl -sS -X POST http://localhost:4000/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Agent","description":"x","config":{"tools":["get_weather"]}}'
```

List agents:

```bash
curl -sS http://localhost:4000/agents
```

Update/get/delete require the `agentId` returned by the create response:

```bash
AGENT_ID='<paste-id-here>'

curl -sS http://localhost:4000/agents/$AGENT_ID

curl -sS -X PUT http://localhost:4000/agents/$AGENT_ID \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Agent Updated","config":{"tools":["search_wikipedia"]}}'

curl -sS -X DELETE http://localhost:4000/agents/$AGENT_ID -i
curl -sS http://localhost:4000/agents
```

### Persistence across restarts

Restart only the backend:

```bash
docker compose -f backend-livekit/docker-compose.persistence.yml restart backend
curl -sS http://localhost:4000/agents
```

Restart mongo (data should persist because of the named volume):

```bash
docker compose -f backend-livekit/docker-compose.persistence.yml restart mongo
curl -sS http://localhost:4000/agents
```

### Stop / cleanup

Keep data (preserve named volume):

```bash
docker compose -f backend-livekit/docker-compose.persistence.yml down
```

Wipe data too (remove named volume):

```bash
docker compose -f backend-livekit/docker-compose.persistence.yml down -v
```

