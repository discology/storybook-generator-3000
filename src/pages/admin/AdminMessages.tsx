import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { fillTemplate } from "../../lib/sms";
import type { MessageTemplate } from "../../types";

export default function AdminMessages() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);

  useEffect(() => {
    apiGet("/api/admin/messages").then(setTemplates);
  }, []);

  if (!templates) return <p>Loading…</p>;

  return (
    <div>
      <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
        Text Messages
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>The words families see on their phones.</p>

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
                {fillTemplate(t.body, Object.fromEntries(t.variables.map((v) => [v.name, v.sample])))}
              </td>
              <td>
                <span className={t.enabled ? "pill good" : "pill dark"}>{t.enabled ? "on" : "off"}</span>
              </td>
              <td>
                <Link className="btn-small btn-secondary" style={{ textDecoration: "none" }} to={`/admin/messages/${t.key}`}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
