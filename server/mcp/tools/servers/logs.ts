import { z } from "zod";

export default defineMcpTool({
  name: "get_server_logs",
  description:
    "The last lines of a server's console output (startup progress, errors, chat, command output).",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:operate"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
    lines: z.number().int().min(1).max(1000).default(100),
  },
  handler: async ({ server: ref, lines }) => {
    const { server, docker } = await requireMcpServer(ref, "servers:operate");
    const raw = (await docker.docker.getContainer(server.id).logs({
      follow: false,
      stdout: true,
      stderr: true,
      tail: lines,
    })) as unknown as Buffer;
    return demuxDockerLogs(raw) || "(no output)";
  },
});

/**
 * Non-TTY containers prefix every chunk with an 8-byte header (stream type +
 * big-endian length); strip those instead of leaking binary into the text.
 */
function demuxDockerLogs(buffer: Buffer) {
  const chunks: string[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset + 4);
    chunks.push(buffer.toString("utf8", offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  return chunks.join("");
}
