import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, getUser, listRooms, logout, type Room } from "../services/api";
import Badge from "../components/Badge";

const palette = ["bg-liakos-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500", "bg-sky-500", "bg-rose-500"];

function colorFor(id: string): string {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return palette[sum % palette.length];
}

interface ChatsProps {
  countFor?: (roomId: string) => number;
}

export default function Chats({ countFor }: ChatsProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const me = getUser();

  useEffect(() => {
    listRooms()
      .then(setRooms)
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, []);

  async function add() {
    if (!name.trim()) return;
    const { id } = await createRoom(name);
    setName("");
    navigate(`/room/${id}`);
  }

  // Δωμάτια με αδιάβαστα πάνε πρώτα στη λίστα.
  const sorted = countFor
    ? [...rooms].sort((a, b) => countFor(b.id) - countFor(a.id))
    : rooms;

  return (
    <main className="page-shell space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="screen-title">💬 Chat</h1>
          <p className="screen-subtitle">Γεια σου, {me?.displayName}</p>
        </div>
        <button
          className="rounded-2xl bg-white/10 px-4 py-3 text-sm active:scale-95 transition"
          onClick={() => {
            logout();
            location.href = "/login";
          }}
        >
          Έξοδος
        </button>
      </header>

      <div className="flex gap-3">
        <input
          className="input text-base"
          placeholder="Όνομα νέου chat..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn shrink-0 px-6 text-2xl" onClick={add}>
          +
        </button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      )}

      {!loading && rooms.length === 0 && (
        <div className="card flex flex-col items-center gap-3 py-14 text-center">
          <div className="text-6xl">💬</div>
          <p className="text-lg text-white/60">Κανένα chat ακόμη</p>
          <p className="text-sm text-white/40">Φτιάξε ένα και στείλε το link στους φίλους σου</p>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((room) => {
          const unread = countFor?.(room.id) ?? 0;

          return (
            <button
              key={room.id}
              className={`flex w-full items-center gap-4 rounded-3xl border p-4 text-left active:scale-[0.98] transition ${
                unread > 0 ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-white/5"
              }`}
              onClick={() => navigate(`/room/${room.id}`)}
            >
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold ${colorFor(
                  room.id
                )}`}
              >
                {room.name.trim().slice(0, 1).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className={`truncate text-lg ${unread > 0 ? "font-black" : "font-semibold"}`}>{room.name}</div>
                <div className={`text-sm ${unread > 0 ? "text-red-300" : "text-white/40"}`}>
                  {unread > 0
                    ? unread === 1
                      ? "1 νέο μήνυμα"
                      : `${unread} νέα μηνύματα`
                    : "Πάτα για να μπεις"}
                </div>
              </div>

              {unread > 0 ? <Badge count={unread} /> : <div className="text-2xl text-white/30">›</div>}
            </button>
          );
        })}
      </div>
    </main>
  );
}
