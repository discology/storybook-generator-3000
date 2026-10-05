import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { apiGet, apiSend } from "../lib/api";
import type { Contributor } from "../types";

export default function ShareChapter() {
  const { id, chapterId } = useParams();
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [restricted, setRestricted] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  const load = () => {
    apiGet(`/api/chapters/${chapterId}/access`).then((data) => {
      setContributors(data.contributors);
      setAllowed(data.allowedContributorIds);
      setRestricted(data.restricted);
    });
  };
  useEffect(load, [chapterId]);

  const toggle = (cid: string) => {
    setAllowed((prev) => (prev.includes(cid) ? prev.filter((c) => c !== cid) : [...prev, cid]));
  };

  const saveAccess = async () => {
    await apiSend(`/api/chapters/${chapterId}/access`, "PUT", { contributorIds: restricted ? allowed : [] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}`} backLabel="Back" />
      <div className="hero" style={{ paddingTop: 0 }}>
        <h1 className="display">Choose who can read.</h1>
      </div>
      <div className="screen-pad">
        <div className="card">
          <label>Who can read this chapter?</label>
          <div className="row inline">
            <button className={!restricted ? "btn-primary" : "btn-secondary"} style={{ width: "auto" }} onClick={() => setRestricted(false)}>
              Everyone in the household
            </button>
            <button className={restricted ? "btn-primary" : "btn-secondary"} style={{ width: "auto" }} onClick={() => setRestricted(true)}>
              Selected family members
            </button>
          </div>

          {restricted && (
            <div style={{ marginTop: "1rem" }}>
              {contributors.map((c) => (
                <div key={c.id} className="checkbox-row">
                  <input type="checkbox" id={`access-${c.id}`} checked={allowed.includes(c.id)} onChange={() => toggle(c.id)} />
                  <label htmlFor={`access-${c.id}`} style={{ margin: 0 }}>
                    {c.name} <span className="status-line">({c.relationship || "Contributor"})</span>
                  </label>
                </div>
              ))}
              <p className="status-line">Only selected members can open this chapter.</p>
            </div>
          )}

          <p className="status-line">Original recordings and transcripts stay private either way.</p>
          <button className="btn-primary chevron" onClick={saveAccess}>
            {saved ? "Saved" : "Save access"}
          </button>
        </div>

        <div className="card">
          <h3>Send a little story</h3>
          <label htmlFor="msg">Add a message (optional)</label>
          <textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="A little story to read together." />
          <button className="btn-primary chevron" disabled>
            Send chapter link
          </button>
          <p className="status-line">
            Dev mode: no SMS/email provider connected yet — recipients with access can already open this chapter
            from their own Memories tab.
          </p>
        </div>
      </div>
    </div>
  );
}
