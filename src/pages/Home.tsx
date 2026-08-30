import { useNavigate } from "react-router-dom";
import { getUser } from "../services/api";

const actions = [
  { path: "/chats", icon: "💬", title: "Chat", text: "Μίλα με την παρέα", color: "from-violet-500 to-indigo-600" },
  { path: "/camera", icon: "🎥", title: "Video", text: "Τράβα και μοιράσου", color: "from-pink-500 to-rose-600" },
  { path: "/updates", icon: "📣", title: "Feed", text: "Δες τα νέα της παρέας", color: "from-amber-400 to-orange-600" },
  { path: "/games", icon: "🎮", title: "Games", text: "Παίξε και διασκέδασε", color: "from-emerald-400 to-teal-600" },
  { path: "/ai", icon: "🤖", title: "AI", text: "Ρώτα τον Λιάκο", color: "from-sky-400 to-blue-600" }
];

export default function Home({ unreadTotal = 0 }: { unreadTotal?: number }) {
  const navigate = useNavigate();
  const user = getUser();

  return (
    <main className="page-shell">
      <header className="mb-5">
        <p className="text-sm font-semibold text-liakos-500">LIAKOS CHAT</p>
        <h1 className="mt-1 text-[clamp(1.75rem,7vw,2.5rem)] font-black leading-tight">
          Γεια σου, {user?.displayName ?? "φίλε"} 👋
        </h1>
        <p className="mt-1 text-base text-white/55">Τι θέλεις να κάνεις;</p>
      </header>

      {unreadTotal > 0 && (
        <button
          onClick={() => navigate("/chats")}
          className="mb-4 flex w-full items-center gap-3 rounded-3xl border border-red-500/30 bg-red-500/15 p-4 text-left active:scale-[0.98] transition"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-2xl">
            🔔
          </span>
          <span className="flex-1">
            <span className="block font-black">
              {unreadTotal === 1 ? "1 νέο μήνυμα" : `${unreadTotal} νέα μηνύματα`}
            </span>
            <span className="block text-sm text-white/60">Πάτα για να τα δεις</span>
          </span>
          <span className="text-2xl text-white/50">›</span>
        </button>
      )}

      <section className="grid grid-cols-2 gap-3">
        {actions.map((action, index) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={`relative min-h-36 overflow-hidden rounded-[1.75rem] bg-gradient-to-br p-4 text-left shadow-lg active:scale-[0.97] transition ${action.color} ${
              index === 0 ? "col-span-2 min-h-32" : ""
            }`}
          >
            <span className="block text-[clamp(2.25rem,10vw,3.5rem)] leading-none" aria-hidden="true">
              {action.icon}
            </span>
            <span className="mt-3 block text-xl font-black">{action.title}</span>
            <span className="mt-0.5 block text-sm font-medium text-white/85">{action.text}</span>

            {action.path === "/chats" && unreadTotal > 0 && (
              <span className="absolute right-4 top-4 flex min-w-[2rem] items-center justify-center rounded-full bg-white px-2 py-1 text-sm font-black text-red-600">
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </span>
            )}

            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl text-white/70">›</span>
          </button>
        ))}
      </section>
    </main>
  );
}
