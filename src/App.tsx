import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getUser } from "./services/api";
import { useUnread } from "./services/useUnread";
import Badge from "./components/Badge";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Chats from "./pages/Chats";
import Room from "./pages/Room";
import Camera from "./pages/Camera";
import Updates from "./pages/Updates";
import Games from "./pages/Games";
import AiBuddy from "./pages/AiBuddy";

const tabs = [
  { path: "/home", label: "Αρχική", icon: "⌂" },
  { path: "/chats", label: "Chat", icon: "💬" },
  { path: "/camera", label: "Video", icon: "🎥" },
  { path: "/updates", label: "Feed", icon: "📣" },
  { path: "/ai", label: "AI", icon: "🤖" }
];

function TabBar({ unreadTotal }: { unreadTotal: number }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="bottom-nav" aria-label="Κύρια πλοήγηση">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.path);
        const showBadge = tab.path === "/chats" && unreadTotal > 0;

        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`nav-item ${active ? "nav-item-active" : ""}`}
          >
            <span className="relative">
              <span className="nav-icon" aria-hidden="true">
                {tab.icon}
              </span>
              {showBadge && <Badge count={unreadTotal} variant="dot" />}
            </span>
            <span className="nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function App() {
  const user = getUser();
  const location = useLocation();
  const { unread, refresh, countFor, clearRoom } = useUnread();

  if (!user && location.pathname !== "/login") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const showTabs = Boolean(user) && location.pathname !== "/login" && !location.pathname.startsWith("/room/");

  return (
    <div className={showTabs ? "app-with-nav" : "min-h-dvh"}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home unreadTotal={unread.total} />} />
        <Route path="/chats" element={<Chats countFor={countFor} />} />
        <Route path="/room/:roomId" element={<Room onEnter={clearRoom} onLeave={refresh} />} />
        <Route path="/camera" element={<Camera />} />
        <Route path="/updates" element={<Updates />} />
        <Route path="/games" element={<Games />} />
        <Route path="/ai" element={<AiBuddy />} />
        <Route path="*" element={<Navigate to={user ? "/home" : "/login"} replace />} />
      </Routes>
      {showTabs && <TabBar unreadTotal={unread.total} />}
    </div>
  );
}
