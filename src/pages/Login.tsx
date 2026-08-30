import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login } from "../services/api";

export default function Login() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Το URL που ήθελε πριν τον πετάξουμε στο login (π.χ. invite link).
  const from = (location.state as { from?: string } | null)?.from ?? "/chats";
  const isInvite = from.startsWith("/room/");

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(name);
      navigate(from, { replace: true });
    } catch {
      setError("Δεν έγινε η σύνδεση. Γράψε τουλάχιστον 2 χαρακτήρες.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-5 p-6">
      <div>
        <h1 className="text-4xl font-bold">Liakos Chat</h1>
        <p className="mt-2 text-white/60">
          {isInvite ? "Σε κάλεσαν σε ένα δωμάτιο! Πώς σε λένε;" : "Γράψε το όνομά σου και μπες. Τέλος."}
        </p>
      </div>

      <input
        className="input text-lg"
        placeholder="Πώς σε λένε;"
        autoFocus
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn py-3 text-lg" disabled={busy || name.trim().length < 2} onClick={submit}>
        {busy ? "Σύνδεση..." : isInvite ? "Μπες στο δωμάτιο" : "Μπες"}
      </button>

      <p className="text-center text-xs text-white/30">Χωρίς κωδικό, χωρίς email. Δωρεάν για πάντα.</p>
    </div>
  );
}
