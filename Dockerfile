## Multi-stage build for ECS
## - Uses pnpm via corepack
## - Builds TypeScript -> dist/
## - Runs production dependencies only

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /app

# pnpm
RUN corepack enable

# Install deps (better layer caching)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Keep only production deps for runtime
RUN pnpm prune --prod

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV APP_ENV=production

# Run as non-root user provided by the base image
USER node

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Default app port (can be overridden by ECS env var PORT)
EXPOSE 4000

CMD ["node", "dist/index.js"]
