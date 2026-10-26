import * as v from "valibot";

/**
 * Download a backup tarball. The file is streamed out of the backup volume
 * through a disposable helper container (see openBackupDownload).
 */
export default defineEventHandler(async (event) => {
  const { id, backupId } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        id: v.string(),
        backupId: v.pipe(v.string(), v.toNumber(), v.integer()),
      })
    )
  );

  const { backup, stream, cleanup } = await openBackupDownload(
    event,
    id,
    backupId
  );

  // Friendly download name: <volume>-<timestamp>.tar.gz
  const date = new Date(backup.createdAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[T:]/g, "-");
  const filename = `${backup.volume}-${date}.tar.gz`;

  setHeader(event, "Content-Type", "application/gzip");
  setHeader(event, "Content-Disposition", `attachment; filename="${filename}"`);
  // Exact size recorded at backup creation — gives the browser a progress bar.
  // restic backups are packed on the fly, so their size isn't known upfront.
  if (backup.engine === "tar" && backup.sizeBytes) {
    setHeader(event, "Content-Length", backup.sizeBytes);
  }

  // Remove the helper container when the response ends, errors, or the client
  // aborts the download.
  event.node.res.on("close", () => {
    void cleanup();
  });

  return sendStream(event, stream);
});
