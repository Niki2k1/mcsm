// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-07-07",

  future: {
    compatibilityVersion: 4,
  },

  devtools: { enabled: true },

  // Nuxt UI v4 bundles Tailwind, icon, fonts and color-mode and includes the
  // former Pro components for free (no license, no separate module).
  modules: ["@nuxt/ui", "@vueuse/nuxt"],

  css: ["~/assets/css/main.css", "@xterm/xterm/css/xterm.css"],

  colorMode: {
    preference: "dark",
  },

  runtimeConfig: {
    // RCON credentials MCSM uses to run console commands against servers.
    // The RCON port is never published — only reachable on the shared network.
    rcon: {
      port: process.env.RCON_PORT || "25575",
      password: process.env.RCON_PASSWORD || "minecraft",
    },
    docker: {
      // Image used for every Minecraft server container.
      image: process.env.MC_IMAGE || "itzg/minecraft-server",
      // Shared Docker network that Infrarust is attached to, so it can resolve
      // and reach the created containers.
      network: process.env.DOCKER_MC_NETWORK || "infrarust",
      // Docker daemons MCSM can provision on, keyed by id. Only `default` is
      // wired up today; add more entries for multi-host later.
      hosts: {
        default: {
          // Local (or socket-proxied) unix socket. Used when `host` is empty.
          socketPath: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
          // Optional remote TCP/TLS daemon. When `host` is set it takes
          // precedence over `socketPath`.
          host: process.env.DOCKER_HOST_ADDR || "",
          port: process.env.DOCKER_PORT || "",
          protocol: process.env.DOCKER_PROTOCOL || "",
          ca: process.env.DOCKER_CA || "",
          cert: process.env.DOCKER_CERT || "",
          key: process.env.DOCKER_KEY || "",
        },
      },
    },
  },

  nitro: {
    storage: {
      objects: {
        driver: "fs",
        base: "./.data/objects",
      },
    },

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
