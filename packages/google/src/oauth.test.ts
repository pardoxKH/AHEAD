import type { OAuth2Client, TokenPayload } from "google-auth-library";
import { describe, expect, it, vi } from "vitest";
import { buildAuthUrl, createOAuthClient, exchangeCode, verifyAllowedUser } from "./oauth.js";
import { BASE_SCOPES } from "./scopes.js";

const config = { clientId: "client-id", clientSecret: "secret", redirectUri: "https://ahead.test/callback" };

describe("buildAuthUrl", () => {
  it("asks for offline access, consent and incremental scopes", () => {
    const url = new URL(
      buildAuthUrl(createOAuthClient(config), {
        scopes: BASE_SCOPES,
        state: "xyz",
        includeGrantedScopes: true,
      }),
    );
    const params = url.searchParams;
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
    expect(params.get("include_granted_scopes")).toBe("true");
    expect(params.get("state")).toBe("xyz");
    expect(params.get("client_id")).toBe("client-id");
    expect(params.get("redirect_uri")).toBe(config.redirectUri);
    expect(params.get("scope")?.split(" ")).toEqual([...BASE_SCOPES]);
  });
});

describe("exchangeCode", () => {
  it("returns tokens and the granted scopes", async () => {
    const client = createOAuthClient(config);
    const tokens = { access_token: "a", refresh_token: "r", scope: "openid email" };
    vi.spyOn(client, "getToken").mockImplementation(async () => ({ tokens, res: null }));
    const result = await exchangeCode(client, "code");
    expect(result.tokens).toBe(tokens);
    expect(result.grantedScopes).toEqual(["openid", "email"]);
    expect(client.credentials.refresh_token).toBe("r");
  });
});

describe("verifyAllowedUser", () => {
  const verifierFor = (payload: Partial<TokenPayload>) =>
    ({
      verifyIdToken: vi.fn(async () => ({ getPayload: () => payload })),
    }) as unknown as Pick<OAuth2Client, "verifyIdToken">;
  const opts = { idToken: "token", audience: "client-id", allowedEmail: "Tariq@Example.com " };

  it("accepts the allowed, verified account (case-insensitive)", async () => {
    const verifier = verifierFor({ email: "tariq@example.COM", email_verified: true });
    await expect(verifyAllowedUser(verifier, opts)).resolves.toBe("tariq@example.com");
    expect(verifier.verifyIdToken).toHaveBeenCalledWith({ idToken: "token", audience: "client-id" });
  });

  it("rejects any other account", async () => {
    const verifier = verifierFor({ email: "someone@example.com", email_verified: true });
    await expect(verifyAllowedUser(verifier, opts)).rejects.toThrow("not allowed");
  });

  it("rejects an unverified email", async () => {
    const verifier = verifierFor({ email: "tariq@example.com", email_verified: false });
    await expect(verifyAllowedUser(verifier, opts)).rejects.toThrow("not verified");
  });

  it("rejects a token without email", async () => {
    await expect(verifyAllowedUser(verifierFor({}), opts)).rejects.toThrow("no email");
  });
});
