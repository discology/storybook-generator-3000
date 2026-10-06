import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { Chev, Field, Masthead, Note, Select, Sheet } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

const COUNTRY_CODES = [
  { value: "+1", label: "+1" },
  { value: "+44", label: "+44" },
  { value: "+61", label: "+61" },
  { value: "+64", label: "+64" },
  { value: "+353", label: "+353" },
  { value: "+49", label: "+49" },
  { value: "+33", label: "+33" },
  { value: "+34", label: "+34" },
  { value: "+52", label: "+52" },
  { value: "+91", label: "+91" },
  { value: "+65", label: "+65" },
  { value: "+81", label: "+81" },
];
const RESEND_SECONDS = 30;

export default function SignIn() {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [country, setCountry] = useState("+1");
  const [number, setNumber] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refresh } = useAuth();

  const phone = number.trim().startsWith("+") ? number.trim() : `${country}${number.replace(/\D/g, "")}`;
  const saving = params.get("next") === "/try/save";

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!number.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "We couldn't send a code. Try again.");
        return;
      }
      setDevCode(data.devCode ?? null);
      setDigits(["", "", "", "", "", ""]);
      setStep("code");
      setResendIn(RESEND_SECONDS);
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } catch {
      setError("We couldn't reach Vambie. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "That code didn't match. Check it and try again.");
        setDigits(["", "", "", "", "", ""]);
        boxes.current[0]?.focus();
        return;
      }
      refresh();
      navigate(params.get("next") || "/", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      // Pasted or autofilled code
      const next = clean.slice(0, 6).split("");
      const filled = [...next, ...Array(6 - next.length).fill("")];
      setDigits(filled);
      boxes.current[Math.min(next.length, 5)]?.focus();
      if (next.length === 6) void verify(next.join(""));
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < 5) boxes.current[index + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) boxes.current[index - 1]?.focus();
  };

  if (step === "code") {
    return (
      <div className="page">
        <TopBar back={() => setStep("phone")} wordmark />
        <Masthead
          plate="tall"
          title={
            <>
              Check
              <br />
              your phone.
            </>
          }
          sub="Enter the 6-digit code sent to your phone."
          art="key"
          artMode="corner"
          style={{ minHeight: 300 }}
        />
        <Sheet grow>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (digits.every(Boolean)) void verify(digits.join(""));
            }}
          >
            <div className="otp" role="group" aria-label="6-digit code">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (boxes.current[i] = el)}
                  value={d}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${i + 1}`}
                  maxLength={i === 0 ? 6 : 1}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                />
              ))}
            </div>
            <p className="t-center" style={{ margin: "16px 0 0" }}>
              <button type="button" className="tlink" onClick={() => setStep("phone")}>
                Change phone number
              </button>
            </p>
            {devCode && (
              <Note kind="info" style={{ marginTop: 16 }}>
                Dev mode: no SMS provider is set up, so your code is <strong>{devCode}</strong>.
              </Note>
            )}
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn--lime btn--caps" type="submit" disabled={busy || !digits.every(Boolean)} style={{ marginTop: 20 }}>
              {busy ? "Checking…" : "Verify and continue"} <Chev />
            </button>
            <p className="t-center t-small t-muted" style={{ marginTop: 16 }}>
              {resendIn > 0 ? (
                `Resend code in 00:${String(resendIn).padStart(2, "0")}`
              ) : (
                <button type="button" className="tlink" onClick={() => void sendCode()} disabled={busy}>
                  Resend code
                </button>
              )}
            </p>
          </form>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="page">
      <TopBar wordmark />
      <Masthead
        plate="tall"
        title={
          saving ? (
            <>
              Save
              <br />
              your story.
            </>
          ) : (
            <>
              Your
              <br />
              family's
              <br />
              story
              <br />
              starts here.
            </>
          )
        }
        sub={
          saving ? (
            "Everything you've made stays, and it's yours to keep adding to."
          ) : (
            <>
              Same little moments.
              <br />A lifetime of stories.
            </>
          )
        }
        art="book"
        artMode="corner"
      />
      <Sheet grow>
        <form onSubmit={sendCode}>
          <h2 className="h-title" style={{ marginBottom: 16 }}>
            {saving ? "Verify your number" : "Sign in or create an account"}
          </h2>
          <Field label="Mobile number" htmlFor="phone" hint={saving ? "We'll text you a code to keep your story." : "We'll text you a sign-in code."}>
            <div className="phone-field">
              <Select value={country} onChange={setCountry} options={COUNTRY_CODES} ariaLabel="Country code" />
              <input
                id="phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Phone number"
                required
              />
            </div>
          </Field>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn--lime btn--caps" type="submit" disabled={busy || !number.trim()} style={{ marginTop: 20 }}>
            {busy ? "Sending…" : "Send code"} <Chev />
          </button>
          <p className="t-center t-xs t-muted" style={{ marginTop: 18 }}>
            By continuing, you agree to our Terms and Privacy Policy.
          </p>
        </form>
      </Sheet>
    </div>
  );
}
