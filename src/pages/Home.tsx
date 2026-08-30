import { useNavigate } from "react-router-dom";
import { getUser } from "../services/api";

const actions = [
  { path: "/chats", icon: "💬", title: "Chat", text: "Μίλα με την παρέα", color: "from-violet-500 to-indigo-600" },
  { path: "/camera", icon: "🎥", title: "Video", text: "Τράβα και μοιράσου", color: "from-pink-500 to-rose-600" },
  { path: "/updates", icon: "📣", title: "Feed", text: "Δες τα νέα της παρέας", color: "from-amber-400 to-orange-600" },
  { path: "/games", icon: "🎮", title: "Games", text: "Παίξε και διασκέδασε", color: "from-emerald-400 to-teal-600" },
  { path: "/ai", icon: "🤖", title: "AI", text: "Ρώτα τον Λιάκο", color: "from-sky-400 to-blue-600" }
];

export default function Home() {
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

      <section className="grid grid-cols-2 gap-3">
        {actions.map((action, index) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={`relative min-h-36 overflow-hidden rounded-[1.75rem] bg-gradient-to-br p-4 text-left shadow-lg active:scale-[0.97] transition ${action.color} ${index === 0 ? "col-span-2 min-h-32" : ""}`}
          >
            <span className="block text-[clamp(2.25rem,10vw,3.5rem)] leading-none" aria-hidden="true">{action.icon}</span>
            <span className="mt-3 block text-xl font-black">{action.title}</span>
            <span className="mt-0.5 block text-sm font-medium text-white/85">{action.text}</span>
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl text-white/70">›</span>
          </button>
        ))}
      </section>
    </main>
  );
}
