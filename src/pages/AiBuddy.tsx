import { useEffect, useRef, useState } from "react";
import { askAi } from "../services/api";

interface ChatLine { role: "user" | "assistant"; content: string; }

export default function AiBuddy() {
  const [lines, setLines] = useState<ChatLine[]>([{ role: "assistant", content: "Γεια! Είμαι ο Λιάκος. Ρώτα με ό,τι θέλεις." }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, busy]);

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    const next: ChatLine[] = [...lines, { role: "user", content: value }];
    setLines(next);
    setText("");
    setBusy(true);
    try {
      const { reply } = await askAi(next);
      setLines([...next, { role: "assistant", content: reply }]);
    } catch {
      setLines([...next, { role: "assistant", content: "Ουπς, κάτι πήγε στραβά. Ξαναδοκίμασε." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen-grid">
      <header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="screen-title">🤖 Λιάκος AI</h1>
        <p className="screen-subtitle">Ρώτα οτιδήποτε, απαντάω απλά</p>
      </header>

      <div ref={scrollRef} className="min-h-0 overflow-y-auto px-4 py-2">
        <div className="flex min-h-full flex-col justify-end gap-3">
          {lines.map((line, index) => (
            <div key={index} className={`max-w-[88%] rounded-[1.5rem] px-5 py-3 text-[clamp(1rem,4.6vw,1.2rem)] leading-relaxed ${line.role === "user" ? "self-end rounded-br-md bg-liakos-500" : "self-start rounded-bl-md bg-white/10"}`}>
              {line.content}
            </div>
          ))}
          {busy && <div className="self-start rounded-2xl bg-white/10 px-5 py-3 text-white/50">Ο Λιάκος γράφει…</div>}
        </div>
      </div>

      <div className="composer-safe flex gap-2 border-t border-white/10 bg-liakos-900/95 px-3 py-3 backdrop-blur">
        <input className="input min-w-0 flex-1 text-base" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ρώτα κάτι…" />
        <button className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-liakos-500 text-2xl active:scale-90 transition" onClick={send} aria-label="Αποστολή">➤</button>
      </div>
    </main>
  );
}
