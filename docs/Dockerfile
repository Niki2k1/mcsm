# syntax=docker/dockerfile:1

# --- Build stage -----------------------------------------------------------
# Debian-based (not alpine) so better-sqlite3 can use its prebuilt glibc
# bindings instead of compiling from source.
FROM node:22-slim AS build

WORKDIR /app
# corepack picks up the pnpm version pinned in package.json (packageManager),
# so the build never depends on whatever pnpm the host/builder ships.
RUN corepack enable

# Install dependencies first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Nuxt's build + prerender needs more heap than Node's conservative
# in-container default (which is derived from the cgroup memory limit).
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm generate

# --- Runtime stage ---------------------------------------------------------
# The generated site is fully static — nginx serves it as plain files.
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.output/public /usr/share/nginx/html

EXPOSE 80
