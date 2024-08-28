// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-07-07",

  future: {
    compatibilityVersion: 4,
  },

  devtools: { enabled: true },

  modules: ["@nuxt/ui", "@nuxtjs/color-mode", "@nuxt/fonts"],

  extends: ["@nuxt/ui-pro"],

  colorMode: {
    preference: "dark",
  },
});