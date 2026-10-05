import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { fillTemplate, smsLength, templateVariables } from "../../lib/sms";
import type { MessageTemplate } from "../../types";

export default function AdminMessageEdit() {
  const { key } = useParams();
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiGet(`/api/admin/messages/${key}`).then((t: MessageTemplate) => {
      setTemplate(t);
      setBody(t.body);
      setEnabled(t.enabled);
    });
  }, [key]);

  if (!template) return <p>Loading…</p>;

  const dirty = body !== template.body || enabled !== template.enabled;
  const allowed = new Set(template.variables.map((v) => v.name));
  const unknown = templateVariables(body).filter((name) => !allowed.has(name));
  const preview = fillTemplate(body, Object.fromEntries(template.variables.map((v) => [v.name, v.sample])));
  const length = smsLength(preview);

  const edit = (next: string) => {
    setBody(next);
    setSaved(false);
    setError(null);
  };

  // Insert at the cursor so admins can click a variable instead of typing it.
  const insertVariable = (name: string) => {
    const el = textareaRef.current;
    const token = `<${name}>`;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    edit(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    try {
      const updated: MessageTemplate = await apiSend(`/api/admin/messages/${key}`, "PUT", { body, enabled });
      setTemplate(updated);
      setBody(updated.body);
      setEnabled(updated.enabled);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    }
  };

  return (
    <div>
      <div style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        <Link to="/admin/messages" style={{ color: "inherit" }}>
          Text Messages
        </Link>{" "}
        / {template.name}
      </div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <h1 style={{ margin: 0, color: "var(--ink)" }}>{template.name}</h1>
        <div className="row inline">
          {dirty && <span className="pill warn">Unsaved changes</span>}
          {saved && !dirty && <span className="pill good">Saved</span>}
          <button className="btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty || unknown.length > 0}>
            Save changes
          </button>
        </div>
      </div>
      <p style={{ color: "var(--ink-soft)" }}>{template.trigger}.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem", marginTop: "1rem" }}>
        <div className="card">
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setSaved(false);
              }}
              style={{ width: "auto" }}
            />
            Send this message
          </label>
          {!enabled && <p className="status-line">Turned off: nothing is texted when this would normally be sent.</p>}

          <label htmlFor="body">Message</label>
          <textarea id="body" ref={textareaRef} rows={5} value={body} onChange={(e) => edit(e.target.value)} />
          <p className="status-line">
            {length.units} / {length.single} characters · {length.segments} {length.segments === 1 ? "text" : "texts"}
            {!length.isGsm && " · contains emoji or special characters, so each text holds fewer characters"}
            {" "}(counted with sample values)
          </p>

          {unknown.length > 0 && (
            <p className="status-line" style={{ color: "#d94c4c" }}>
              Not available in this message: {unknown.map((n) => `<${n}>`).join(", ")}
            </p>
          )}
          {error && (
            <p className="status-line" style={{ color: "#d94c4c" }}>
              {error}
            </p>
          )}

          <label>Variables — click to insert</label>
          <table className="admin-table">
            <tbody>
              {template.variables.map((v) => (
                <tr key={v.name}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn-small btn-secondary" onClick={() => insertVariable(v.name)}>
                      &lt;{v.name}&gt;
                    </button>
                  </td>
                  <td>{v.description}</td>
                  <td style={{ color: "var(--ink-soft)" }}>e.g. {v.sample}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {body !== template.defaultBody && (
            <button type="button" className="btn-link" style={{ marginTop: "1rem" }} onClick={() => edit(template.defaultBody)}>
              Reset to default wording
            </button>
          )}
        </div>

        <div>
          <h3 style={{ color: "var(--ink)" }}>Phone preview</h3>
          <div style={{ background: "#0a0a0c", borderRadius: 16, padding: "1.5rem 1rem", minHeight: 200 }}>
            <div style={{ color: "#8e8e93", fontSize: "0.75rem", textAlign: "center", marginBottom: "0.75rem" }}>Text Message · Today</div>
            <div
              style={{
                background: "#2c2c2e",
                color: "white",
                borderRadius: 18,
                padding: "0.6rem 0.85rem",
                maxWidth: "85%",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: "0.92rem",
                lineHeight: 1.35,
                opacity: enabled ? 1 : 0.4,
              }}
            >
              {preview || " "}
            </div>
          </div>
          <p className="status-line">Shown with sample values.</p>
        </div>
      </div>
    </div>
  );
}
