# Unraid Community Applications templates

- `mcsm.xml` — the dashboard. Required.
- `infrarust.xml` — the Minecraft proxy for domain-based routing on port 25565. Optional.
- `infrarust/config.toml` — copy to `/mnt/user/appdata/infrarust/config.toml` before starting the proxy.

Both containers must run on a user-defined network named `infrarust`
(`docker network create infrarust`, with "Preserve user defined networks"
enabled under Settings → Docker). See the
[installation guide](../docs/content/1.getting-started/2.installation.md#deploy-on-unraid)
for the full walkthrough.

Submit the repository to Community Applications at
<https://ca.unraid.net/submit/new> with `https://github.com/Niki2k1/mcsm` as
the repository URL.
