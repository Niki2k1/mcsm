import { createRequire } from "node:module";
import { cp, realpath, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineNuxtModule, useLogger } from "@nuxt/kit";

/**
 * Copies libsql's platform-specific native binding into the Nitro output.
 *
 * The `libsql` package (used by NuxtHub's SQLite driver) loads its native
 * binding with a dynamic `require("@libsql/<platform-target>")` that Nitro's
 * dependency tracer cannot follow, so the binding never lands in
 * `.output/server/node_modules` and the production server crashes on startup
 * with "Cannot find module '@libsql/...'".
 *
 * This module mirrors libsql's own target selection (same helper packages) and
 * copies the resolved binding package into the output after the server build.
 */

/** Walk up from a file until the package.json belonging to `pkgName` is found. */
async function findPkgRoot(entryFile: string, pkgName: string) {
  let dir = dirname(entryFile);
  while (true) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
      if (pkg.name === pkgName) return dir;
    } catch {
      // No package.json here — keep walking up.
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate package root of ${pkgName}`);
    }
    dir = parent;
  }
}

/** Resolve a dependency's package root from within another package. */
async function resolvePkgDir(fromDir: string, pkgName: string) {
  const req = createRequire(join(fromDir, "_resolve.js"));
  const entry = await realpath(req.resolve(pkgName));
  return findPkgRoot(entry, pkgName);
}

export default defineNuxtModule({
  meta: { name: "libsql-bindings" },
  setup(_options, nuxt) {
    if (nuxt.options.dev) return;

    const logger = useLogger("libsql-bindings");

    nuxt.hook("nitro:init", (nitro) => {
      nitro.hooks.hook("compiled", async () => {
        try {
          // Resolve through the dependency chain (works with pnpm's strict
          // node_modules): root -> @libsql/client -> libsql -> binding.
          const clientDir = await resolvePkgDir(
            nuxt.options.rootDir,
            "@libsql/client"
          );
          const libsqlDir = await resolvePkgDir(clientDir, "libsql");

          // Same target selection libsql performs at runtime (libsql/index.js).
          const libsqlRequire = createRequire(join(libsqlDir, "index.js"));
          const { currentTarget } = libsqlRequire("@neon-rs/load");
          const { familySync, GLIBC } = libsqlRequire("detect-libc");
          let target: string = currentTarget();
          if (familySync() === GLIBC) {
            if (target === "linux-x64-musl") target = "linux-x64-gnu";
            if (target === "linux-arm64-musl") target = "linux-arm64-gnu";
          }

          const bindingDir = await resolvePkgDir(
            libsqlDir,
            `@libsql/${target}`
          );
          const dest = join(
            nitro.options.output.serverDir,
            "node_modules/@libsql",
            target
          );
          await cp(bindingDir, dest, { recursive: true, dereference: true });
          logger.success(
            `Copied @libsql/${target} native binding into output`
          );
        } catch (error) {
          logger.error("Failed to copy libsql native binding:", error);
          throw error;
        }
      });
    });
  },
});
