// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-07-07",

  future: {
    compatibilityVersion: 4,
  },

  devtools: { enabled: true },

  modules: ["@nuxt/ui", "@nuxtjs/color-mode", "@nuxt/fonts", "@vueuse/nuxt"],

  extends: ["@nuxt/ui-pro"],

  colorMode: {
    preference: "dark",
  },

  nitro: {
    storage: {
      proxy: {
        driver: "fs",
        base: "./.data/proxy",
      },

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
