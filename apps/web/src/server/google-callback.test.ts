import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as GoogleModule from "@ahead/google";
import {
  decryptSecret,
  exchangeCode,
  loadEncryptionKey,
  NotAllowedUserError,
  verifyAllowedUser,
} from "@ahead/google";
import { testEnv } from "../test/env-fixture";
import { completeGoogleSignIn, type CallbackDeps, type CallbackInput } from "./google-callback";

vi.mock("@ahead/google", async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleModule>()),
  exchangeCode: vi.fn(),
  verifyAllowedUser: vi.fn(),
}));

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"];
const input: CallbackInput = { code: "auth-code", returnedState: "s1", cookieState: "s1", error: null };

function mockExchange(tokens: { id_token?: string; refresh_token?: string }) {
  vi.mocked(exchangeCode).mockResolvedValue({ tokens, grantedScopes: SCOPES });
}

describe("completeGoogleSignIn", () => {
  let deps: CallbackDeps & { saveConnection: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    deps = { env: testEnv, saveConnection: vi.fn().mockResolvedValue({ userId: "user-1" }) };
    mockExchange({ id_token: "id-token", refresh_token: "refresh-token" });
    vi.mocked(verifyAllowedUser).mockResolvedValue("owner@example.com");
  });

  it("stores the allowed user's encrypted refresh token and scopes", async () => {
    await expect(completeGoogleSignIn(input, deps)).resolves.toEqual({ ok: true, userId: "user-1" });

    expect(exchangeCode).toHaveBeenCalledWith(expect.anything(), "auth-code");
    expect(verifyAllowedUser).toHaveBeenCalledWith(expect.anything(), {
      idToken: "id-token",
      audience: testEnv.GOOGLE_CLIENT_ID,
      allowedEmail: testEnv.ALLOWED_EMAIL,
    });
    const saved = deps.saveConnection.mock.calls[0]?.[0];
    expect(saved).toMatchObject({ email: "owner@example.com", scopes: SCOPES });
    expect(saved.encryptedRefreshToken).not.toContain("refresh-token");
    const key = loadEncryptionKey({ TOKEN_ENCRYPTION_KEY: testEnv.TOKEN_ENCRYPTION_KEY });
    expect(decryptSecret(saved.encryptedRefreshToken, key)).toBe("refresh-token");
  });

  it("rejects any other Google account without storing anything", async () => {
    vi.mocked(verifyAllowedUser).mockRejectedValue(new NotAllowedUserError("someone@example.com"));
    await expect(completeGoogleSignIn(input, deps)).resolves.toEqual({ ok: false, reason: "not_allowed" });
    expect(deps.saveConnection).not.toHaveBeenCalled();
  });

  it("passes no refresh token when Google omits it, so the stored one is kept", async () => {
    mockExchange({ id_token: "id-token" });
    await expect(completeGoogleSignIn(input, deps)).resolves.toEqual({ ok: true, userId: "user-1" });
    expect(deps.saveConnection).toHaveBeenCalledWith({
      email: "owner@example.com",
      encryptedRefreshToken: undefined,
      scopes: SCOPES,
    });
  });

  it.each([
    ["a mismatched state", { returnedState: "other" }],
    ["a missing state cookie", { cookieState: undefined }],
  ])("refuses %s before talking to Google", async (_, override) => {
    await expect(completeGoogleSignIn({ ...input, ...override }, deps)).resolves.toEqual({
      ok: false,
      reason: "state",
    });
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("reports a cancelled consent", async () => {
    const result = await completeGoogleSignIn({ ...input, code: null, error: "access_denied" }, deps);
    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("fails when Google returns no ID token", async () => {
    mockExchange({ refresh_token: "refresh-token" });
    await expect(completeGoogleSignIn(input, deps)).resolves.toEqual({ ok: false, reason: "failed" });
    expect(deps.saveConnection).not.toHaveBeenCalled();
  });
});
