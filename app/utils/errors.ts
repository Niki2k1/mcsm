/**
 * Human-readable message from a $fetch error — prefers the server's
 * statusMessage over a generic fallback so users see the actual reason.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const fetchError = error as {
    data?: { statusMessage?: string; message?: string };
    statusMessage?: string;
    message?: string;
  };
  return (
    fetchError?.data?.statusMessage ||
    fetchError?.statusMessage ||
    fallback
  );
}
