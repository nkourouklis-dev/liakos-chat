import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteUpdate, getUser, listUpdates, mediaUrl, type Update } from "../services/api";

function timeAgo(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "μόλις τώρα";
  if (mins < 60) return `${mins}λ`;
  const hours = Math.floor(mins / 60);
  return `${hours}ω`;
}

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export default function Updates() {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Update | null>(null);
  const navigate = useNavigate();
  const me = getUser();

  useEffect(() => {
    listUpdates()
      .then(setUpdates)
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }, []);

  async function remove(update: Update) {
    if (!confirm("Διαγραφή αυτού του video;")) return;

    setUpdates((prev) => prev.filter((u) => u.id !== update.id));
    setActive(null);

    try {
      await deleteUpdate(update.id);
    } catch {
      alert("Κάτι πήγε στραβά.");
      setUpdates(await listUpdates());
    }
  }

  if (active) {
    const mine = active.userId === me?.id;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <header className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-liakos-500 text-lg font-bold">
              {initials(active.name ?? active.handle)}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{active.name ?? active.handle}</div>
              <div className="text-xs text-white/50">{timeAgo(active.createdAt)}</div>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {mine && (
              <button
                className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-xl"
                onClick={() => remove(active)}
                aria-label="Διαγραφή"
              >
                🗑️
              </button>
            )}
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl"
              onClick={() => setActive(null)}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center">
          <video className="max-h-full w-full" src={mediaUrl(active.mediaKey)} controls autoPlay playsInline />
        </div>

        {active.caption && <p className="p-5 text-center text-lg">{active.caption}</p>}
      </div>
    );
  }

  return (
    <main className="page-shell space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="screen-title">📣 Feed</h1>
        <button className="btn px-5 py-3 text-base" onClick={() => navigate("/camera")}>
          + Νέο
        </button>
      </header>

      {loading && (
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      )}

      {!loading && updates.length === 0 && (
        <div className="card flex flex-col items-center gap-4 py-14 text-center">
          <div className="text-6xl">🎥</div>
          <p className="text-lg text-white/60">Κανένα update ακόμη</p>
          <button className="btn px-6 py-3 text-base" onClick={() => navigate("/camera")}>
            Τράβα το πρώτο
          </button>
        </div>
      )}

      {/* preload="metadata" -> κατεβαίνει μόνο το πρώτο καρέ, όχι όλο το video */}
      <div className="grid grid-cols-2 gap-4">
        {updates.map((update) => (
          <button
            key={update.id}
            onClick={() => setActive(update)}
            className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-white/5 text-left active:scale-95 transition"
          >
            <video
              className="absolute inset-0 h-full w-full object-cover opacity-80"
              src={`${mediaUrl(update.mediaKey)}#t=0.5`}
              preload="metadata"
              muted
              playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />

            <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-liakos-500 text-sm font-bold ring-2 ring-white/20">
                {initials(update.name ?? update.handle)}
              </div>
              <span className="truncate text-sm font-semibold drop-shadow">{update.name ?? update.handle}</span>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-3xl backdrop-blur">
                ▶
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 p-3">
              {update.caption && <p className="line-clamp-2 text-sm drop-shadow">{update.caption}</p>}
              <div className="mt-1 text-xs text-white/60">{timeAgo(update.createdAt)}</div>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
