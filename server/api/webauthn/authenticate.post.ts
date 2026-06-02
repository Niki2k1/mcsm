import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { credentials, users } from "../../db/schema";

/**
 * Passkey login (public). Supports both flows:
 *  - email typed in first → allowCredentials narrows to that user's passkeys
 *  - usernameless → the authenticator picks a discoverable credential
 */
export default defineWebAuthnAuthenticateEventHandler({
  storeChallenge(event, challenge, attemptId) {
    webauthnChallenges.store(attemptId, challenge);
  },

  getChallenge(event, attemptId) {
    return webauthnChallenges.consume(attemptId);
  },

  async allowCredentials(event, userName) {
    const user = await findUserByEmail(userName);
    if (!user) return [];
    const rows = await db
      .select({ id: credentials.id, transports: credentials.transports })
      .from(credentials)
      .where(eq(credentials.userId, user.id));
    return rows.map((row) => ({
      id: row.id,
      transports: row.transports ? JSON.parse(row.transports) : undefined,
    }));
  },

  async getCredential(event, credentialId) {
    const [row] = await db
      .select()
      .from(credentials)
      .where(eq(credentials.id, credentialId))
      .limit(1);

    if (!row) {
      throw createError({
        statusCode: 400,
        statusMessage: "Unknown passkey",
      });
    }

    return {
      id: row.id,
      publicKey: row.publicKey,
      counter: row.counter,
      backedUp: row.backedUp,
      transports: row.transports ? JSON.parse(row.transports) : undefined,
      userId: row.userId,
    };
  },

  async onSuccess(event, { credential, authenticationInfo }) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, credential.userId as number))
      .limit(1);

    if (!user) {
      throw createError({ statusCode: 401, statusMessage: "Unknown user" });
    }

    // The signature counter guards against cloned authenticators.
    await db
      .update(credentials)
      .set({ counter: authenticationInfo.newCounter })
      .where(eq(credentials.id, credential.id));

    await loginUser(event, user);
  },
});
