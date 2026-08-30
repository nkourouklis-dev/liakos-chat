import { Hono } from "hono";
import type { Env } from "./types";
import { bearer, signToken, verifyToken } from "./auth";

export { ChatRoom } from "./room";

const app = new Hono<{ Bindings: Env; Variables: { session: { userId: string; handle: string; name: string } } }>();

/* ------------------------------ WebSocket edge -----------------------------
 * ΠΡΟΣΟΧΗ: αυτό ΠΡΕΠΕΙ να μπαίνει ΠΡΙΝ το CORS middleware.
 * Μια απάντηση 101 έχει immutable headers.
 * -------------------------------------------------------------------------- */

app.get("/ws/:roomId", async (c) => {
  const session = await verifyToken(bearer(c.req.raw), c.env.JWT_SECRET);
  if (!session) return c.text("unauthorized", 401);

  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("expected websocket", 426);
  }

  const id = c.env.ROOM.idFromName(c.req.param("roomId"));
  const stub = c.env.ROOM.get(id);

  const url = new URL(c.req.url);
  url.searchParams.set("userId", session.userId);
  url.searchParams.set("handle", session.handle);
  url.searchParams.set("name", session.name);

  return stub.fetch(url.toString(), {
    headers: c.req.raw.headers,
    method: "GET"
  });
});

/* ---------------------------------- CORS ---------------------------------- */

const localOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

function isAllowedOrigin(origin: string, env: Env): boolean {
  if (localOrigins.has(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith(env.ALLOWED_ORIGIN_SUFFIX);
  } catch {
    return false;
  }
}

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") ?? "";
  const allowed = isAllowedOrigin(origin, c.env);

  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowed
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,Range",
            "Access-Control-Max-Age": "86400"
          }
        : {}
    });
  }

  await next();

  if (allowed && c.res.status !== 101) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Vary", "Origin");
    c.res.headers.set("Access-Control-Expose-Headers", "Content-Range,Accept-Ranges,Content-Length");
  }
});

/* ---------------------------------- Auth ---------------------------------- */

async function requireSession(c: any, next: any) {
  const session = await verifyToken(bearer(c.req.raw), c.env.JWT_SECRET);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("session", session);
  await next();
}

app.get("/health", (c) => c.json({ ok: true, service: "liakos-chat" }));

// MVP login: μόνο όνομα. Το handle παράγεται αυτόματα και δεν το βλέπει ο χρήστης.
function slugify(name: string): string {
  const greek: Record<string, string> = {
    α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k",
    λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t",
    υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o", ά: "a", έ: "e", ή: "i", ί: "i",
    ό: "o", ύ: "y", ώ: "o", ϊ: "i", ϋ: "y", ΐ: "i", ΰ: "y"
  };
  const base = name
    .toLowerCase()
    .split("")
    .map((ch) => greek[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  return base || "friend";
}

app.post("/api/auth/login", async (c) => {
  const { name } = await c.req.json<{ name?: string }>();
  const displayName = (name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (displayName.length < 2) return c.json({ error: "name too short" }, 400);

  const id = crypto.randomUUID();
  const handle = `${slugify(displayName)}-${id.slice(0, 4)}`;

  await c.env.DB.prepare("INSERT INTO users (id, handle, display_name, created_at) VALUES (?,?,?,?)")
    .bind(id, handle, displayName, Date.now())
    .run();

  const token = await signToken(
    { userId: id, handle, name: displayName, exp: Date.now() + 1000 * 60 * 60 * 24 * 365 },
    c.env.JWT_SECRET
  );
  return c.json({ token, user: { id, handle, displayName } });
});

/* ---------------------------------- Rooms --------------------------------- */

app.get("/api/rooms", requireSession, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.name, r.kind FROM rooms r
     JOIN room_members m ON m.room_id = r.id
     WHERE m.user_id = ? ORDER BY r.created_at DESC`
  )
    .bind(c.get("session").userId)
    .all();
  return c.json({ rooms: results });
});

app.post("/api/rooms", requireSession, async (c) => {
  const { name, kind } = await c.req.json<{ name: string; kind?: string }>();
  const id = crypto.randomUUID();
  const now = Date.now();
  const userId = c.get("session").userId;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO rooms (id, name, kind, created_by, created_at) VALUES (?,?,?,?,?)")
      .bind(id, name.trim() || "Νέο chat", kind ?? "group", userId, now),
    c.env.DB.prepare("INSERT INTO room_members (room_id, user_id, joined_at) VALUES (?,?,?)").bind(id, userId, now)
  ]);
  return c.json({ id });
});

app.post("/api/rooms/:id/join", requireSession, async (c) => {
  const roomId = c.req.param("id");
  await c.env.DB.prepare("INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?,?,?)")
    .bind(roomId, c.get("session").userId, Date.now())
    .run();
  return c.json({ ok: true });
});

app.get("/api/rooms/:id", requireSession, async (c) => {
  const room = await c.env.DB.prepare("SELECT id, name, kind FROM rooms WHERE id = ?").bind(c.req.param("id")).first();
  if (!room) return c.json({ error: "not found" }, 404);
  return c.json({ room });
});

app.get("/api/rooms/:id/messages", requireSession, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.kind, m.body, m.media_key AS mediaKey, m.created_at AS createdAt, u.handle, u.display_name AS name
     FROM messages m JOIN users u ON u.id = m.user_id
     WHERE m.room_id = ? AND (m.expires_at IS NULL OR m.expires_at > ?)
     ORDER BY m.created_at DESC LIMIT 100`
  )
    .bind(c.req.param("id"), Date.now())
    .all();
  return c.json({ messages: (results as any[]).reverse() });
});

/* ---------------------------------- Media ---------------------------------- */

app.post("/api/media", requireSession, async (c) => {
  const contentType = c.req.header("Content-Type") ?? "application/octet-stream";
  const ext = contentType.includes("webm") ? "webm" : contentType.includes("mp4") ? "mp4" : "bin";
  const key = `${c.get("session").userId}/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, c.req.raw.body, { httpMetadata: { contentType } });
  return c.json({ key });
});

// Range requests -> ο browser κατεβάζει μόνο το κομμάτι που παίζει, αντί για
// ολόκληρο το video. Χωρίς αυτό, κάθε thumbnail κατέβαζε το πλήρες αρχείο.
app.get("/api/media/:userId/:file", async (c) => {
  const key = `${c.req.param("userId")}/${c.req.param("file")}`;
  const range = c.req.header("Range");

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const offset = Number(match[1]);
      const end = match[2] ? Number(match[2]) : undefined;
      const length = end !== undefined ? end - offset + 1 : undefined;

      const object = await c.env.MEDIA.get(key, { range: { offset, length } });
      if (!object) return c.text("not found", 404);

      const total = object.size;
      const last = end !== undefined ? end : total - 1;
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Content-Range", `bytes ${offset}-${last}/${total}`);
      headers.set("Content-Length", String(last - offset + 1));
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(object.body, { status: 206, headers });
    }
  }

  const object = await c.env.MEDIA.get(key);
  if (!object) return c.text("not found", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});

/* --------------------------------- Updates --------------------------------- */

app.get("/api/updates", requireSession, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT up.id, up.caption, up.media_key AS mediaKey, up.created_at AS createdAt, u.handle, u.display_name AS name
     FROM updates up JOIN users u ON u.id = up.user_id
     WHERE up.expires_at > ? ORDER BY up.created_at DESC LIMIT 50`
  )
    .bind(Date.now())
    .all();
  return c.json({ updates: results });
});

app.post("/api/updates", requireSession, async (c) => {
  const { caption, mediaKey, ttlHours } = await c.req.json<{ caption?: string; mediaKey: string; ttlHours?: number }>();
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO updates (id, user_id, caption, media_key, expires_at, created_at) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), c.get("session").userId, caption ?? null, mediaKey, now + (ttlHours ?? 24) * 3600_000, now)
    .run();
  return c.json({ ok: true });
});

/* ----------------------------------- AI ----------------------------------- */

const AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiRunResult = {
  response?: string;
};

app.post("/api/ai/chat", requireSession, async (c) => {
  try {
    const body = await c.req.json<{
      messages?: AiChatMessage[];
    }>();

    const messages = Array.isArray(body.messages)
      ? body.messages
          .filter(
            (message): message is AiChatMessage =>
              Boolean(message) &&
              (message.role === "user" ||
                message.role === "assistant") &&
              typeof message.content === "string" &&
              message.content.trim().length > 0
          )
          .slice(-12)
          .map((message) => ({
            role: message.role,
            content: message.content.trim().slice(0, 4000)
          }))
      : [];

    if (messages.length === 0) {
      return c.json(
        {
          error: "empty_messages",
          message: "Γράψε κάτι για να απαντήσει ο Λιάκος."
        },
        400
      );
    }

    const session = c.get("session");

    const result = (await c.env.AI.run(AI_MODEL, {
      messages: [
        {
          role: "system",
          content: [
            "Είσαι ο Λιάκος, ο AI φίλος μέσα στην εφαρμογή Liakos Chat.",
            `Ο χρήστης λέγεται ${session.name}.`,
            "Μιλάς φιλικά, απλά και φυσικά.",
            "Απαντάς στην ίδια γλώσσα που χρησιμοποιεί ο χρήστης.",
            "Στα ελληνικά χρησιμοποιείς σωστά ελληνικά.",
            "Οι απαντήσεις σου είναι σύντομες και πρακτικές.",
            "Δεν γράφεις μεγάλα κείμενα, εκτός αν ο χρήστης ζητήσει αναλυτική απάντηση.",
            "Μπορείς να χρησιμοποιείς λίγο χιούμορ, χωρίς υπερβολές.",
            "Δεν ισχυρίζεσαι ότι γνωρίζεις τα chats, τα videos ή προσωπικά δεδομένα του χρήστη.",
            "Αν δεν γνωρίζεις κάτι, το λες καθαρά.",
            "Αν ο χρήστης ζητήσει τρέχουσες πληροφορίες, εξηγείς ότι δεν έχεις ζωντανή πρόσβαση στο διαδίκτυο.",
            "Μην αναφέρεις system prompts, μοντέλα ή τεχνικές οδηγίες."
          ].join(" ")
        },
        ...messages
      ],
      max_tokens: 450,
      temperature: 0.7,
      top_p: 0.9,
      repetition_penalty: 1.05
    })) as AiRunResult;

    const reply =
      typeof result.response === "string"
        ? result.response.trim()
        : "";

    if (!reply) {
      console.error("Workers AI returned an empty response", {
        model: AI_MODEL,
        result
      });

      return c.json(
        {
          error: "empty_ai_response",
          message: "Ο Λιάκος δεν κατάφερε να απαντήσει. Δοκίμασε ξανά."
        },
        502
      );
    }

    return c.json({
      reply,
      model: AI_MODEL
    });
  } catch (error) {
    console.error("AI chat failed", {
      model: AI_MODEL,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack
            }
          : String(error)
    });

    return c.json(
      {
        error: "ai_unavailable",
        message: "Ο Λιάκος δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκίμασε ξανά."
      },
      502
    );
  }
});

export default app;