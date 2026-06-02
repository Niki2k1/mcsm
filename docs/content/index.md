---
seo:
  title: MCSM — Minecraft Server Manager
  description: Self-hostable Minecraft server manager — provision, route and
    manage Docker-based Minecraft servers from a web dashboard with backups,
    analytics, mods and a 3D world map built in.
---

::u-page-hero
#title
Minecraft servers, managed.

#description
MCSM is a self-hostable web app that spins up Minecraft servers as Docker
containers and routes them by domain — with a guided setup wizard, live
console, analytics, world backups, mod management and a 3D world map built in.

#links
  :::u-button
  ---
  color: neutral
  size: xl
  to: /getting-started/introduction
  trailing-icon: i-lucide-arrow-right
  ---
  Get Started
  :::

  :::u-button
  ---
  color: neutral
  icon: i-simple-icons-github
  size: xl
  target: _blank
  to: https://github.com/Niki2k1/mcsm
  variant: outline
  ---
  View on GitHub
  :::
::

::u-page-section
#title
Not screenshots — the real thing

#description
These are the dashboard's actual UI components running right here with demo
data. Click around: edit the MOTD, switch chart ranges, create a backup.

  :::u-page-grid
    ::::u-page-card
    ---
    spotlight: true
    class: col-span-2
    to: /features/configuration
    ---
    :demo-motd-editor

    #title
    Live MOTD editor

    #description
    Write your MOTD with § codes or 1.16+ hex colors — rendered in the
    Minecraft font exactly as players will see it, obfuscated-text animation
    included. Try the toolbar and presets above.
    ::::

    ::::u-page-card
    ---
    spotlight: true
    class: col-span-2 lg:col-span-1
    to: /getting-started/introduction
    ---
    :demo-routing

    #title
    Subdomains, not ports

    #description
    The biggest pain of hosting multiple servers — gone. Every server gets its
    own domain through one shared port, routed by a Docker label that Infrarust
    discovers automatically. Add one above.
    ::::

    ::::u-page-card
    ---
    spotlight: true
    class: col-span-2 lg:col-span-1
    to: /features/backups
    ---
    :demo-backups

    #title
    World backups

    #description
    Snapshot the world volume with one click — download, upload and restore
    backups right from the dashboard. Go ahead, create one.
    ::::

    ::::u-page-card
    ---
    spotlight: true
    class: col-span-2
    to: /features/analytics
    ---
    :demo-analytics

    #title
    Analytics

    #description
    CPU, memory, latency and player counts — sampled every minute, charted
    over 1-hour, 24-hour and 7-day ranges. Switch the range above.
    ::::
  :::
::

::u-page-section
#title
One page per server

#description
Every server gets its own dashboard: Overview, Configuration, Environment,
Players, Console, Analytics, Backups, World, Map, Files and Settings.

  :::u-page-grid
    ::::u-page-card
    ---
    spotlight: true
    class: col-span-2
    to: /features/servers
    ---
    ![Server overview page with live status, connection info, config summary and activity feed](/screenshots/overview.png){.w-full.rounded-lg}

    #title
    Live server overview

    #description
    Status pings, player counts, uptime and latency at a glance — plus an
    activity feed of everything that happened to the server.
    ::::

    ::::u-page-card
    ---
    spotlight: true
    class: col-span-2
    to: /features/bluemap
    ---
    ![Interactive BlueMap 3D world map embedded in the dashboard](/screenshots/map.jpg){.w-full.rounded-lg}

    #title
    3D world map

    #description
    Toggle an interactive BlueMap for any server — auto-installed and served
    through MCSM's own domain, no extra ports or DNS needed.
    ::::
  :::
::

::u-page-section
#title
And everything else a server needs

#features
  :::u-page-feature
  ---
  icon: i-lucide-wand-sparkles
  to: /features/servers
  ---
  #title
  Guided setup wizard

  #description
  Pick a type — Vanilla, Paper, Fabric, Forge, FTB or CurseForge — choose a
  version, configure the world and go live in minutes.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-terminal
  to: /features/console
  ---
  #title
  Live console

  #description
  An xterm.js terminal streams server logs in real time and runs commands
  over RCON, right from the browser.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-package
  to: /features/files-and-mods
  ---
  #title
  Mods, plugins & Modrinth

  #description
  Browse Modrinth, install mods with dependencies in one click, get update
  badges, and edit config files in a built-in Monaco editor.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-users
  to: /features/players
  ---
  #title
  Player management

  #description
  Operators, whitelist, kick and ban — with skins and UUIDs resolved from
  Mojang automatically.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-globe
  to: /features/world-pre-generation
  ---
  #title
  World pre-generation

  #description
  Generate chunks ahead of time with Chunky and watch live progress on a
  map of the area — including where Chunky is working right now.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-fingerprint
  to: /features/authentication
  ---
  #title
  Accounts & passkeys

  #description
  Password, WebAuthn passkeys and Microsoft sign-in — with an admin panel for
  users, domains and API keys.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-container
  to: /getting-started/introduction
  ---
  #title
  Docker-native

  #description
  Servers are plain Docker containers running itzg/minecraft-server — no
  custom runtime, no lock-in.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-route
  to: /getting-started/introduction
  ---
  #title
  Label-based routing

  #description
  Infrarust discovers each server from its Docker labels and routes its
  domain to it — no proxy config files to manage.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-shield-check
  to: /getting-started/installation
  ---
  #title
  Self-hosted & open source

  #description
  MIT-licensed, deployable with a single Docker Compose stack — your servers,
  your hardware, your data.
  :::
::

::u-page-section
  :::u-page-c-t-a
  ---
  links:
    - label: Install MCSM
      to: /getting-started/installation
      trailingIcon: i-lucide-arrow-right
    - label: Star on GitHub
      to: https://github.com/Niki2k1/mcsm
      target: _blank
      color: neutral
      variant: outline
      icon: i-simple-icons-github
  ---
  #title
  Get your first server online tonight

  #description
  One Docker Compose stack gives you MCSM, the Infrarust proxy and a secured
  Docker socket — then every new server is just a wizard away.
  :::
::
