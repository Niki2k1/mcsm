import { describe, expect, it } from "vitest";
import {
  checkTokenAccess,
  isTokenExpired,
  tokenCoversServer,
} from "../../server/utils/tokenAccess";
import {
  hasTokenScope,
  isTokenScope,
  TOKEN_SCOPE_ROLE,
  TOKEN_SCOPES,
} from "../../shared/utils/tokenScopes";

describe("hasTokenScope", () => {
  it("accepts granted scopes", () => {
    expect(hasTokenScope(["servers:read"], "servers:read")).toBe(true);
    expect(hasTokenScope(["servers:read"], "servers:operate")).toBe(false);
  });

  it("lets Operate cover the narrower Whitelist scope", () => {
    expect(hasTokenScope(["servers:operate"], "players:whitelist")).toBe(true);
    expect(hasTokenScope(["players:whitelist"], "players:whitelist")).toBe(
      true
    );
  });

  it("never lets Whitelist reach console or power", () => {
    expect(hasTokenScope(["players:whitelist"], "servers:operate")).toBe(false);
    expect(hasTokenScope(["players:whitelist"], "servers:read")).toBe(false);
  });

  it("maps every scope to a role", () => {
    for (const scope of TOKEN_SCOPES) {
      expect(TOKEN_SCOPE_ROLE[scope]).toBeTruthy();
      expect(isTokenScope(scope)).toBe(true);
    }
    expect(TOKEN_SCOPE_ROLE["players:whitelist"]).toBe("operator");
    expect(isTokenScope("servers:everything")).toBe(false);
  });
});

describe("isTokenExpired", () => {
  it("treats null as never expiring", () => {
    expect(isTokenExpired(null, Date.now())).toBe(false);
  });

  it("expires at the exact timestamp", () => {
    expect(isTokenExpired(1000, 999)).toBe(false);
    expect(isTokenExpired(1000, 1000)).toBe(true);
  });
});

describe("tokenCoversServer", () => {
  it("covers everything without a restriction", () => {
    expect(tokenCoversServer({ servers: null }, "mc-a")).toBe(true);
  });

  it("only covers listed volumes when restricted", () => {
    expect(tokenCoversServer({ servers: ["mc-a"] }, "mc-a")).toBe(true);
    expect(tokenCoversServer({ servers: ["mc-a"] }, "mc-b")).toBe(false);
    expect(tokenCoversServer({ servers: ["mc-a"] }, null)).toBe(false);
    expect(tokenCoversServer({ servers: [] }, "mc-a")).toBe(false);
  });
});

describe("checkTokenAccess", () => {
  const bot = { scopes: ["players:whitelist"], servers: ["mc-a"] };

  it("allows in-scope actions within the user's role", () => {
    expect(
      checkTokenAccess(bot, "mc-a", "operator", "players:whitelist")
    ).toEqual({ ok: true });
  });

  it("refuses scopes the token lacks", () => {
    expect(
      checkTokenAccess(bot, "mc-a", "admin", "servers:operate")
    ).toMatchObject({ ok: false, statusCode: 403 });
  });

  it("hides servers outside the restriction, even from admins", () => {
    expect(
      checkTokenAccess(bot, "mc-b", "admin", "players:whitelist")
    ).toMatchObject({ ok: false, statusCode: 404 });
  });

  it("hides servers the user can't see", () => {
    expect(
      checkTokenAccess(bot, "mc-a", null, "players:whitelist")
    ).toMatchObject({ ok: false, statusCode: 404 });
  });

  it("follows the user's current role, not the token's scope", () => {
    expect(
      checkTokenAccess(bot, "mc-a", "viewer", "players:whitelist")
    ).toMatchObject({ ok: false, statusCode: 403 });
  });

  it("checks the scope before revealing whether a server exists", () => {
    expect(checkTokenAccess(bot, "mc-b", null, "servers:manage")).toMatchObject(
      { ok: false, statusCode: 403 }
    );
  });

  it("leaves unrestricted tokens to the user's role", () => {
    const oauth = { scopes: ["servers:read"], servers: null };
    expect(checkTokenAccess(oauth, "mc-z", "viewer", "servers:read")).toEqual({
      ok: true,
    });
  });
});
