export default defineNuxtConfig({
  // Extend the Docus documentation theme. Declared here (rather than via the
  // `--extends docus` CLI flag) so this project is registered as a proper Nuxt
  // layer — otherwise its public/ directory (screenshots) is never served.
  extends: ["docus"],

  // nuxt-charts powers the live Analytics demo (same library as the MCSM app).
  modules: ["nuxt-charts"],

  // Components under app/components/content/ are embedded in markdown via MDC
  // (e.g. ::demo-analytics), which requires them to be registered globally.
  components: [
    { path: "~/components/content", global: true, pathPrefix: false },
    "~/components",
  ],

  site: {
    name: "MCSM",
  },
});
