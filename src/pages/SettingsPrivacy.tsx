import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Vambie from "../components/Vambie";
import { apiGet, apiSend } from "../lib/api";
import { useStorybookData } from "../hooks/useStorybookData";
import type { ExportRequest } from "../types";

export default function SettingsPrivacy() {
  const { id } = useParams();
  const { storybook, status } = useStorybookData(id);
  const [defaults, setDefaults] = useState({ defaultVisibility: "contributor_only", defaultStoryUse: true });
  const [saved, setSaved] = useState(false);

  const [include, setInclude] = useState({ recordings: true, transcripts: true, chapters: true });
  const [exports, setExports] = useState<ExportRequest[] | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (storybook) setDefaults({ defaultVisibility: storybook.defaultVisibility, defaultStoryUse: storybook.defaultStoryUse });
  }, [storybook]);

  const loadExports = () => {
    apiGet(`/api/storybooks/${id}/exports`).then(setExports).catch(() => setExports([]));
  };
  useEffect(loadExports, [id]);

  const saveDefaults = async () => {
    await apiSend(`/api/storybooks/${id}/settings`, "PUT", defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const prepareExport = async () => {
    setPreparing(true);
    try {
      await apiSend(`/api/storybooks/${id}/export`, "POST", {
        includeRecordings: include.recordings,
        includeTranscripts: include.transcripts,
        includeChapters: include.chapters,
      });
      loadExports();
    } finally {
      setPreparing(false);
    }
  };

  if (status === "loading" || !storybook) return <p className="status-line screen-pad">Loading…</p>;

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}/settings`} backLabel="Settings" />
      <div className="hero" style={{ paddingTop: 0 }}>
        <h1 className="display">Your memories. Your choices.</h1>
      </div>

      <div className="screen-pad">
        <div className="card">
          <h3>Defaults for new memories</h3>
          <label htmlFor="vis">Original recording visibility</label>
          <select
            id="vis"
            value={defaults.defaultVisibility}
            onChange={(e) => setDefaults((d) => ({ ...d, defaultVisibility: e.target.value }))}
          >
            <option value="contributor_only">Only me</option>
            <option value="household">Everyone in the household</option>
          </select>

          <div className="checkbox-row">
            <input
              type="checkbox"
              id="useInStories"
              checked={defaults.defaultStoryUse}
              onChange={(e) => setDefaults((d) => ({ ...d, defaultStoryUse: e.target.checked }))}
            />
            <label htmlFor="useInStories" style={{ margin: 0 }}>
              Use new memories in stories by default
            </label>
          </div>
          <p className="status-line">Your recording stays private. Generated stories can be shared with your family.</p>

          <button className="btn-primary chevron" onClick={saveDefaults}>
            {saved ? "Saved" : "Save defaults"}
          </button>
        </div>

        <div className="card">
          <h3>Export my memories</h3>
          <p className="status-line">Choose what to include in your download.</p>
          <div className="checkbox-row">
            <input type="checkbox" id="incRec" checked={include.recordings} onChange={(e) => setInclude((s) => ({ ...s, recordings: e.target.checked }))} />
            <label htmlFor="incRec" style={{ margin: 0 }}>My original recordings</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="incTr" checked={include.transcripts} onChange={(e) => setInclude((s) => ({ ...s, transcripts: e.target.checked }))} />
            <label htmlFor="incTr" style={{ margin: 0 }}>My transcripts</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="incCh" checked={include.chapters} onChange={(e) => setInclude((s) => ({ ...s, chapters: e.target.checked }))} />
            <label htmlFor="incCh" style={{ margin: 0 }}>Published chapters</label>
          </div>

          <button className="btn-primary chevron" onClick={prepareExport} disabled={preparing}>
            {preparing ? "Gathering your moments…" : "Prepare export"}
          </button>

          {exports && exports.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              {exports.map((e) => (
                <div key={e.id} className="link-row">
                  <div>
                    <strong>{storybook.title} · Export</strong>
                    <div className="status-line">{new Date(e.createdAt).toLocaleString()}</div>
                  </div>
                  {e.status === "ready" && e.filePath && (
                    <a className="btn-small btn-primary" href={e.filePath} download>
                      Download
                    </a>
                  )}
                  {e.status === "preparing" && <span className="pill warn">Preparing</span>}
                  {e.status === "failed" && <span className="pill warn">Failed</span>}
                  {e.status === "expired" && <span className="pill dark">Expired</span>}
                </div>
              ))}
            </div>
          )}
          {exports && exports.some((e) => e.status === "ready") && (
            <p className="status-line">Download links expire after 7 days. Downloading does not delete your memories.</p>
          )}
        </div>

        <div className="card">
          <h3>Your data</h3>
          <p className="status-line">
            Manage or delete individual memories from the storybook's memory list — each one has its own "Delete"
            option with a preview of what it affects.
          </p>
          <div className="banner warn" style={{ marginTop: "1rem" }}>
            <Vambie mood="worried" size={28} />
            Account deletion isn't wired up in this prototype yet — ask to have it built once this flow is
            validated.
          </div>
        </div>
      </div>
    </div>
  );
}
