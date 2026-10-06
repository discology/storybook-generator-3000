import { Link, useNavigate } from "react-router-dom";
import TopBar from "./TopBar";
import { IconLock } from "./icons";
import { Chev, Sheet } from "./ui";
import { useAuth } from "../auth/AuthContext";

export default function AccessDenied() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const switchAccount = async () => {
    await logout();
    navigate(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  };

  return (
    <div className="page">
      <TopBar back="/" wordmark menu="/" />
      <header className="masthead masthead--center">
        <span className="icon-circle icon-circle--purple icon-circle--sm" style={{ width: 84, height: 84, marginBottom: 16 }}>
          <IconLock size={40} filled />
        </span>
        <h1 className="h-display">
          This page
          <br />
          is private.
        </h1>
      </header>
      <Sheet grow>
        <h2 className="h-title h-title--lg">Your current account doesn't have access to this page.</h2>
        <p className="t-body t-muted" style={{ marginTop: 12 }}>
          Try another account, or ask the person who shared the link to check your access.
        </p>
        <div className="stack" style={{ marginTop: 24 }}>
          <button className="btn btn--lime" onClick={switchAccount}>
            Switch account <Chev />
          </button>
          <Link className="btn btn--outline" to="/">
            Back to home
          </Link>
        </div>
      </Sheet>
    </div>
  );
}
