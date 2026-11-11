# TrueNAS custom app

- `mcsm.yaml` — the full stack (mcsm, infrarust, docker-socket-proxy) for
  **Apps → Discover Apps → ⋮ → Install via YAML** on TrueNAS 24.10 and later.

TrueNAS runs each app as a plain Docker Compose project, so this is
`docker-compose.yml` with the worlds, backups and database moved to a
dataset, plus the `x-portals` / `x-notes` keys TrueNAS reads for the Web UI
button and app notes. Edit the three values marked `EDIT` before installing.
See the
[installation guide](../docs/content/1.getting-started/2.installation.md#deploy-on-truenas)
for the full walkthrough.
