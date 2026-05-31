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

- **Guided create/edit wizard** — a 4-step flow (Type → Details → Properties →
  Review) in a modal, shared between creating a server and editing an existing
  one.
- **Full lifecycle from the dashboard** — list, start, stop, edit and delete
  servers. Editing recreates the container with the new config while keeping the
  world volume; deleting removes the container but preserves the volume.
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
  mcsm.managed: "true"
  mcsm.name: "My Server"
  mcsm.config: "{…full wizard config as JSON…}"
```

**Docker is the source of truth — there is no database.** The full wizard
config is stashed in the `mcsm.config` label, so the dashboard lists servers by
querying Docker directly (`/api/server`, filtered on `mcsm.managed=true`),
pings each domain for live status, and prefills the edit form straight from the
label. Editing recreates the container (reusing its name and volume) since
Docker can't mutate env/labels in place.

## Tech stack

| Area        | Technology |
| ----------- | ---------- |
| Framework   | [Nuxt 3](https://nuxt.com) (Vue 3, TypeScript), Nitro server |
| UI          | [Nuxt UI v4](https://ui.nuxt.com) (Pro components included, no license), Tailwind CSS v4 |
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

**Development** (hot reload on `http://localhost:3000`):

```bash
pnpm dev
```

**Production build & start:**

```bash
pnpm build
node .output/server/index.mjs
```

> Nuxt UI v4 includes the former Pro components for free, so no
> `NUXT_UI_PRO_LICENSE` is needed to build.

MCSM persists its domains list to the `.data/` directory, so mount it as a
volume if you containerize the app. See the
[Nuxt deployment docs](https://nuxt.com/docs/getting-started/deployment) for
other targets.

## Deploy with Docker Compose (Coolify)

The repo ships a turnkey stack so you don't have to wire the pieces yourself:

- **`Dockerfile`** — builds the MCSM image.
- **`.github/workflows/docker-publish.yml`** — builds a multi-arch image and
  pushes it to **GHCR** (`ghcr.io/<owner>/mcsm`) on push to `main`, on `v*`
  tags, or via manual dispatch.
- **`docker-compose.yml`** — runs three services on two networks:
  - `mcsm` (the app), `infrarust` (the proxy) and `docker-socket-proxy`.
  - **Neither MCSM nor Infrarust mounts the raw Docker socket** — both reach it
    through the socket proxy over TCP, restricted to the endpoints they need.
  - The `infrarust` network is shared with the Minecraft containers MCSM
    creates; `dockerproxy` is internal (Docker API only).
- **`infrarust/config.yaml`** — enables Infrarust's docker provider against the
  socket proxy.

### Coolify

1. Push to `main` (or run the workflow manually) so the image publishes to
   GHCR, then make the GHCR package **public** — or add registry credentials in
   Coolify so it can pull.
2. In Coolify: **New Resource → Docker Compose**, point it at this repo (or
   paste `docker-compose.yml`).
3. Assign a domain to the **`mcsm`** service on port `3000` (Coolify fills the
   `SERVICE_FQDN_MCSM_3000` magic variable and routes HTTPS to it).
4. Point the DNS for your Minecraft domain (e.g. a wildcard `*.mc.example.com`)
   at the host — Infrarust listens on `25565`.
5. Deploy, then **seed at least one domain** (the wizard needs it): add it in
   the UI, or write `.data/objects/domains.json` in the `mcsm-data` volume.

### Plain Docker

```bash
git clone https://github.com/Niki2k1/mcsm.git
cd mcsm
# uncomment the mcsm `ports:` block in docker-compose.yml to expose the UI
docker compose up -d
```

The MCSM UI is then on `http://localhost:3000` and Minecraft on `:25565`.

## Project structure

```
app/
  components/
    server/steps/      # wizard steps: type, details, ServerProperties, Review
    server/FormModal.vue # shared create/edit wizard modal
    server/Status.vue  # dashboard list + delete confirm (queries /api/server)
    server/Card.vue    # per-server card with edit / delete actions
    user/              # player lookup list (operators / whitelist)
    Motd.vue           # MOTD preview renderer
    ReviewRow / BoolBadge / PlayerPills   # review-screen building blocks
  composables/         # create-form state, server-modal state, MOTD parser
  pages/
    index.vue          # server overview / dashboard
server/
  api/
    server/create.post.ts   # create: provision a container via Docker
    server/index.get.ts      # list managed servers from Docker
    server/[id]/index.get.ts    # read one server (prefills edit)
    server/[id]/index.put.ts    # update: recreate container, keep volume
    server/[id]/index.delete.ts # delete: remove container, keep volume
    server/[id]/start.post.ts   # start the container
    server/[id]/stop.post.ts    # stop the container
    domains/                 # list / create / delete domains
    minecraft/               # versions, player profile, skin, server status
  utils/
    useDocker.ts             # dockerode client (provision / list / get / remove)
    serverSpec.ts            # wizard config -> env + labels + volume
    minecraft/               # skin rendering, status pinger, caching
  schema/server.schema.ts    # shared zod config schema
public/                      # Monocraft font, favicon
nuxt.config.ts               # modules, runtimeConfig (docker hosts), storage
```

## Caveats

- **Single Docker host by default.** `useDocker(hostId)` resolves daemons from
  `runtimeConfig.docker.hosts`, so multiple hosts can be added later, but only
  `default` is wired up today.
- **No log/console view yet.** Create, start, stop, edit and delete are
  implemented; streaming a server's logs or an RCON console is a natural next
  step.
- **Per-server MOTD/offline status** is set as an env var on the container; the
  richer offline-status placeholder behaviour of file-based proxies isn't
  modelled through Infrarust labels.
- This is an early-stage project and APIs/structure may change.

## License

No license has been specified for this project yet.
