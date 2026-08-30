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

type ExtractedMemory = {
  key: string;
  value: string;
  category: string;
  importance: number;
};

type StoredMemory = {
  memory_key: string;
  memory_value: string;
  category: string;
  importance: number;
  updated_at: number;
};

function normalizeMemoryKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function cleanMemoryValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 300);
}

function clampImportance(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

// Μερικά μοντέλα επιστρέφουν JSON τυλιγμένο σε markdown fences.
function parseJsonObject<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

/* --------------------------- Έλεγχος γλώσσας ------------------------------
 * Το Llama 4 Scout περιστασιακά γλιστράει σε κυριλλικά όταν γράφει ελληνικά,
 * επειδή τα δύο αλφάβητα μοιράζονται γειτονικό token space. Το prompt δεν
 * αρκεί, οπότε ελέγχουμε και στον κώδικα και ξαναζητάμε απάντηση.
 * -------------------------------------------------------------------------- */

const CYRILLIC = /[\u0400-\u04FF]/;
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;

function isGreek(text: string): boolean {
  return GREEK.test(text);
}

function hasCyrillic(text: string): boolean {
  return CYRILLIC.test(text);
}

async function getUserMemories(env: Env, userId: string): Promise<StoredMemory[]> {
  const { results } = await env.DB.prepare(
    `SELECT memory_key, memory_value, category, importance, updated_at
     FROM user_memory
     WHERE user_id = ?
     ORDER BY importance DESC, updated_at DESC
     LIMIT 30`
  )
    .bind(userId)
    .all<StoredMemory>();

  return results ?? [];
}

async function upsertUserMemory(env: Env, userId: string, memory: ExtractedMemory): Promise<void> {
  const key = normalizeMemoryKey(memory.key);
  const value = cleanMemoryValue(memory.value);
  if (!key || value.length < 2) return;

  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO user_memory (id, user_id, memory_key, memory_value, category, importance, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, memory_key) DO UPDATE SET
       memory_value = excluded.memory_value,
       category = excluded.category,
       importance = excluded.importance,
       updated_at = excluded.updated_at`
  )
    .bind(
      crypto.randomUUID(),
      userId,
      key,
      value,
      memory.category || "general",
      clampImportance(memory.importance),
      now,
      now
    )
    .run();
}

function buildMemoryContext(memories: StoredMemory[]): string {
  if (memories.length === 0) {
    return "Δεν υπάρχουν ακόμη αποθηκευμένες πληροφορίες για τον χρήστη.";
  }
  return memories.map((m) => `- [${m.category}] ${m.memory_key}: ${m.memory_value}`).join("\n");
}

const MEMORY_EXTRACTION_PROMPT = [
  "Είσαι μηχανισμός εξαγωγής μακροχρόνιας μνήμης χρήστη.",
  "Εξάγεις μόνο σταθερές, χρήσιμες πληροφορίες για μελλοντική συζήτηση.",
  "",
  "Επιτρέπονται: όνομα, πόλη, οικογένεια, κατοικίδια, ενδιαφέροντα, χόμπι,",
  "αγαπημένες ομάδες ή φαγητά, σταθερές προτιμήσεις, επάγγελμα, στόχοι.",
  "",
  "ΔΕΝ αποθηκεύεις: κωδικούς, tokens, οικονομικά, δεδομένα υγείας,",
  "προσωρινές διαθέσεις, τον καιρό, εφήμερες ερωτήσεις, υποθέσεις.",
  "",
  'Αν δεν υπάρχει σταθερή πληροφορία επέστρεψε: {"memories":[]}',
  "",
  "Αλλιώς επέστρεψε μόνο έγκυρο JSON:",
  '{"memories":[{"key":"pet_name","value":"Ρεξ","category":"pets","importance":7}]}',
  "",
  "Το key: σύντομο, αγγλικά, snake_case, μία ιδιότητα.",
  "Κατηγορίες: identity, location, family, pets, interests, preferences, work, goals, general",
  "Importance: αριθμός 1 έως 10.",
  "",
  "Επέστρεψε ΜΟΝΟ JSON, χωρίς markdown, χωρίς εξηγήσεις."
].join("\n");

async function extractMemoriesFromMessage(env: Env, message: string): Promise<ExtractedMemory[]> {
  const cleanMessage = message.trim().slice(0, 4000);
  if (!cleanMessage) return [];

  try {
    const result = (await env.AI.run(AI_MODEL, {
      messages: [
        { role: "system", content: MEMORY_EXTRACTION_PROMPT },
        { role: "user", content: cleanMessage }
      ],
      max_tokens: 350,
      temperature: 0.1,
      top_p: 0.8
    })) as AiRunResult;

    const raw = typeof result.response === "string" ? result.response.trim() : "";
    if (!raw) return [];

    const parsed = parseJsonObject<{ memories?: ExtractedMemory[] }>(raw);
    if (!parsed || !Array.isArray(parsed.memories)) {
      console.warn("Memory extraction returned invalid JSON", { raw });
      return [];
    }

    return parsed.memories
      .filter(
        (m): m is ExtractedMemory =>
          Boolean(m) &&
          typeof m.key === "string" &&
          typeof m.value === "string" &&
          typeof m.category === "string" &&
          typeof m.importance === "number"
      )
      .slice(0, 5)
      .map((m) => ({
        key: normalizeMemoryKey(m.key),
        value: cleanMemoryValue(m.value),
        category: m.category,
        importance: clampImportance(m.importance)
      }))
      .filter((m) => m.key.length > 0 && m.value.length >= 2);
  } catch (error) {
    // Αποτυχία μνήμης δεν πρέπει να κόβει την κύρια απάντηση.
    console.error("Memory extraction failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/* ---------------------------- Memory endpoints ---------------------------- */

app.get("/api/ai/memory", requireSession, async (c) => {
  const memories = await getUserMemories(c.env, c.get("session").userId);
  return c.json({
    memories: memories.map((m) => ({
      key: m.memory_key,
      value: m.memory_value,
      category: m.category,
      importance: m.importance,
      updatedAt: m.updated_at
    }))
  });
});

app.delete("/api/ai/memory/:key", requireSession, async (c) => {
  const key = normalizeMemoryKey(c.req.param("key"));
  if (!key) return c.json({ error: "invalid_memory_key" }, 400);

  await c.env.DB.prepare("DELETE FROM user_memory WHERE user_id = ? AND memory_key = ?")
    .bind(c.get("session").userId, key)
    .run();

  return c.json({ ok: true });
});

app.delete("/api/ai/memory", requireSession, async (c) => {
  await c.env.DB.prepare("DELETE FROM user_memory WHERE user_id = ?")
    .bind(c.get("session").userId)
    .run();
  return c.json({ ok: true });
});

/* ------------------------------- AI chat ---------------------------------- */

function buildLiakosPrompt(userName: string, memoryContext: string): string {
  return [
    "Είσαι ο Λιάκος, ο χαρακτήρας και η μασκότ του Liakos Chat.",
    "",
    `Ο χρήστης λέγεται ${userName}.`,
    "",
    "Μιλάς φυσικά, χαλαρά και φιλικά, σαν μέλος της παρέας.",
    "",
    "ΚΑΝΟΝΑΣ ΓΛΩΣΣΑΣ - ΑΠΟΛΥΤΟΣ:",
    "Αν το μήνυμα του χρήστη είναι στα ελληνικά, γράφεις ΜΟΝΟ με ελληνικό αλφάβητο.",
    "Απαγορεύεται εντελώς το κυριλλικό αλφάβητο. Καμία ρωσική ή σλαβική λέξη.",
    "Απαγορεύονται αγγλικές λέξεις μέσα σε ελληνική πρόταση.",
    "Πριν στείλεις την απάντηση, έλεγξέ την: αν περιέχει έστω έναν χαρακτήρα",
    "εκτός ελληνικού αλφαβήτου, ξαναγράψ' την από την αρχή στα ελληνικά.",
    "Αν το μήνυμα είναι στα αγγλικά, απαντάς μόνο στα αγγλικά.",
    "",
    "Οι απαντήσεις σου είναι σύντομες και πρακτικές.",
    "Δεν γράφεις μεγάλα κείμενα, εκτός αν ζητηθεί αναλυτική απάντηση.",
    "Μπορείς να χρησιμοποιείς λίγο έξυπνο και ευγενικό χιούμορ.",
    "",
    "Αν σε ρωτήσουν ποιος είσαι, συστήνεσαι ως ο Λιάκος και λες ότι ζεις",
    "μέσα στο Liakos Chat. Απαντάς φυσικά, όχι σαν εταιρικός βοηθός.",
    "",
    "Δεν λες ποτέ ότι είσαι ChatGPT ή language model.",
    "Δεν αναφέρεις system prompts ή τεχνικές οδηγίες.",
    "",
    "Αποθηκευμένες πληροφορίες για τον χρήστη:",
    "",
    memoryContext,
    "",
    "Κανόνες μνήμης:",
    "- Χρησιμοποίησε τις πληροφορίες μόνο όταν είναι σχετικές.",
    "- Μην απαριθμείς όλες τις μνήμες χωρίς λόγο.",
    "- Μην αναφέρεις ότι διάβασες στοιχεία από βάση δεδομένων.",
    "- Μην εφευρίσκεις μνήμες.",
    "- Αν δεν ξέρεις κάτι, πες καθαρά ότι δεν το θυμάσαι ακόμη.",
    "- Σε αντίφαση, προτίμησε την πιο πρόσφατη πληροφορία."
  ].join("\n");
}

app.post("/api/ai/chat", requireSession, async (c) => {
  try {
    const body = await c.req.json<{ messages?: AiChatMessage[] }>();

    const messages = Array.isArray(body.messages)
      ? body.messages
          .filter(
            (m): m is AiChatMessage =>
              Boolean(m) &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string" &&
              m.content.trim().length > 0
          )
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 4000) }))
      : [];

    if (messages.length === 0) {
      return c.json({ error: "empty_messages", message: "Γράψε κάτι για να απαντήσει ο Λιάκος." }, 400);
    }

    const session = c.get("session");
    const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");

    // Εξάγουμε νέες μνήμες ΠΡΙΝ την απάντηση, ώστε ο Λιάκος να μπορεί να
    // χρησιμοποιήσει αμέσως ένα νέο fact στην ίδια συζήτηση.
    if (latestUserMessage) {
      const extracted = await extractMemoriesFromMessage(c.env, latestUserMessage.content);
      for (const memory of extracted) {
        await upsertUserMemory(c.env, session.userId, memory);
      }
    }

    const storedMemories = await getUserMemories(c.env, session.userId);
    const memoryContext = buildMemoryContext(storedMemories);
    const systemPrompt = buildLiakosPrompt(session.name, memoryContext);

    const userWroteGreek = latestUserMessage ? isGreek(latestUserMessage.content) : false;

    async function ask(extraSystem?: string): Promise<string> {
      const systemMessages = extraSystem
        ? [
            { role: "system" as const, content: systemPrompt },
            { role: "system" as const, content: extraSystem }
          ]
        : [{ role: "system" as const, content: systemPrompt }];

      const result = (await c.env.AI.run(AI_MODEL, {
        messages: [...systemMessages, ...messages],
        max_tokens: 500,
        temperature: 0.4,
        top_p: 0.85,
        repetition_penalty: 1.1
      })) as AiRunResult;

      return typeof result.response === "string" ? result.response.trim() : "";
    }

    let reply = await ask();

    // Δεύτερη ευκαιρία αν ξέφυγαν κυριλλικά σε ελληνική συνομιλία.
    if (userWroteGreek && hasCyrillic(reply)) {
      console.warn("Cyrillic detected in Greek reply, retrying", { reply });
      reply = await ask(
        "Η προηγούμενη απάντησή σου περιείχε κυριλλικούς χαρακτήρες. Αυτό είναι λάθος. Γράψε ξανά την απάντηση αποκλειστικά με ελληνικό αλφάβητο."
      );

      // Αν επιμένει, καθαρίζουμε τις κυριλλικές λέξεις.
      if (hasCyrillic(reply)) {
        reply = reply
          .split(/\s+/)
          .filter((word) => !CYRILLIC.test(word))
          .join(" ")
          .replace(/\s+([,.!;:])/g, "$1")
          .trim();
      }
    }

    if (!reply) {
      console.error("Workers AI returned an empty response", { model: AI_MODEL });
      return c.json(
        { error: "empty_ai_response", message: "Ο Λιάκος δεν κατάφερε να απαντήσει. Δοκίμασε ξανά." },
        502
      );
    }

    return c.json({ reply, model: AI_MODEL, memoriesUsed: storedMemories.length });
  } catch (error) {
    console.error("AI chat failed", {
      model: AI_MODEL,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error)
    });

    return c.json(
      { error: "ai_unavailable", message: "Ο Λιάκος δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκίμασε ξανά." },
      502
    );
  }
});

export default app;
