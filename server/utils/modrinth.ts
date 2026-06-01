/**
 * Helpers for the itzg image's MODRINTH_PROJECTS auto-install list — a
 * comma/whitespace-separated list of Modrinth project slugs, each optionally
 * suffixed with a version or channel (e.g. `chunky:beta`, `bluemap:5.7`).
 *
 * MCSM-managed integrations (Chunky pre-generation, BlueMap) merge their slugs
 * into this list without disturbing what the user typed in the Advanced
 * configuration field.
 */

export function parseModrinthProjects(
  projects: string | null | undefined
): string[] {
  return (projects ?? "")
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Whether a project slug is in the list (ignores any `:version` suffix). */
export function hasModrinthProject(
  projects: string | null | undefined,
  slug: string
): boolean {
  return parseModrinthProjects(projects).some(
    (token) => token.split(":")[0]?.toLowerCase() === slug.toLowerCase()
  );
}

/** Append a project slug to the list (no-op when already present). */
export function addModrinthProject(
  projects: string | null | undefined,
  slug: string
): string {
  if (hasModrinthProject(projects, slug)) return projects ?? slug;
  return [...parseModrinthProjects(projects), slug].join(",");
}
