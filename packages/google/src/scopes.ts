// OAuth scopes Ahead asks for. Keep these as narrow as possible:
// gmail.compose is the only way to create drafts, and the never-send rule (ADR 0002) is enforced in code.

/** Requested at sign-in. */
export const BASE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.app.created",
] as const;

/** Requested incrementally, only when Tariq imports his task document. */
export const IMPORT_SCOPES = ["https://www.googleapis.com/auth/documents.readonly"] as const;

export const ALL_SCOPES = [...BASE_SCOPES, ...IMPORT_SCOPES] as const;
