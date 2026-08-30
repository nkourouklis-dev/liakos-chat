import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRoom, getUser, joinRoom, listMessages, mediaUrl, openRoomSocket, type Message } from "../services/api";

export default function Room() {
  const { roomId = "" } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [roomName, setRoomName] = useState("Δωμάτιο");
  const [text, setText] = useState("");
  const [online, setOnline] = useState(0);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const me = getUser();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    getRoom(roomId)
      .then((room) => !cancelled && setRoomName(room.name))
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
      if (payload.type === "message") setMessages((prev) => [...prev, payload]);
      if (payload.type === "presence") setOnline(payload.count);
    };

    socket.onclose = () => setStatus("closed");
    socket.onerror = () => setStatus("closed");

    return () => {
      cancelled = true;
      socket.close();
    };
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

  const statusLabel =
    status === "open" ? `${online} online` : status === "connecting" ? "σύνδεση..." : "εκτός σύνδεσης";

  function timeOf(ms: number) {
    return new Date(ms).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr_auto] pb-24">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
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
          className="shrink-0 rounded-2xl bg-liakos-500/20 px-4 py-3 text-sm font-semibold text-liakos-500 active:scale-95 transition"
          onClick={shareLink}
        >
          Κάλεσε
        </button>
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
            const mine = message.handle === me?.handle;
            return (
              <div
                key={message.id}
                className={`max-w-[80%] rounded-3xl px-5 py-3 text-base ${
                  mine ? "self-end rounded-br-lg bg-liakos-500" : "self-start rounded-bl-lg bg-white/10"
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
                  {timeOf(message.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 border-t border-white/10 p-3">
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
    </div>
  );
}
