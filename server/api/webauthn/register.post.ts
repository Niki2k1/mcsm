import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { credentials } from "../../db/schema";

/**
 * Register a passkey for the *logged-in* user. Passkeys are added from the
 * account menu, never during login — so the userName is always pinned to the
 * session user, not whatever the client sends.
 */
export default defineWebAuthnRegisterEventHandler({
  async validateUser(userBody, event) {
    const { user } = await requireUserSession(event);
    // The browser dialog shows userName/displayName — force them to the
    // session user so a tampered request can't attach a passkey elsewhere.
    return {
      userName: user.email,
      displayName: user.name,
    };
  },

  async excludeCredentials(event, _userName) {
    // Stop the authenticator from registering the same device twice.
    const { user } = await requireUserSession(event);
    const rows = await db
      .select({ id: credentials.id, transports: credentials.transports })
      .from(credentials)
      .where(eq(credentials.userId, user.id));
    return rows.map((row) => ({
      id: row.id,
      transports: row.transports ? JSON.parse(row.transports) : undefined,
    }));
  },

  storeChallenge(event, challenge, attemptId) {
    webauthnChallenges.store(attemptId, challenge);
  },

  getChallenge(event, attemptId) {
    return webauthnChallenges.consume(attemptId);
  },

  async onSuccess(event, { credential }) {
    const { user } = await requireUserSession(event);

    await db.insert(credentials).values({
      id: credential.id,
      userId: user.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      backedUp: credential.backedUp,
      transports: JSON.stringify(credential.transports ?? []),
      createdAt: Date.now(),
    });
  },
});
