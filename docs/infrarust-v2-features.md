# Infrarust v2 — features MCSM could adopt

Findings from a review of [Infrarust](https://github.com/Shadowner/Infrarust)
`2.0.0-alpha.6` (the version our custom image builds). MCSM currently uses
Infrarust for **routing only** — four Docker labels (`infrarust.enable`,
`infrarust.domains`, `infrarust.port`, `infrarust.proxy_mode`) and nothing
else. v2 ships a lot more that we could integrate.

> Status: documented for later. None of this is implemented in MCSM yet.

## 1. Admin API + Web UI (biggest opportunity)

The `infrarust-plugin-admin-api` plugin is **always compiled into the binary**
(unlike the docker provider, it is not feature-gated), including our
`mcsm-infrarust` image. It is enabled via a `[web]` block in the proxy config:

```toml
[web]
enable_api = true
enable_webui = false        # embedded Nuxt dashboard; redundant next to MCSM
bind = "0.0.0.0:8080"
api_key = "<min 16 chars>"  # Bearer auth; auto-generated if omitted
cors_origins = []

[web.rate_limit]
requests_per_minute = 60
```

### Endpoints MCSM could consume

Auth: `Authorization: Bearer <api_key>` header (SSE endpoints accept
`?token=<api_key>` instead).

| Endpoint | Unlocks for MCSM |
|---|---|
| `GET /api/v1/players` (+ `/count`, `/{id}`) | Live "who's online" across all servers without RCON polling |
| `GET /api/v1/events` (SSE) | Real-time join/leave/activity feed |
| `GET /api/v1/logs` (SSE) + `/logs/history` | Live proxy log stream (MCSM already ships xterm) |
| `POST /api/v1/players/{u}/kick` / `message` / `send`, `POST /players/broadcast` | Kick / DM / move / broadcast from the MCSM UI, cross-server |
| `POST /api/v1/bans`, `DELETE /api/v1/bans/{type}/{value}`, `GET /api/v1/bans` | **Proxy-level bans** (IP / username / UUID, optional expiry) — enforced even while the target server container is stopped |
| `GET /api/v1/stats`, `GET /api/v1/proxy` | Proxy uptime, connection counts, version → dashboard panel |
| `GET /api/v1/servers/{id}/health` | Proxy-side backend health checks |

Source of truth for routes: `plugins/infrarust-plugin-admin-api/src/router.rs`
and `src/handlers/` in the Infrarust repo.

### Integration sketch

- docker-compose: add the `[web]` block to the inlined `infrarust_config`,
  pass the API key via env (`NUXT_INFRARUST_API_KEY` + matching
  `runtimeConfig`), expose port 8080 only on the shared `infrarust` network
  (never publish it on the host).
- MCSM server util `useInfrarust()` wrapping the REST API (mirror of
  `useDocker()`).
- UI: activity feed, ban management panel, player actions, proxy status card.

## 2. Additional Docker labels (quick win)

The docker provider reads more labels than we set
(`crates/infrarust-core/src/provider/docker/labels.rs`):

| Label | Effect |
|---|---|
| `infrarust.name` | Friendly display name (shows up in API/UI/logs) |
| `infrarust.motd.text` | Proxy-side MOTD override — served from the proxy's status cache even when the backend is slow/booting |
| `infrarust.send_proxy_protocol` | HAProxy PROXY protocol toward the backend → the Minecraft server sees **real client IPs** instead of the proxy's (itzg image supports this via `USE_PROXY_PROTOCOL=true` on Paper/Purpur) |
| `infrarust.network` | Preferred Docker network for address resolution (we already pin this via config `network = "infrarust"`) |

These only require changes to `server/utils/serverSpec.ts` (label map) and,
for proxy protocol, the container env.

## 3. Proxy-level ban system

Built into core (`crates/infrarust-core/src/ban/`): JSON-file persisted bans
by IP / username / UUID with optional expiry, audit log, and automatic purge.
Manageable through the Admin API (see above) or the proxy's interactive
console. Configured via:

```toml
[ban]
file = "./bans.json"        # needs a persistent volume
purge_interval = "5m"
enable_audit_log = true
```

## 4. Auth plugin (offline-mode servers)

`infrarust-plugin-auth` is compiled in by default (`default-plugins` feature):
`/login` + `/register` password auth (Argon2/bcrypt) using the limbo system,
for proxies fronting offline-mode servers. Only relevant if MCSM ever supports
`ONLINE_MODE=false` servers.

## 5. What does NOT work yet: server auto-wake for Docker

The dream feature — *player connects to a stopped server → container starts →
player gets routed in* — is **not possible upstream today**:

- `infrarust-plugin-server-wake` exists, but the server manager
  (`crates/infrarust_server_manager/`) only has **Local** (java -jar),
  **Pterodactyl**, and **Crafty Controller** providers. No Docker provider.
- The docker discovery provider only watches **running** containers
  (`status=running` filter in `provider/docker/mod.rs`), so a stopped MCSM
  server disappears from routing entirely — the proxy can't even know it
  exists.

This would make a good second upstream contribution (a Docker
`ServerProvider` for the server manager + discovery of stopped containers),
building on PR [Shadowner/Infrarust#83](https://github.com/Shadowner/Infrarust/pull/83).

## Caveats

- Everything here targets `2.0.0-alpha.6` — the API surface and config format
  may change before a stable v2 release.
- If upstream PR #83 is merged, the official image gains the docker provider
  and we can drop our custom `infrarust/Dockerfile` build; all of the above
  applies identically to the official image.
