import { Link } from "react-router-dom";
import TopBar from "./TopBar";
import { IconLock } from "./icons";

export default function AccessDenied() {
  return (
    <div>
      <TopBar wordmark />
      <div className="screen-pad" style={{ textAlign: "center", paddingTop: "2rem" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--purple)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            color: "white",
          }}
        >
          <IconLock size={28} />
        </div>
        <h1 className="display">This page is private.</h1>
        <div className="card" style={{ textAlign: "left" }}>
          <p className="status-line" style={{ fontSize: "0.9rem" }}>
            Your current account doesn't have access to this page. Try another account, or ask the person who
            shared the link to check your access.
          </p>
          <Link className="btn-primary chevron" to="/sign-in" style={{ textDecoration: "none", marginTop: "1rem" }}>
            Switch account
          </Link>
          <Link className="btn-secondary" to="/" style={{ textDecoration: "none", marginTop: "0.6rem" }}>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
