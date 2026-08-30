import type { Env, WsEvent } from "./types";

/**
 * ChatRoom = Durable Object, ένα instance ανά room.
 * Κρατάει τα WebSockets (με hibernation) και κάνει fan-out μηνυμάτων.
 */
export class ChatRoom {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/broadcast")) {
      const event = (await request.json()) as WsEvent;
      this.broadcast(event);
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const userId = url.searchParams.get("userId") ?? "anon";
    const handle = url.searchParams.get("handle") ?? "anon";
    const name = url.searchParams.get("name") ?? handle;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, handle, name });

    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const meta = ws.deserializeAttachment() as { userId: string; handle: string; name: string };
    let payload: any;
    try {
      payload = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    // Ο client στέλνει ping μόλις ανοίξει, για να πάρει σωστό presence.
    if (payload.type === "ping") {
      this.broadcastPresence();
      return;
    }

    if (payload.type === "typing") {
      this.broadcast({ type: "typing", userId: meta.userId, handle: meta.handle, name: meta.name }, ws);
      return;
    }

    if (payload.type === "game") {
      this.broadcast({ type: "game", game: payload.game, state: payload.state });
      return;
    }

    if (payload.type === "message") {
      const event: WsEvent = {
        type: "message",
        id: crypto.randomUUID(),
        roomId: payload.roomId,
        userId: meta.userId,
        handle: meta.handle,
        name: meta.name,
        kind: payload.kind ?? "text",
        body: payload.body,
        mediaKey: payload.mediaKey,
        createdAt: Date.now()
      };

      await this.env.DB.prepare(
        "INSERT INTO messages (id, room_id, user_id, kind, body, media_key, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?)"
      )
        .bind(
          event.id,
          payload.roomId,
          meta.userId,
          event.kind,
          event.body ?? null,
          event.mediaKey ?? null,
          payload.ttlSeconds ? Date.now() + payload.ttlSeconds * 1000 : null,
          event.createdAt
        )
        .run();

      this.broadcast(event);
    }
  }

  async webSocketClose(_ws: WebSocket) {
    this.broadcastPresence();
  }

  async webSocketError(_ws: WebSocket) {
    this.broadcastPresence();
  }

  private broadcast(event: WsEvent, exclude?: WebSocket) {
    const data = JSON.stringify(event);
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(data);
      } catch {
        /* ignore dead sockets */
      }
    }
  }

  private broadcastPresence() {
    const sockets = this.state.getWebSockets();
    const members = sockets.map((ws) => (ws.deserializeAttachment() as any)?.name ?? "anon");
    this.broadcast({ type: "presence", count: sockets.length, members });
  }
}
