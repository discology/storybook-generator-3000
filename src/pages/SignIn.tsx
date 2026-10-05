import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Vambie from "../components/Vambie";
import { useAuth } from "../auth/AuthContext";

export default function SignIn() {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refresh } = useAuth();

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "We couldn't send a code. Try again.");
        return;
      }
      setDevCode(data.devCode ?? null);
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "That code didn't match. Check it and try again.");
        return;
      }
      refresh();
      navigate(params.get("next") || "/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <TopBar wordmark />
      <div className="hero">
        <div className="hero-mascot-stage">
          <Vambie mood={step === "phone" ? "happy" : "curious"} size={90} />
          {step === "phone" ? (
            <>
              <h1 className="display" style={{ fontSize: "1.9rem" }}>
                Your family's
                <br />
                story starts here.
              </h1>
              <p className="subtitle" style={{ marginBottom: 0 }}>
                Same little moments. A lifetime of stories.
              </p>
            </>
          ) : (
            <>
              <h1 className="display" style={{ fontSize: "1.9rem" }}>
                Check your phone.
              </h1>
              <p className="subtitle" style={{ marginBottom: 0 }}>
                Enter the 6-digit code sent to your phone.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="screen-pad">
        {step === "phone" ? (
          <form className="card" onSubmit={sendCode}>
            <label htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
            />
            <p className="status-line">We'll text you a sign-in code.</p>
            {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}
            <button className="btn-primary chevron" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send code"}
            </button>
            <p className="center-note">By continuing, you agree to our Terms and Privacy Policy.</p>
          </form>
        ) : (
          <form className="card" onSubmit={verify}>
            <label htmlFor="code">6-digit code</label>
            <input
              id="code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="••••••"
              maxLength={6}
            />
            {devCode && (
              <div className="banner info">
                <strong style={{ fontWeight: 800 }}>Dev mode:</strong>&nbsp;no SMS provider configured — your code
                is <strong>{devCode}</strong>.
              </div>
            )}
            {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}
            <button className="btn-primary chevron" type="submit" disabled={busy}>
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
            <button type="button" className="btn-link" style={{ marginTop: "0.75rem" }} onClick={() => setStep("phone")}>
              Change phone number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
