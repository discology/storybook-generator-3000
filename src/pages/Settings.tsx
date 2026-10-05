import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { useAuth } from "../auth/AuthContext";

export default function Settings() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}`} backLabel="Back" />
      <div className="hero" style={{ paddingTop: 0 }}>
        <h1 className="display">Make it work for you.</h1>
      </div>
      <div className="screen-pad">
        <div className="card" style={{ padding: "1rem" }}>
          <strong>{user?.name || user?.phone || "Signed in"}</strong>
          <div className="status-line">Parent · this storybook</div>
        </div>

        <div className="card">
          <Link className="link-row" to={`/storybooks/${id}/settings/story-preferences`} style={{ textDecoration: "none" }}>
            Story preferences ›
          </Link>
          <Link className="link-row" to={`/storybooks/${id}/settings/reminders`} style={{ textDecoration: "none" }}>
            Reminders ›
          </Link>
          <Link className="link-row" to={`/storybooks/${id}/family`} style={{ textDecoration: "none" }}>
            Family &amp; access ›
          </Link>
          <Link className="link-row" to={`/storybooks/${id}/settings/privacy`} style={{ textDecoration: "none" }}>
            Privacy &amp; data ›
          </Link>
        </div>

        <button className="btn-secondary" onClick={doLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
