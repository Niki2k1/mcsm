// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-07-07",

  future: {
    compatibilityVersion: 4,
  },

  devtools: { enabled: true },

  // MCSM is an internal, fully dynamic dashboard (live Docker state, pings,
  // log streams) with no SEO needs — render as a SPA. The Nitro server still
  // runs, so all /api routes keep working.
  ssr: false,

  // Nuxt UI v4 bundles Tailwind, icon, fonts and color-mode and includes the
  // former Pro components for free (no license, no separate module).
  modules: ["@nuxt/ui", "@vueuse/nuxt", "@nuxthub/core", "nuxt-charts"],

  // NuxtHub provides the SQLite database (Drizzle ORM, auto-imported `db` +
  // `schema` in server code). The libsql driver stores the file at
  // `.data/db/sqlite.db`, which lives on the persistent mcsm-data volume in
  // production. Migrations apply automatically in dev; in the prebuilt Docker
  // image they are applied at startup by server/plugins/migrations.ts.
  hub: {
    db: "sqlite",
  },

  css: ["~/assets/css/main.css", "@xterm/xterm/css/xterm.css"],

  colorMode: {
    preference: "dark",
  },

  // These are defaults only. Override them at runtime with `NUXT_`-prefixed env
  // vars whose names mirror this structure (e.g. `NUXT_DOCKER_HOSTS_DEFAULT_HOST`,
  // `NUXT_DOCKER_NETWORK`, `NUXT_RCON_PASSWORD`). Nuxt bakes `runtimeConfig` at
  // build time and only re-applies matching `NUXT_` env at runtime, so binding
  // defaults to differently-named vars (e.g. `process.env.DOCKER_HOST_ADDR`)
  // would work in dev but silently break in the prebuilt image.
  // https://nuxt.com/docs/guide/going-further/runtime-config
  runtimeConfig: {
    // RCON credentials MCSM uses to run console commands against servers.
    // The RCON port is never published — only reachable on the shared network.
    rcon: {
      port: "25575", // NUXT_RCON_PORT
      password: "minecraft", // NUXT_RCON_PASSWORD
    },
    docker: {
      // Image used for every Minecraft server container.
      image: "itzg/minecraft-server", // NUXT_DOCKER_IMAGE
      // Shared Docker network that Infrarust is attached to, so it can resolve
      // and reach the created containers.
      network: "infrarust", // NUXT_DOCKER_NETWORK
      // Docker daemons MCSM can provision on, keyed by id. Only `default` is
      // wired up today; add more entries for multi-host later.
      hosts: {
        default: {
          // Local (or socket-proxied) unix socket. Used when `host` is empty.
          socketPath: "/var/run/docker.sock", // NUXT_DOCKER_HOSTS_DEFAULT_SOCKET_PATH
          // Optional remote TCP/TLS daemon. When `host` is set it takes
          // precedence over `socketPath`.
          host: "", // NUXT_DOCKER_HOSTS_DEFAULT_HOST
          port: "", // NUXT_DOCKER_HOSTS_DEFAULT_PORT
          protocol: "", // NUXT_DOCKER_HOSTS_DEFAULT_PROTOCOL
          ca: "", // NUXT_DOCKER_HOSTS_DEFAULT_CA
          cert: "", // NUXT_DOCKER_HOSTS_DEFAULT_CERT
          key: "", // NUXT_DOCKER_HOSTS_DEFAULT_KEY
        },
      },
    },
  },

  nitro: {
    storage: {
      // Pre-SQLite storage. Still mounted so server/plugins/migrations.ts can
      // import legacy JSON data (secrets/settings/domains) into the database.
      objects: {
        driver: "fs",
        base: "./.data/objects",
      },
    },

    // Bundle the Drizzle migration SQL files into the server output so the
    // prebuilt Docker image can apply them at startup against the runtime
    // data volume (see server/plugins/migrations.ts).
    serverAssets: [
      {
        baseName: "migrations",
        dir: "./db/migrations",
      },
    ],

    imports: {
      presets: [
        {
          from: "h3-zod",
          imports: [
            "useValidatedQuery",
            "useValidatedBody",
            "useValidatedParams",
          ],
        },
        {
          from: "consola",
          imports: ["consola"],
        },
      ],
    },
  },
});
