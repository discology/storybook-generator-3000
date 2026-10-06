import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import Vambie from "../../components/Vambie";

export default function AdminLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/sign-in?next=/admin");
  }, [loading, user, navigate]);

  const linkClass = ({ isActive }: { isActive: boolean }) => "admin-sidebar-link" + (isActive ? " active" : "");

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div style={{ fontFamily: "Anton, sans-serif", letterSpacing: "0.04em", fontSize: "1.1rem", padding: "0.5rem 0.75rem 1.5rem" }}>
          VAMBIE <span style={{ color: "var(--green)" }}>ADMIN</span>
        </div>
        <NavLink to="/admin/review" className={linkClass}>
          Story Review
        </NavLink>
        <NavLink to="/admin/prompts" className={linkClass}>
          Prompt Library
        </NavLink>
        <NavLink to="/admin/messages" className={linkClass}>
          Text Messages
        </NavLink>
        <NavLink to="/admin/ai" className={linkClass}>
          AI Instructions
        </NavLink>
        <NavLink to="/admin/page-rules" className={linkClass}>
          Page Rules
        </NavLink>
        <NavLink to="/admin/characters" className={linkClass}>
          Characters
        </NavLink>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.75rem" }}>
          <Vambie size={28} />
          <div style={{ fontSize: "0.82rem" }}>
            {user?.name || user?.phone || "Admin"}
            <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>Admin</div>
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
