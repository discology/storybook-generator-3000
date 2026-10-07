import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { fillTemplate } from "../../lib/sms";
import type { MessageTemplate } from "../../types";

interface TextLogRow {
  id: string;
  event: string;
  recipient: string | null;
  toMasked: string;
  body: string | null;
  status: string;
  skipReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface TextLog {
  mode: "off" | "test" | "live";
  testRecipients: number;
  texts: TextLogRow[];
}

// What each texting mode means for the team (server/texts.ts).
const MODES: Record<TextLog["mode"], { pill: string; label: string; note: string }> = {
  off: { pill: "pill dark", label: "Off", note: "No Twilio messaging service is set up here. The app shows messages for people to send themselves." },
  test: {
    pill: "pill warn",
    label: "Test mode",
    note: "Texts only go to the team's test phones; everyone else is logged as skipped. Switch to live once the Vambie Storybook campaign is approved.",
  },
  live: { pill: "pill good", label: "Live", note: "Texts go to everyone who verified their number and hasn't replied STOP." },
};

const STATUS_PILL: Record<string, string> = { delivered: "pill good", sent: "pill good", queued: "pill", accepted: "pill", skipped: "pill dark", failed: "pill bad", undelivered: "pill bad" };

export default function AdminMessages() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [log, setLog] = useState<TextLog | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ key: string; ok: boolean; text: string } | null>(null);

  const loadLog = () => apiGet("/api/admin/texts").then(setLog).catch(() => undefined);
  useEffect(() => {
    apiGet("/api/admin/messages").then(setTemplates);
    void loadLog();
  }, []);

  const sendTest = async (key: string) => {
    setTesting(key);
    setNotice(null);
    try {
      await apiSend(`/api/admin/messages/${key}/test`, "POST");
      setNotice({ key, ok: true, text: "Sent to your phone." });
    } catch (e) {
      setNotice({ key, ok: false, text: e instanceof ApiError ? e.message : "It didn't send." });
    } finally {
      setTesting(null);
      void loadLog();
    }
  };

  if (!templates) return <p>Loading…</p>;
  const mode = log ? MODES[log.mode] : null;

  return (
    <div>
      <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
        Text Messages
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>The words families see on their phones.</p>
      {mode && (
        <p className="status-line">
          <span className={mode.pill}>{mode.label}</span> {mode.note}
        </p>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Message</th>
            <th>When it's sent</th>
            <th>Preview</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.key}>
              <td>
                <strong>{t.name}</strong>
                {!t.isDefault && <div className="status-line">Customized</div>}
              </td>
              <td>{t.trigger}</td>
              <td style={{ maxWidth: 320, color: "var(--ink-soft)" }}>
                Vambie Storybook: {fillTemplate(t.body, Object.fromEntries(t.variables.map((v) => [v.name, v.sample])))}
              </td>
              <td>
                <span className={t.enabled ? "pill good" : "pill dark"}>{t.enabled ? "on" : "off"}</span>
              </td>
              <td>
                <div className="row inline" style={{ flexWrap: "wrap", gap: 6, marginTop: 0 }}>
                  <Link className="btn-small btn-secondary" style={{ textDecoration: "none" }} to={`/admin/messages/${t.key}`}>
                    Edit
                  </Link>
                  {log && log.mode !== "off" && (
                    <button className="btn-small btn-secondary" disabled={testing !== null} onClick={() => void sendTest(t.key)}>
                      {testing === t.key ? "Sending…" : "Text me a test"}
                    </button>
                  )}
                </div>
                {notice?.key === t.key && (
                  <div className="status-line" style={{ color: notice.ok ? "var(--green, #2f8f3f)" : "#d94c4c" }}>
                    {notice.text}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {log && log.mode !== "off" && (
        <>
          <h2 style={{ marginTop: "2rem" }}>Recent texts</h2>
          {log.texts.length === 0 ? (
            <p className="status-line">No texts yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Message</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Words</th>
                </tr>
              </thead>
              <tbody>
                {log.texts.map((x) => (
                  <tr key={x.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(x.createdAt).toLocaleString()}</td>
                    <td>{x.event.replace("test:", "Test: ").replace(/_/g, " ")}</td>
                    <td>
                      {x.recipient ?? "Someone"} {x.toMasked}
                    </td>
                    <td>
                      <span className={STATUS_PILL[x.status] ?? "pill"}>{x.status}</span>
                      {x.skipReason && <div className="status-line">{x.skipReason === "test_mode" ? "not a test phone" : "replied STOP"}</div>}
                      {x.errorCode && (
                        <div className="status-line">
                          Error {x.errorCode}
                          {x.errorMessage ? `: ${x.errorMessage}` : ""}
                        </div>
                      )}
                    </td>
                    <td style={{ maxWidth: 320, color: "var(--ink-soft)" }}>{x.body ?? "(cleared after 30 days)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
