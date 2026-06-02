import { z } from "zod";

/**
 * Password login (public). The same generic error is returned for "unknown
 * email" and "wrong password" so the form can't be used to probe accounts.
 */
export default defineEventHandler(async (event) => {
  const body = await useValidatedBody(event, {
    email: z.string().email(),
    password: z.string().min(1),
  });

  const invalid = () =>
    createError({
      statusCode: 401,
      statusMessage: "Invalid email or password",
    });

  const user = await findUserByEmail(body.email);
  // OAuth/passkey-only accounts have no password — treat like a wrong one.
  if (!user?.password) throw invalid();

  if (!(await verifyPassword(user.password, body.password))) {
    throw invalid();
  }

  await loginUser(event, user);

  return sessionUser(user);
});
