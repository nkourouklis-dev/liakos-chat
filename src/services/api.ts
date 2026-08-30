import { apiBaseUrl, wsBaseUrl } from "../config";

const TOKEN_KEY = "liakos.token";
const USER_KEY = "liakos.user";

export interface User {
  id: string;
  handle: string;
  displayName: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

export async function login(name: string): Promise<User> {
  const data = await request<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export interface Room {
  id: string;
  name: string;
  kind: string;
}

export const listRooms = () => request<{ rooms: Room[] }>("/api/rooms").then((r) => r.rooms);

export const getRoom = (id: string) => request<{ room: Room }>(`/api/rooms/${id}`).then((r) => r.room);

export const createRoom = (name: string) =>
  request<{ id: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ name }) });

export const joinRoom = (id: string) => request<{ ok: boolean }>(`/api/rooms/${id}/join`, { method: "POST" });

export interface Message {
  id: string;
  handle: string;
  name: string;
  kind: string;
  body?: string;
  mediaKey?: string;
  createdAt: number;
}

export const listMessages = (roomId: string) =>
  request<{ messages: Message[] }>(`/api/rooms/${roomId}/messages`).then((r) => r.messages);

/* ------------------------------ Unread badges ------------------------------ */

export interface UnreadRoom {
  roomId: string;
  roomName: string;
  count: number;
  lastAt: number;
}

export interface UnreadState {
  total: number;
  rooms: UnreadRoom[];
}

export const getUnread = () => request<UnreadState>("/api/unread");

export const markRoomRead = (roomId: string) =>
  request<{ ok: boolean }>(`/api/rooms/${roomId}/read`, { method: "POST" });

/* ---------------------------------- Media ---------------------------------- */

export async function uploadMedia(blob: Blob): Promise<string> {
  const data = await request<{ key: string }>("/api/media", {
    method: "POST",
    body: blob,
    headers: { "Content-Type": blob.type || "application/octet-stream" }
  });
  return data.key;
}

export const mediaUrl = (key: string) => `${apiBaseUrl}/api/media/${key}`;

export interface Update {
  id: string;
  handle: string;
  name: string;
  caption?: string;
  mediaKey: string;
  createdAt: number;
}

export const listUpdates = () => request<{ updates: Update[] }>("/api/updates").then((r) => r.updates);

export const postUpdate = (mediaKey: string, caption: string) =>
  request<{ ok: boolean }>("/api/updates", { method: "POST", body: JSON.stringify({ mediaKey, caption }) });

export const askAi = (messages: { role: string; content: string }[]) =>
  request<{ reply: string }>("/api/ai/chat", { method: "POST", body: JSON.stringify({ messages }) });

export function openRoomSocket(roomId: string): WebSocket {
  return new WebSocket(`${wsBaseUrl}/ws/${roomId}?token=${encodeURIComponent(getToken() ?? "")}`);
}
