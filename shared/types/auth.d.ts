/**
 * Shape of the nuxt-auth-utils session. `User` is what the client can read
 * via useUserSession(); never put secrets in it.
 */
declare module "#auth-utils" {
  interface User {
    id: number;
    email: string;
    name: string;
    admin: boolean;
  }

  interface UserSession {
    /** ms since epoch of the login that minted this session. */
    loggedInAt: number;
  }
}

export {};
