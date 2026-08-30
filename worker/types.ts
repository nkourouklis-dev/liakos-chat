export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  AI: Ai;
  ROOM: DurableObjectNamespace;
  APP_NAME: string;
  ALLOWED_ORIGIN_SUFFIX: string;
  JWT_SECRET: string;
}

export type WsEvent =
  | { type: "hello"; userId: string; handle: string }
  | { type: "message"; id: string; roomId: string; userId: string; handle: string; name: string; kind: string; body?: string; mediaKey?: string; createdAt: number }
  | { type: "typing"; userId: string; handle: string; name: string }
  | { type: "presence"; count: number; members: string[] }
  | { type: "game"; game: string; state: unknown }
  | { type: "error"; message: string };
