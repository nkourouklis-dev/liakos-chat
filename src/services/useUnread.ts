import { useCallback, useEffect, useRef, useState } from "react";
import { getToken, getUnread, type UnreadState } from "./api";

const EMPTY: UnreadState = { total: 0, rooms: [] };
const POLL_MS = 12000;

/**
 * Κρατάει τα αδιάβαστα μηνύματα ζωντανά σε όλη την εφαρμογή.
 * - Ρωτάει τον server κάθε 12 δευτερόλεπτα.
 * - Σταματάει όταν το app είναι στο παρασκήνιο, για να μη σπαταλάει μπαταρία.
 * - Κάνει άμεσο refresh μόλις ο χρήστης επιστρέψει στην εφαρμογή.
 */
export function useUnread() {
  const [unread, setUnread] = useState<UnreadState>(EMPTY);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      setUnread(await getUnread());
    } catch {
      // Σιωπηλή αποτυχία: το badge δεν αξίζει να σπάσει την οθόνη.
    }
  }, []);

  useEffect(() => {
    refresh();

    function start() {
      if (timerRef.current !== null) return;
      timerRef.current = window.setInterval(refresh, POLL_MS);
    }

    function stop() {
      if (timerRef.current === null) return;
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        refresh();
        start();
      }
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const countFor = useCallback(
    (roomId: string) => unread.rooms.find((room) => room.roomId === roomId)?.count ?? 0,
    [unread]
  );

  // Τοπικό μηδένισμα όταν μπαίνεις σε δωμάτιο, χωρίς να περιμένεις τον server.
  const clearRoom = useCallback((roomId: string) => {
    setUnread((prev) => {
      const room = prev.rooms.find((r) => r.roomId === roomId);
      if (!room) return prev;
      return {
        total: Math.max(0, prev.total - room.count),
        rooms: prev.rooms.filter((r) => r.roomId !== roomId)
      };
    });
  }, []);

  return { unread, refresh, countFor, clearRoom };
}
