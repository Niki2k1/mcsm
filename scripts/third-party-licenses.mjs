// Writes public/third-party-licenses.txt: the license notice of every
// production dependency (walked through node_modules, so it matches exactly
// what the build bundles) plus bundled fonts and trademark notices. Runs as
// part of `build`; the output is generated, not committed.
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "public", "third-party-licenses.txt");

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

// Packages whose package.json omits the license, verified against upstream.
const LICENSE_OVERRIDES = {
  "vaul-vue": "MIT (per https://github.com/unovue/vaul-vue/blob/main/LICENSE)",
};

/** Node-style lookup of `name` from a package directory, walking up node_modules. */
function resolvePackage(fromDir, name) {
  let dir = fromDir;
  while (true) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    // pnpm places a package's deps as siblings of the package itself.
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const packages = new Map(); // "name@version" -> info
const queue = [realpathSync(root)];
const seenDirs = new Set();

while (queue.length) {
  const dir = queue.shift();
  if (seenDirs.has(dir)) continue;
  seenDirs.add(dir);

  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const isRoot = dir === realpathSync(root);
  if (!isRoot) {
    const key = `${pkg.name}@${pkg.version}`;
    if (!packages.has(key)) {
      const files = readdirSync(dir)
        .filter((f) => LICENSE_FILE.test(f))
        .sort();
      packages.set(key, {
        name: pkg.name,
        version: pkg.version,
        license:
          LICENSE_OVERRIDES[pkg.name] ??
          (typeof pkg.license === "string"
            ? pkg.license
            : pkg.license?.type ?? pkg.licenses?.map((l) => l.type).join(" OR ") ?? "UNKNOWN"),
        author: typeof pkg.author === "string" ? pkg.author : pkg.author?.name,
        repository:
          typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url,
        texts: files.map((f) => readFileSync(join(dir, f), "utf8").trim()),
      });
    }
  }

  const deps = {
    ...pkg.dependencies,
    ...pkg.optionalDependencies,
    ...(isRoot ? {} : pkg.peerDependencies),
  };
  // The root's devDependencies are build-only and never shipped.
  for (const name of Object.keys(deps)) {
    const resolved = resolvePackage(dir, name);
    // Missing = an optional/platform-specific dep that isn't installed here.
    if (resolved) queue.push(resolved);
  }
}

const sorted = [...packages.values()].sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
);

const rule = "-".repeat(78);
const ofl = readFileSync(join(root, "public", "OFL.txt"), "utf8").trim();

let out = `MCSM — THIRD-PARTY NOTICES
${"=".repeat(78)}

MCSM is licensed under the MIT License (see LICENSE in the repository).
It includes the third-party software and assets listed below, each under its
own license. Contact: info@niki2k1.dev

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG
OR MICROSOFT. Minecraft is a trademark of Mojang AB.

The CurseForge, Feed The Beast, Forge, Paper, Fabric and Modrinth names and
logos are trademarks of their respective owners and are used only to identify
the server types MCSM can run.

${rule}
FONTS
${rule}

Monocraft — https://github.com/IdreesInc/Monocraft
Poppins — Copyright 2020 The Poppins Project Authors
  (https://github.com/itfoundry/Poppins)

Both fonts are licensed under the SIL Open Font License 1.1:

${ofl}

${rule}
NPM PACKAGES (${sorted.length})
${rule}
`;

for (const p of sorted) {
  out += `\n${p.name}@${p.version}\nLicense: ${p.license}\n`;
  if (p.author) out += `Author: ${p.author}\n`;
  if (p.repository) out += `Repository: ${p.repository}\n`;
  out += p.texts.length
    ? `\n${p.texts.join("\n\n")}\n`
    : "\n(No license file shipped with the package; see its declared license above.)\n";
  out += `\n${rule}\n`;
}

writeFileSync(outFile, out);
console.info(`[licenses] Wrote ${sorted.length} package notices to public/third-party-licenses.txt`);
