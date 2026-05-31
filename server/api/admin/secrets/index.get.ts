/**
 * List the known secrets with metadata and a masked preview — never the raw
 * value. The UI uses this to show which secrets are configured.
 */
export default defineEventHandler(async () => {
  const { getAll } = useSecrets();
  const values = await getAll();

  return SECRET_DEFS.map((def) => {
    const value = values[def.key];
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      docsUrl: def.docsUrl,
      envVar: def.envVar,
      appliesTo: def.appliesTo ?? [],
      set: Boolean(value),
      preview: value ? maskSecret(value) : "",
    };
  });
});
