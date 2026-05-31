# MCSM — Minecraft Server Manager

A self-hostable web app for spinning up and managing Minecraft servers. MCSM
gives you a guided wizard to configure a server — type, version, memory,
world settings, MOTD, operators and whitelist — and then provisions it for you
as a Docker container through a [Coolify](https://coolify.io) instance, wiring
up domain routing and live status through an
[Infrared](https://infrared.dev) Minecraft proxy.

> **Status:** early / work in progress. Some deployment details (such as the
> target Coolify project and server) are currently hard-coded — see
> [Configuration](#configuration) and [Caveats](#caveats) before self-hosting.

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
- **Server provisioning** — creates the container via the Coolify API using
  the [`itzg/minecraft-server`](https://github.com/itzg/docker-minecraft-server)
  image and sets all the relevant environment variables.
- **Proxy routing & status** — generates an Infrared config so the server is
  reachable at `subdomain.yourdomain` with custom online/offline status.

## How it works

```
┌─────────────┐   create wizard    ┌──────────────────┐
│   Browser   │ ─────────────────▶ │  MCSM (Nuxt 3)   │
└─────────────┘                    │  Nitro server    │
                                   └───────┬──────────┘
                         Coolify API       │      writes proxy config (fs)
                  ┌────────────────────────┼──────────────────────────┐
                  ▼                         ▼                          ▼
        ┌──────────────────┐     ┌────────────────────┐    ┌────────────────────┐
        │ Coolify          │     │ itzg/minecraft-    │    │ Infrared proxy     │
        │ (Docker host)    │ ──▶ │ server container   │    │ (reads .data/proxy)│
        └──────────────────┘     └────────────────────┘    └────────────────────┘
```

1. You fill out the wizard; state lives client-side until the **Review** step.
2. On **Create Server**, the Nitro API (`/api/server/create`) calls Coolify to
   create a Docker application from the `itzg/minecraft-server` image and pushes
   each setting as an environment variable (`TYPE`, `MOTD`, `DIFFICULTY`,
   `MAX_PLAYERS`, `VERSION`, `OPERATORS`, `WHITELIST`, …), then starts it.
3. It also writes an Infrared proxy config to filesystem storage
   (`.data/proxy`) mapping `subdomain.domain → container:25565`, including the
   online/offline status (version, MOTD, max players) shown in the server list.

## Tech stack

| Area        | Technology |
| ----------- | ---------- |
| Framework   | [Nuxt 3](https://nuxt.com) (Vue 3, TypeScript), Nitro server |
| UI          | [Nuxt UI](https://ui.nuxt.com) + [Nuxt UI Pro](https://ui.nuxt.com/pro), Tailwind CSS |
| Validation  | [Zod](https://zod.dev) via `h3-zod` |
| Storage     | [unstorage](https://unstorage.unjs.io) filesystem driver |
| Orchestration | [Coolify](https://coolify.io) API → Docker |
| MC proxy    | [Infrared](https://infrared.dev) (config-driven) |
| MC data     | `minecraft-data`, `@sfirew/minecraft-motd-parser`, `@ahdg/minecraftstatuspinger`, `jimp` (skin rendering) |

## Self-hosting

### Prerequisites

- **Node.js 20+** and **[pnpm](https://pnpm.io)** (`pnpm@9` is pinned via
  `packageManager`).
- A running **[Coolify](https://coolify.io)** instance with API access, plus a
  Coolify **project** and **server (destination)** where the Minecraft
  containers should be deployed.
- An **[Infrared](https://infrared.dev)** proxy pointed at the same filesystem
  location MCSM writes configs to (`.data/proxy`), to actually route player
  connections. Without it, containers are still created but not reachable by a
  friendly domain.
- A **[Nuxt UI Pro](https://ui.nuxt.com/pro) license key** is required to build
  for production (not needed for `pnpm dev`).

### 1. Clone and install

```bash
git clone https://github.com/Niki2k1/mcsm.git
cd mcsm
pnpm install
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable               | Required | Description |
| ---------------------- | -------- | ----------- |
| `COOLIFY_BASE_API_URL` | ✅       | Base URL of your Coolify instance, e.g. `https://coolify.example.com`. MCSM appends `/api/v1`. |
| `COOLIFY_API_TOKEN`    | ✅       | Coolify API token (Bearer) with permission to create and start applications. |
| `NUXT_UI_PRO_LICENSE`  | prod     | Nuxt UI Pro license key. Required for `pnpm build`; omit for development. |

### 3. Configuration

A couple of values are currently **hard-coded** in
`server/api/server/create.post.ts` and must be changed to match your Coolify
setup before creating servers:

```ts
const { uuid } = await createApplication({
  project_uuid: "qc488ow", // ← your Coolify project UUID
  server_uuid: "f0ggkk8",  // ← your Coolify server (destination) UUID
  environment_name: "production",
  docker_registry_image_name: "itzg/minecraft-server",
  ports_exposes: "25565",
  // ...
});
```

Find these UUIDs in the Coolify dashboard (or via its API) for the project and
server you want to deploy into.

#### Domains

Available domains for the wizard are read from filesystem storage at
`.data/objects/domains.json` and exposed via `GET /api/domains`. Seed one or
more domains before creating a server, either by creating the file:

```bash
mkdir -p .data/objects
echo '["example.com"]' > .data/objects/domains.json
```

…or by POSTing to `POST /api/domains/create` once the app is running. The
chosen `subdomain.domain` becomes the server's address via the Infrared config.

### 4. Run

**Development** (hot reload on `http://localhost:3000`, no license needed):

```bash
pnpm dev
```

**Production build & start:**

```bash
pnpm build      # requires NUXT_UI_PRO_LICENSE
node .output/server/index.mjs
```

The build output is a standard Nitro Node server in `.output/`. See the
[Nuxt deployment docs](https://nuxt.com/docs/getting-started/deployment) for
other targets (Docker, etc.). Note that MCSM persists data to the `.data/`
directory on the local filesystem, so mount it as a volume if you containerize
the app, and make sure Infrared reads `.data/proxy` from the same location.

## Project structure

```
app/
  components/
    server/steps/      # wizard steps: type, details, ServerProperties, Review
    user/              # player lookup list (operators / whitelist)
    Motd.vue           # MOTD preview renderer
    ReviewRow / BoolBadge / PlayerPills   # review-screen building blocks
  composables/         # create-form state, MOTD parser
  pages/
    index.vue          # server overview / status
    servers/create.vue # the creation wizard
server/
  api/
    server/create.post.ts   # provisions the container via Coolify
    domains/                 # list / create / delete domains
    proxy/configs/           # Infrared proxy config CRUD (fs storage)
    minecraft/               # versions, player profile, skin, server status
  utils/
    useCoolify.ts            # Coolify API client
    minecraft/               # skin rendering, status pinger, caching
  schema/config.schema.ts    # Infrared proxy config schema
public/                      # Monocraft font, favicon
nuxt.config.ts               # modules, runtimeConfig, storage drivers
```

## Caveats

- The Coolify `project_uuid` / `server_uuid` are hard-coded (see
  [Configuration](#configuration)) — change them for your environment.
- Routing relies on an external Infrared proxy reading `.data/proxy`; MCSM only
  writes the configs.
- Storage is local-filesystem based via unstorage; there is no database.
- This is an early-stage project and APIs/structure may change.

## License

No license has been specified for this project yet.
