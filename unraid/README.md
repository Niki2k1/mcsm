# Unraid Community Applications templates

- `mcsm.xml` — the dashboard. Required.
- `infrarust.xml` — the Minecraft proxy for domain-based routing on port 25565. Optional.
- `infrarust/config.toml` — copy to `/mnt/user/appdata/infrarust/config.toml` before starting the proxy.
- `infrarust.png` — the Infrarust logo rendered to PNG; Unraid's Docker tab can't show the upstream SVG.

Both containers must run on a user-defined network named `infrarust`
(`docker network create infrarust`, with "Preserve user defined networks"
enabled under Settings → Docker). See the
[installation guide](../docs/content/1.getting-started/2.installation.md#deploy-on-unraid)
for the full walkthrough.

Turn on **Autostart** for both containers in the Docker tab: Unraid stops
them with `docker stop`, which the `unless-stopped` restart policy doesn't
undo after a reboot.

Only submit after this folder is merged to `main`: the templates install
`ghcr.io/niki2k1/mcsm:latest`, which is built from `main`, and their
`TemplateURL`s and links point there too. Submit the repository to Community Applications at
<https://ca.unraid.net/submit/new> with `https://github.com/Niki2k1/mcsm` as
the repository URL.
