import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import type { AiInstruction } from "../../types";

export default function AdminAiInstructions() {
  const [steps, setSteps] = useState<AiInstruction[] | null>(null);

  useEffect(() => {
    apiGet("/api/admin/ai-instructions").then(setSteps);
  }, []);

  if (!steps) return <p>Loading…</p>;

  return (
    <div>
      <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
        AI Instructions
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>What we ask the AI to do at each step.</p>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Step</th>
            <th>When it runs</th>
            <th>Model</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.key}>
              <td>
                <strong>{s.name}</strong>
                {!s.isDefault && <div className="status-line">Customized</div>}
              </td>
              <td>{s.trigger}</td>
              <td>{s.model ?? `${s.defaultModel} (default)`}</td>
              <td>
                <Link className="btn-small btn-secondary" style={{ textDecoration: "none" }} to={`/admin/ai/${s.key}`}>
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
