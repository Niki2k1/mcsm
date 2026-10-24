# mcsm Discord bot

Self-service whitelisting for a Minecraft server managed by
[mcsm](../../README.md). A moderator posts the server rules with a button;
members click **Accept rules & get whitelisted**, enter their Minecraft
username and are whitelisted right away.

Each Discord member can whitelist **one** Minecraft account per server, and
each account can only be claimed by one member. mcsm enforces this (not the
bot), so restarting or replacing the bot can't reset it. Moderators see every
claim on the server's **Players** tab in mcsm and can release one there to let
the member claim again.

## Commands

| Command | Who | What |
| ------- | --- | ---- |
| `/setup-rules [server]` | Manage Server | Posts the rules from `RULES_FILE` with the claim button in the current channel. |
| `/whitelist list [server]` | Manage Server | Shows the whitelist (only to you). |
| `/mcstatus [server]` | Everyone | Whether the server is online and who is playing. |

The button keeps working after the bot restarts — the server id is part of the
button itself. Re-run `/setup-rules` after editing the rules file to post the
new version.

## Setup

1. **mcsm token** — in mcsm, open the user menu → **AI access** → *Personal
   access tokens* and create a token with the **Read** and **Whitelist**
   scopes, limited to your server. Copy it (`mcsm_pat_…`); it is shown once.
   Your own account needs the operator role (or admin) on that server.
   *Whitelist* can't run console commands or stop the server, so a leaked bot
   token can at most whitelist players.
2. **Discord application** — create one in the
   [Developer Portal](https://discord.com/developers/applications), add a bot
   and copy its token. No privileged intents are needed.
3. **Invite the bot** with the `bot` and `applications.commands` scopes and the
   *Send Messages* and *Embed Links* permissions (plus *Manage Roles* if you use
   `WHITELISTED_ROLE_ID` — the bot's role must sit above the role it assigns).
4. Write your rules into a Markdown file (see [`rules.example.md`](rules.example.md)).
   A leading `# Heading` becomes the embed title; the rest may be up to 4096
   characters.

## Configuration

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `DISCORD_TOKEN` | yes | Bot token. |
| `MCSM_URL` | yes | Base URL of mcsm, e.g. `https://mcsm.example.com`. |
| `MCSM_API_TOKEN` | yes | The `mcsm_pat_…` personal access token. |
| `RULES_FILE` | yes | Path to the rules Markdown file. Read on every `/setup-rules`, so edits need no restart. The Docker image defaults to `/config/rules.md`. |
| `MCSM_SERVER_ID` | no | Default server id (container name, e.g. `mc-survival`). Without it, the token's only server is used, or commands ask for `server`. |
| `DISCORD_GUILD_ID` | no | Register commands in one Discord server only; they show up instantly instead of after global propagation. |
| `WHITELISTED_ROLE_ID` | no | Role given to members after a successful claim. |

## Run

```sh
go build -o discord-bot .
DISCORD_TOKEN=… MCSM_URL=https://mcsm.example.com MCSM_API_TOKEN=mcsm_pat_… \
  RULES_FILE=./rules.md ./discord-bot
```

With Docker:

```sh
docker build -t mcsm-discord-bot .
docker run -d --restart unless-stopped \
  -e DISCORD_TOKEN=… -e MCSM_URL=https://mcsm.example.com \
  -e MCSM_API_TOKEN=mcsm_pat_… -e MCSM_SERVER_ID=mc-survival \
  -v "$PWD/rules.md:/config/rules.md:ro" \
  mcsm-discord-bot
```

## Develop

```sh
go vet ./...
go test ./...
```

The mcsm API client in `internal/mcsm` has no Discord dependency and can be
reused by other tools.
