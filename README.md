# MCSM — Minecraft Server Manager

A self-hostable web app for spinning up and managing Minecraft servers. MCSM
gives you a guided wizard to configure a server — type, version, memory,
world settings, MOTD, operators and whitelist — and then provisions it for you
as a Docker container running the
[`itzg/minecraft-server`](https://github.com/itzg/docker-minecraft-server)
image. Routing is handled by [Infrarust](https://github.com/Shadowner/Infrarust),
which discovers each server from its Docker labels — so there are no proxy
config files to manage.

> **Status:** early / work in progress. APIs and structure may change.

## Features

- **Guided creation wizard** — a 4-step flow (Type → Details → Properties →
  Review) for configuring a new server.
- **Multiple server types** — Vanilla, Paper, Fabric, Forge, Feed The Beast
  and CurseForge modpacks (Modrinth is stubbed for later).
- **Version picker** — Minecraft versions are pulled from
  [`minecraft-data`](https://github.com/PrismarineJS/minecraft-data).
- **Live MOTD preview** — write your MOTD with `§` color/format codes and see
  it rendered in the Minecraft font, including obfuscated-text animation.
- **Operators & whitelist** — look players up by username; their UUID and skin
  avatar are resolved from Mojang automatically.
- **Review screen** — a formatted overview of every setting before you commit
  to creating the server.
- **Direct Docker provisioning** — creates the container straight against the
  Docker Engine API (via [`dockerode`](https://github.com/apocas/dockerode)),
  with env vars, a memory limit, a persistent volume and Infrarust labels.
- **Label-based routing** — Infrarust watches the same Docker daemon, discovers
  the container by its `infrarust.*` labels and routes the chosen domain to it.

## How it works

```
┌─────────────┐   create wizard    ┌──────────────────┐
│   Browser   │ ─────────────────▶ │  MCSM (Nuxt 3)   │
└─────────────┘                    │  Nitro server    │
                                   └───────┬──────────┘
                    Docker Engine API      │
                  (create + start, labels) │
                                           ▼
                              ┌────────────────────────┐
                              │ Docker daemon          │
                              │  itzg/minecraft-server │
                              │  container (labeled)   │
                              └───────────┬────────────┘
                                          │ same Docker network
                              ┌───────────▼────────────┐
                              │ Infrarust              │
                              │ watches the socket,    │
                              │ discovers labels,      │
                              │ routes domain → server │
                              └────────────────────────┘
```

1. You fill out the wizard; state lives client-side until the **Review** step.
2. On **Create Server**, the Nitro API (`/api/server/create`) creates a Docker
   container from the `itzg/minecraft-server` image with:
   - every setting as an env var (`TYPE`, `MOTD`, `DIFFICULTY`, `MAX_PLAYERS`,
     `VERSION`, `OPERATORS`, `WHITELIST`, `MEMORY`, …),
   - a hard memory limit and a named volume mounted at `/data`,
   - attachment to the shared Docker network, and
   - the Infrarust labels below.
3. **Infrarust** — running on the same daemon with its docker provider enabled —
   sees the new container, reads its labels and starts routing immediately. No
   file is written and no shared volume of configs is needed.

```yaml
labels:
  infrarust.enable: "true"
  infrarust.domains: "my-server.example.com"
  infrarust.port: "25565"
  infrarust.proxy_mode: "passthrough"
```

The dashboard lists servers by querying Docker directly (`/api/server`) for
containers carrying the `infrarust.enable` label, then pings each domain for
live status.

## Tech stack

| Area        | Technology |
| ----------- | ---------- |
| Framework   | [Nuxt 3](https://nuxt.com) (Vue 3, TypeScript), Nitro server |
| UI          | [Nuxt UI](https://ui.nuxt.com) + [Nuxt UI Pro](https://ui.nuxt.com/pro), Tailwind CSS |
| Validation  | [Zod](https://zod.dev) via `h3-zod` |
| Storage     | [unstorage](https://unstorage.unjs.io) filesystem driver (domains list) |
| Provisioning | [dockerode](https://github.com/apocas/dockerode) → Docker Engine API |
| MC proxy    | [Infrarust](https://github.com/Shadowner/Infrarust) (Docker-label discovery) |
| MC data     | `minecraft-data`, `@sfirew/minecraft-motd-parser`, `@ahdg/minecraftstatuspinger`, `jimp` (skin rendering) |

## Self-hosting

### Prerequisites

- **Node.js 20+** and **[pnpm](https://pnpm.io)** (`pnpm@9` is pinned via
  `packageManager`).
- A **Docker daemon** MCSM can reach (local socket or a remote TCP/TLS host).
- **[Infrarust](https://github.com/Shadowner/Infrarust)** running against the
  same daemon with its docker provider enabled and joined to the shared
  network, e.g.:
  ```yaml
  docker_provider:
    docker_host: "unix:///var/run/docker.sock"
    label_prefix: "infrarust"
    watch: true
  ```
- A shared **Docker network** (default name `infrarust`) that both Infrarust
  and the created Minecraft containers join.
- A **[Nuxt UI Pro](https://ui.nuxt.com/pro) license key** to build for
  production (not needed for `pnpm dev`).

### 1. Clone and install

```bash
git clone https://github.com/Niki2k1/mcsm.git
cd mcsm
pnpm install
```

### 2. Configure environment

Copy the example file and adjust as needed:

```bash
cp .env.example .env
```

| Variable             | Required | Description |
| -------------------- | -------- | ----------- |
| `DOCKER_SOCKET_PATH` | ✅       | Path to the Docker socket MCSM provisions on. Defaults to `/var/run/docker.sock`. |
| `DOCKER_MC_NETWORK`  | ✅       | Shared Docker network Infrarust and the MC containers join. Default `infrarust`. |
| `MC_IMAGE`           | –        | Server image. Default `itzg/minecraft-server`. |
| `DOCKER_HOST_ADDR`   | –        | Remote Docker daemon host. When set, takes precedence over the socket. |
| `DOCKER_PORT` / `DOCKER_PROTOCOL` / `DOCKER_CA` / `DOCKER_CERT` / `DOCKER_KEY` | – | Remote daemon port and TLS material. |
| `NUXT_UI_PRO_LICENSE`| prod     | Nuxt UI Pro license key. Required for `pnpm build`. |

### 3. Secure the Docker socket ⚠️

MCSM provisions by talking to the Docker Engine API, and a web app with raw
socket access is effectively **root on the host**. In production, do **not**
mount the bare socket — put a restricted proxy such as
[`tecnativa/docker-socket-proxy`](https://github.com/Tecnativa/docker-socket-proxy)
in front of it, allow only the endpoints MCSM needs (containers, images,
networks, volumes), and point `DOCKER_SOCKET_PATH` / `DOCKER_HOST_ADDR` at the
proxy.

### 4. Seed domains

The wizard's domain options are read from filesystem storage at
`.data/objects/domains.json` (exposed via `GET /api/domains`). Seed one or
more before creating a server:

```bash
mkdir -p .data/objects
echo '["example.com"]' > .data/objects/domains.json
```

…or POST to `/api/domains/create` once the app is running. The chosen
`subdomain.domain` becomes the value of the container's `infrarust.domains`
label.

### 5. Run

**Development** (hot reload on `http://localhost:3000`, no license needed):

```bash
pnpm dev
```

**Production build & start:**

```bash
pnpm build      # requires NUXT_UI_PRO_LICENSE
node .output/server/index.mjs
```

MCSM persists its domains list to the `.data/` directory, so mount it as a
volume if you containerize the app. See the
[Nuxt deployment docs](https://nuxt.com/docs/getting-started/deployment) for
other targets.

## Project structure

```
app/
  components/
    server/steps/      # wizard steps: type, details, ServerProperties, Review
    server/Status.vue  # dashboard list (queries /api/server)
    user/              # player lookup list (operators / whitelist)
    Motd.vue           # MOTD preview renderer
    ReviewRow / BoolBadge / PlayerPills   # review-screen building blocks
  composables/         # create-form state, MOTD parser
  pages/
    index.vue          # server overview / status
    servers/create.vue # the creation wizard
server/
  api/
    server/create.post.ts   # provisions the container via Docker
    server/index.get.ts      # lists managed containers from Docker
    domains/                 # list / create / delete domains
    minecraft/               # versions, player profile, skin, server status
  utils/
    useDocker.ts             # dockerode provisioner (pluggable per-host)
    minecraft/               # skin rendering, status pinger, caching
public/                      # Monocraft font, favicon
nuxt.config.ts               # modules, runtimeConfig (docker hosts), storage
```

## Caveats

- **Single Docker host by default.** `useDocker(hostId)` resolves daemons from
  `runtimeConfig.docker.hosts`, so multiple hosts can be added later, but only
  `default` is wired up today.
- **Lifecycle is create-only for now.** Stop/restart/delete of servers from the
  UI isn't implemented yet.
- **Per-server MOTD/offline status** is set as an env var on the container; the
  richer offline-status placeholder behaviour of file-based proxies isn't
  modelled through Infrarust labels.
- This is an early-stage project and APIs/structure may change.

## License

No license has been specified for this project yet.
