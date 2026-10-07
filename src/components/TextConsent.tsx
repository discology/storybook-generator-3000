import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { SMS_CONSENT } from "../lib/legal";

// Shown wherever a phone number is entered (VSB-91): what texts follow, how to
// stop them, and the Terms and Privacy Policy agreed to by continuing.
export default function TextConsent({ style }: { style?: CSSProperties }) {
  return (
    <p className="t-xs t-muted text-consent" style={style}>
      {SMS_CONSENT} By continuing, you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
    </p>
  );
}
