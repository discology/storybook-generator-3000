import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { IconChat, IconHome, IconLock, IconPeople, IconPlayCircle, IconSettings, IconSmile, IconWarning } from "../../components/icons";
import { Mascot } from "../../components/ui";

const SETTINGS_PATHS = ["/admin/settings", "/admin/messages", "/admin/ai", "/admin/page-rules"];

export default function AdminLayout() {
  const { user, adminOpen, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate("/sign-in?next=/admin");
  }, [loading, user, navigate]);

  if (loading || !user) return null;
  if (!user.isAdmin) {
    return (
      <div className="shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="sheet" style={{ textAlign: "center", maxWidth: 420 }}>
          <span className="icon-circle icon-circle--purple icon-circle--sm" style={{ margin: "0 auto" }}>
            <IconLock size={30} filled />
          </span>
          <h1 className="h-title" style={{ marginTop: 14 }}>The admin panel is for the Vambie team.</h1>
          <p className="t-body t-muted" style={{ marginTop: 8 }}>Your account doesn't have admin access.</p>
          <button className="btn btn--lime" style={{ marginTop: 18 }} onClick={() => navigate("/")}>
            Back to Vambie
          </button>
        </div>
      </div>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) => "admin-sidebar-link" + (isActive ? " active" : "");
  const settingsActive = SETTINGS_PATHS.some((p) => pathname.startsWith(p));

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="wordmark">Vambie</span>
          <span className="admin-brand__sub">Admin</span>
        </div>
        <NavLink to="/admin" end className={linkClass}>
          <IconHome size={24} /> Overview
        </NavLink>
        <NavLink to="/admin/prompts" className={linkClass}>
          <IconChat size={24} /> Prompt Library
        </NavLink>
        <NavLink to="/admin/review" className={linkClass}>
          <IconPlayCircle size={24} /> Story Review
        </NavLink>
        <NavLink to="/admin/families" className={linkClass}>
          <IconPeople size={24} /> Families
        </NavLink>
        <NavLink to="/admin/characters" className={linkClass}>
          <IconSmile size={24} /> Characters
        </NavLink>
        <NavLink to="/admin/settings" className={() => "admin-sidebar-link" + (settingsActive ? " active" : "")}>
          <IconSettings size={24} /> Settings
        </NavLink>
        {adminOpen && (
          <div className="admin-warning" role="note">
            <IconWarning size={18} />
            <span>Anyone signed in can open this panel. Add ADMIN_PHONES to .env to limit it.</span>
          </div>
        )}
        <div className="admin-user">
          <span className="avatar avatar--sm avatar--vambie">
            <Mascot name="peek" style={{ width: "120%", marginTop: "18%" }} />
          </span>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 600 }}>{user.name || user.phone}</div>
            <div style={{ fontSize: 13, color: "var(--on-dark-2)" }}>Admin</div>
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
