# syntax=docker/dockerfile:1

# --- Build stage -----------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

# Install dependencies first for better layer caching. Skip lifecycle scripts
# so `nuxt prepare` (postinstall) doesn't run before the source is present.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm build

# --- Runtime stage ---------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Only the built Nitro server output is needed at runtime.
COPY --from=build /app/.output ./.output

# Domains list (unstorage fs driver) lives here.
VOLUME ["/app/.data"]

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
