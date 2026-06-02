/**
 * Microsoft (Entra ID) OAuth login.
 *
 * MCSM has no open registration: the Microsoft account's email must match an
 * existing user (created via setup or the Admin panel). Otherwise the login
 * is rejected and the login page shows what happened.
 */
export default defineOAuthMicrosoftEventHandler({
  config: {
    scope: ["User.Read"],
  },

  async onSuccess(event, { user: msUser }) {
    // Personal accounts often have no `mail`; userPrincipalName always exists.
    const email: string | undefined = msUser.mail || msUser.userPrincipalName;
    if (!email) {
      return sendRedirect(event, "/login?error=oauth");
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // Unknown account — admins must create the user first.
      return sendRedirect(event, "/login?error=no-account");
    }

    await loginUser(event, user);

    return sendRedirect(event, "/");
  },

  onError(event, error) {
    consola.error("[mcsm] Microsoft OAuth failed:", error);
    return sendRedirect(event, "/login?error=oauth");
  },
});
