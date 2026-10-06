import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { templateVariables } from "../../lib/sms";
import type { AiInstruction } from "../../types";

interface TestResult {
  prompt: string;
  output: any;
  model: string;
  seconds: number;
}

export default function AdminAiInstructionEdit() {
  const { key } = useParams();
  const [step, setStep] = useState<AiInstruction | null>(null);
  const [body, setBody] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiGet(`/api/admin/ai-instructions/${key}`).then((s: AiInstruction) => {
      setStep(s);
      setBody(s.body);
      setModel(s.model);
    });
  }, [key]);

  if (!step) return <p>Loading…</p>;

  const dirty = body !== step.body || model !== step.model;
  const allowed = new Set([...step.variables, ...step.characterVariables].map((v) => v.name));
  const unknown = templateVariables(body).filter((name) => !allowed.has(name));

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
      const updated: AiInstruction = await apiSend(`/api/admin/ai-instructions/${key}`, "PUT", { body, model });
      setStep(updated);
      setBody(updated.body);
      setModel(updated.model);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    setTestError(null);
    try {
      setTest(await apiSend(`/api/admin/ai-instructions/${key}/test`, "POST", { body, model }));
    } catch (err) {
      setTestError(err instanceof ApiError ? err.message : "The test failed. Try again.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <div style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        <Link to="/admin/ai" style={{ color: "inherit" }}>
          AI Instructions
        </Link>{" "}
        / {step.name}
      </div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <h1 style={{ margin: 0, color: "var(--ink)" }}>{step.name}</h1>
        <div className="row inline">
          {dirty && <span className="pill warn">Unsaved changes</span>}
          {saved && !dirty && <span className="pill good">Saved</span>}
          <button className="btn-secondary" style={{ width: "auto" }} onClick={runTest} disabled={testing || unknown.length > 0}>
            {testing ? "Running…" : "Test run"}
          </button>
          <button className="btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty || unknown.length > 0}>
            Save changes
          </button>
        </div>
      </div>
      <p style={{ color: "var(--ink-soft)" }}>{step.trigger}.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "1.5rem", marginTop: "1rem", alignItems: "start" }}>
        <div className="card">
          <label htmlFor="model">Model</label>
          <select
            id="model"
            value={model ?? ""}
            onChange={(e) => {
              setModel(e.target.value || null);
              setSaved(false);
            }}
          >
            <option value="">Default ({step.defaultModel})</option>
            {step.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <label htmlFor="body">Instructions</label>
          <textarea id="body" ref={textareaRef} rows={18} value={body} onChange={(e) => edit(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }} />

          {unknown.length > 0 && (
            <p className="status-line" style={{ color: "#d94c4c" }}>
              Not available in this step: {unknown.map((n) => `<${n}>`).join(", ")}
            </p>
          )}
          {error && (
            <p className="status-line" style={{ color: "#d94c4c" }}>
              {error}
            </p>
          )}

          <label>Reply format (added automatically, not editable)</label>
          <p className="status-line" style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}>
            {step.outputFormat}
          </p>
          <p className="status-line">The app reads these fields from the AI's reply, so they stay fixed. Change what goes in them with the instructions above.</p>

          <label>Variables — click to insert</label>
          <table className="admin-table">
            <tbody>
              {step.variables.map((v) => (
                <tr key={v.name}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn-small btn-secondary" onClick={() => insertVariable(v.name)}>
                      &lt;{v.name}&gt;
                    </button>
                  </td>
                  <td>{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {step.characterVariables.length > 0 && (
            <>
              <label>Characters — click to insert</label>
              <p className="status-line">
                Each turns into that character's card from the Characters page (look, never rules, personality, role). Chapters use the version of
                each character they were made with.
              </p>
              <table className="admin-table">
                <tbody>
                  {step.characterVariables.map((v) => (
                    <tr key={v.name}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="btn-small btn-secondary" onClick={() => insertVariable(v.name)}>
                          &lt;{v.name}&gt;
                        </button>
                      </td>
                      <td>{v.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {body !== step.defaultBody && (
            <button type="button" className="btn-link" style={{ marginTop: "1rem" }} onClick={() => edit(step.defaultBody)}>
              Reset to default instructions
            </button>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, color: "var(--ink)" }}>Test run</h3>
          <p className="status-line">
            Sends these instructions, saved or not, to the AI using sample values, so you can see the reply before saving. Each run is a real, billed AI call.
          </p>
          {testing && <p className="status-line">Waiting for the AI… this can take 10–20 seconds.</p>}
          {testError && (
            <p className="status-line" style={{ color: "#d94c4c" }}>
              {testError}
            </p>
          )}
          {test && (
            <>
              <p className="status-line">
                {test.model} · {test.seconds}s
              </p>
              <TestOutput stepKey={step.key} output={test.output} />
              <details style={{ marginTop: "1rem" }}>
                <summary className="status-line" style={{ cursor: "pointer" }}>
                  Show the full prompt that was sent
                </summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", background: "var(--paper, #f6f0e4)", padding: "0.75rem", borderRadius: 8 }}>{test.prompt}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TestOutput({ stepKey, output }: { stepKey: string; output: any }) {
  if (stepKey === "chapter" && typeof output?.content === "string") {
    return (
      <div>
        <h3 style={{ margin: "0.5rem 0" }}>{output.title}</h3>
        {output.content.split(/\n\s*\n/).map((p: string, i: number) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  }
  if (stepKey === "guardian" && Array.isArray(output?.findings)) {
    return (
      <div>
        {output.findings.map((f: any) => (
          <p key={f.category}>
            <span className={f.status === "ok" ? "pill good" : "pill warn"}>{f.category}</span> {f.note}
          </p>
        ))}
      </div>
    );
  }
  if (stepKey === "interpret" && output && typeof output === "object") {
    return (
      <div>
        {(["events", "emotions", "themes"] as const).map((field) => (
          <p key={field}>
            <strong>{field}:</strong> {output[field]}
          </p>
        ))}
      </div>
    );
  }
  return <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>{JSON.stringify(output, null, 2)}</pre>;
}
