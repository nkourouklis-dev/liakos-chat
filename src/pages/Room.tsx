import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deleteRoom,
  getRoom,
  getUser,
  joinRoom,
  listMessages,
  markRoomRead,
  mediaUrl,
  openRoomSocket,
  renameRoom,
  type Message
} from "../services/api";

interface RoomProps {
  onEnter?: (roomId: string) => void;
  onLeave?: () => void;
}

export default function Room({ onEnter, onLeave }: RoomProps) {
  const { roomId = "" } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [roomName, setRoomName] = useState("Δωμάτιο");
  const [isOwner, setIsOwner] = useState(false);
  const [text, setText] = useState("");
  const [online, setOnline] = useState(0);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const me = getUser();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    onEnter?.(roomId);
    markRoomRead(roomId).catch(() => undefined);

    getRoom(roomId)
      .then((room) => {
        if (cancelled) return;
        setRoomName(room.name);
        setIsOwner(room.createdBy === me?.id);
      })
      .catch(() => undefined);

    joinRoom(roomId)
      .then(() => listMessages(roomId))
      .then((history) => !cancelled && setMessages(history))
      .catch(() => undefined);

    const socket = openRoomSocket(roomId);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("open");
      socket.send(JSON.stringify({ type: "ping" }));
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === "message") {
        setMessages((prev) => [...prev, payload]);
      }

      if (payload.type === "presence") {
        setOnline(payload.count);
      }

      // Οι αλλαγές έρχονται σε όλους ζωντανά, χωρίς refresh.
      if (payload.type === "edit") {
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.id ? { ...m, body: payload.body, editedAt: payload.editedAt } : m))
        );
      }

      if (payload.type === "delete") {
        setMessages((prev) => prev.filter((m) => m.id !== payload.id));
      }
    };

    socket.onclose = () => setStatus("closed");
    socket.onerror = () => setStatus("closed");

    return () => {
      cancelled = true;
      socket.close();
      markRoomRead(roomId)
        .catch(() => undefined)
        .finally(() => onLeave?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  function send() {
    if (!text.trim() || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "message", roomId, kind: "text", body: text }));
    setText("");
  }

  function shareLink() {
    const url = `${location.origin}/room/${roomId}`;
    if (navigator.share) navigator.share({ title: "Liakos Chat", url });
    else {
      navigator.clipboard.writeText(url);
      alert("Το link αντιγράφηκε!");
    }
  }

  function saveEdit() {
    const body = editText.trim();
    if (!editing || !body || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "edit", id: editing.id, body }));
    setEditing(null);
    setEditText("");
  }

  function removeMessage(message: Message) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "delete", id: message.id }));
    setSelected(null);
  }

  async function handleRename() {
    const next = prompt("Νέο όνομα δωματίου:", roomName);
    if (!next?.trim()) return;
    try {
      const result = await renameRoom(roomId, next);
      setRoomName(result.name);
    } catch {
      alert("Δεν επιτρέπεται. Μόνο ο δημιουργός μπορεί να μετονομάσει.");
    }
    setMenuOpen(false);
  }

  async function handleDelete() {
    const message = isOwner
      ? `Να διαγραφεί το "${roomName}" για όλους; Δεν αναιρείται.`
      : `Να αποχωρήσεις από το "${roomName}";`;

    if (!confirm(message)) return;

    try {
      await deleteRoom(roomId);
      navigate("/chats", { replace: true });
    } catch {
      alert("Κάτι πήγε στραβά.");
    }
  }

  const statusLabel =
    status === "open" ? `${online} online` : status === "connecting" ? "σύνδεση..." : "εκτός σύνδεσης";

  function timeOf(ms: number) {
    return new Date(ms).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr_auto]">
      <header className="relative flex items-center gap-2 border-b border-white/10 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl active:scale-90 transition"
          onClick={() => navigate("/chats")}
        >
          ‹
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{roomName}</div>
          <div className={`text-xs ${status === "open" ? "text-green-400" : "text-white/40"}`}>{statusLabel}</div>
        </div>

        <button
          className="shrink-0 rounded-2xl bg-liakos-500/20 px-3 py-3 text-sm font-semibold text-liakos-500 active:scale-95 transition"
          onClick={shareLink}
        >
          Κάλεσε
        </button>

        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl active:scale-90 transition"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Επιλογές δωματίου"
        >
          ⋮
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-3 top-full z-30 w-56 overflow-hidden rounded-2xl border border-white/15 bg-liakos-900 shadow-2xl">
              {isOwner && (
                <button className="w-full px-5 py-4 text-left active:bg-white/10" onClick={handleRename}>
                  ✏️ Μετονομασία
                </button>
              )}
              <button
                className="w-full border-t border-white/10 px-5 py-4 text-left text-red-400 active:bg-white/10"
                onClick={handleDelete}
              >
                {isOwner ? "🗑️ Διαγραφή για όλους" : "🚪 Αποχώρηση"}
              </button>
            </div>
          </>
        )}
      </header>

      <div ref={scrollRef} className="overflow-y-auto px-4 py-3">
        <div className="flex min-h-full flex-col justify-end gap-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="text-6xl">👋</div>
              <p className="text-white/40">Κανένα μήνυμα ακόμη. Πες κάτι!</p>
            </div>
          )}

          {messages.map((message) => {
            const mine = message.userId === me?.id;

            return (
              <div
                key={message.id}
                onClick={() => mine && setSelected(message)}
                className={`max-w-[80%] rounded-3xl px-5 py-3 text-base ${
                  mine
                    ? "self-end rounded-br-lg bg-liakos-500 cursor-pointer active:scale-[0.98] transition"
                    : "self-start rounded-bl-lg bg-white/10"
                }`}
              >
                {!mine && (
                  <div className="mb-0.5 text-xs font-bold text-liakos-500">{message.name ?? message.handle}</div>
                )}

                {message.kind === "media" && message.mediaKey ? (
                  <video className="mt-1 rounded-2xl" src={mediaUrl(message.mediaKey)} controls preload="none" playsInline />
                ) : (
                  <div className="whitespace-pre-wrap break-words">{message.body}</div>
                )}

                <div className={`mt-1 text-right text-[10px] ${mine ? "text-white/60" : "text-white/40"}`}>
                  {message.editedAt ? "επεξεργάστηκε · " : ""}
                  {timeOf(message.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="composer-safe flex gap-3 border-t border-white/10 p-3">
        <input
          className="input text-base"
          placeholder="Γράψε κάτι..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn shrink-0 px-6 text-xl" onClick={send}>
          ➤
        </button>
      </div>

      {/* Φύλλο ενεργειών όταν πατάς δικό σου μήνυμα */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setSelected(null)}>
          <div
            className="w-full space-y-2 rounded-t-[2rem] border-t border-white/15 bg-liakos-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-white/20" />

            {selected.kind === "text" && (
              <button
                className="secondary-action"
                onClick={() => {
                  setEditing(selected);
                  setEditText(selected.body ?? "");
                  setSelected(null);
                }}
              >
                ✏️ Επεξεργασία
              </button>
            )}

            <button
              className="secondary-action"
              onClick={() => {
                navigator.clipboard.writeText(selected.body ?? "");
                setSelected(null);
              }}
            >
              📋 Αντιγραφή
            </button>

            <button
              className="primary-action bg-red-600"
              onClick={() => {
                if (confirm("Διαγραφή μηνύματος;")) removeMessage(selected);
              }}
            >
              🗑️ Διαγραφή
            </button>

            <button className="secondary-action" onClick={() => setSelected(null)}>
              Άκυρο
            </button>
          </div>
        </div>
      )}

      {/* Παράθυρο επεξεργασίας */}
      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-5">
          <div className="w-full max-w-md space-y-3 rounded-[2rem] border border-white/15 bg-liakos-900 p-5">
            <h2 className="text-xl font-black">Επεξεργασία μηνύματος</h2>
            <textarea
              className="input min-h-28 text-base"
              value={editText}
              autoFocus
              maxLength={4000}
              onChange={(e) => setEditText(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                className="secondary-action"
                onClick={() => {
                  setEditing(null);
                  setEditText("");
                }}
              >
                Άκυρο
              </button>
              <button className="primary-action" disabled={!editText.trim()} onClick={saveEdit}>
                Αποθήκευση
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
