// Απλό HMAC token (χωρίς εξωτερικά libs). Αρκετό για MVP με φίλους.
const enc = new TextEncoder();

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
}

export interface Session {
  userId: string;
  handle: string;
  name: string;
  exp: number;
}

export async function signToken(session: Session, secret: string): Promise<string> {
  const payload = b64url(JSON.stringify(session));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifyToken(token: string | null, secret: string): Promise<Session | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  try {
    const expected = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload));
    if (b64url(expected) !== sig) return null;
    const session = JSON.parse(unb64url(payload)) as Session;
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const url = new URL(request.url);
  return url.searchParams.get("token");
}
