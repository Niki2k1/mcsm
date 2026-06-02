import type { H3Event } from "h3";
import { eq } from "drizzle-orm";
// Imported explicitly (not via the `db` auto-import): the auto-import's type
// resolves to `any` under pnpm because it references the package by path,
// which bypasses the package's `exports` types.
import { db } from "@nuxthub/db";
import { users } from "../db/schema";

/**
 * Auth helpers on top of nuxt-auth-utils.
 *
 * Accounts live in the `users` table; the first one is created by the
 * first-run setup wizard (always admin), more can be added from the Admin
 * panel. Sessions are sealed cookies handled by nuxt-auth-utils.
 */

export type UserRow = typeof users.$inferSelect;

/** The subset of a user row that goes into the (client-readable) session. */
export function sessionUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    admin: user.admin,
  };
}

/** Log the user in: replace whatever session exists with a fresh one. */
export async function loginUser(event: H3Event, user: UserRow) {
  await replaceUserSession(event, {
    user: sessionUser(user),
    loggedInAt: Date.now(),
  });
}

/** Require a session whose user is an admin (403 otherwise). */
export async function requireAdmin(event: H3Event) {
  const { user } = await requireUserSession(event);
  if (!user.admin) {
    throw createError({ statusCode: 403, statusMessage: "Admin only" });
  }
  return user;
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return user;
}

/** True while no account exists yet → the setup wizard must run. */
export async function needsSetup() {
  return !(await db.select({ id: users.id }).from(users).limit(1)).length;
}

// --- WebAuthn challenge store ----------------------------------------------
//
// Challenges are single-use and short-lived; an in-memory map is fine for a
// single-instance app (challenges don't need to survive a restart — the
// login attempt just starts over).

const CHALLENGE_TTL_MS = 5 * 60_000;
const challenges = new Map<string, { challenge: string; expires: number }>();

export const webauthnChallenges = {
  store(attemptId: string, challenge: string) {
    // Opportunistic cleanup so abandoned attempts don't pile up.
    const now = Date.now();
    for (const [key, value] of challenges) {
      if (value.expires < now) challenges.delete(key);
    }
    challenges.set(attemptId, {
      challenge,
      expires: now + CHALLENGE_TTL_MS,
    });
  },

  /** Single use: the challenge is removed when read. */
  consume(attemptId: string): string {
    const entry = challenges.get(attemptId);
    challenges.delete(attemptId);
    if (!entry || entry.expires < Date.now()) {
      throw createError({
        statusCode: 400,
        statusMessage: "Challenge expired, please try again",
      });
    }
    return entry.challenge;
  },
};
