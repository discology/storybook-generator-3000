import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../../lib/api";

// The landing page's "Stories from other families" (VSB-141): the sample
// family's chapters, each with a card and a public link.

interface Featured {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  color: string;
  enabled: boolean;
  chapterTitle: string;
  cover: string | null;
  url: string;
}

interface FeaturedData {
  sampleFamily: { id: string; label: string } | null;
  candidates: { id: string; label: string }[];
  chapters: { id: string; title: string; sequence: number; storybookTitle: string; featured: boolean; cover: string | null }[];
  featured: Featured[];
  colors: string[];
  publicList: string;
}

const SWATCHES: Record<string, string> = { yellow: "#F5D547", green: "#A3F25A", blue: "#5146F0", purple: "#B23AC6" };

const Thumb = ({ src }: { src: string | null }) =>
  src ? (
    <img src={`/${src}`} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, display: "block" }} />
  ) : (
    <span className="status-line">No picture</span>
  );

export default function AdminFeaturedStories() {
  const [data, setData] = useState<FeaturedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(() => apiGet("/api/admin/featured").then((d: FeaturedData) => setData(d)), []);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    }
  };

  if (!data) return <p>Loading…</p>;
  const toFeature = data.chapters.filter((c) => !c.featured);
  const move = (i: number, by: number) => {
    const ids = data.featured.map((f) => f.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    void run(() => apiSend("/api/admin/featured-order", "PUT", { ids }));
  };

  return (
    <div>
      <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
        Featured stories
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>
        The team's sample stories, shown on the landing page under "Stories from other families". Anyone can read a featured story at its link, without signing in.
      </p>
      {error && (
        <p className="status-line" style={{ color: "#d94c4c" }}>
          {error}
        </p>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sample family</h3>
        <p className="status-line">
          Only this family's chapters can be featured, and only the ones you feature here are public. It has to be a family owned by someone on the Vambie team. Check with everyone in it first: their stories, and their Vambie looks in the pictures, become public.
        </p>
        {data.sampleFamily ? (
          <p>
            <strong>{data.sampleFamily.label}</strong>
          </p>
        ) : data.candidates.length ? null : (
          <p className="status-line">No family qualifies yet. Start a storybook for the samples from your own account (Your storybooks, then "Start a storybook for another child"), then choose it here.</p>
        )}
        {data.candidates.length > 0 && (
          <div className="row inline">
            <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ width: "auto" }}>
              <option value="">{data.sampleFamily ? "Choose another family…" : "Choose the sample family…"}</option>
              {data.candidates
                .filter((c) => c.id !== data.sampleFamily?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
            <button
              className="btn-secondary"
              style={{ width: "auto" }}
              disabled={!pick}
              onClick={() => {
                if (data.featured.length && !window.confirm("Choosing another sample family removes the stories featured now. Continue?")) return;
                void run(() => apiSend("/api/admin/featured/sample-family", "PUT", { householdId: pick })).then(() => setPick(""));
              }}
            >
              Use as the sample family
            </button>
          </div>
        )}
      </div>

      <h3>On the landing page</h3>
      {data.featured.length === 0 ? (
        <p className="status-line">Nothing featured yet. Feature a chapter below.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Cover</th>
              <th>Card</th>
              <th>Color</th>
              <th>Shown</th>
              <th>Order</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.featured.map((f, i) => (
              <FeaturedRow
                key={`${f.id}-${f.title}-${f.blurb}-${f.color}-${f.enabled}`}
                story={f}
                colors={data.colors}
                first={i === 0}
                last={i === data.featured.length - 1}
                onMove={(by) => move(i, by)}
                onSave={(card) => run(() => apiSend(`/api/admin/featured/${f.id}`, "PUT", card))}
                onRewrite={() => run(() => apiSend(`/api/admin/featured/${f.id}/card-line`, "POST"))}
                onRemove={() => {
                  if (window.confirm(`Remove "${f.title}" from the landing page? Its link stops working.`)) void run(() => apiSend(`/api/admin/featured/${f.id}`, "DELETE"));
                }}
              />
            ))}
          </tbody>
        </table>
      )}
      <p className="status-line">
        The landing page reads this list: <code>{data.publicList}</code>
      </p>

      {data.sampleFamily && (
        <>
          <h3>The sample family's chapters</h3>
          {toFeature.length === 0 ? (
            <p className="status-line">{data.chapters.length ? "Every chapter is featured." : "No chapters yet. Record sample memories in the sample family's storybook to make some."}</p>
          ) : (
            <table className="admin-table">
              <tbody>
                {toFeature.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Thumb src={c.cover} />
                    </td>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="status-line">
                        {c.storybookTitle} · Chapter {c.sequence}
                      </div>
                    </td>
                    <td>
                      <button className="btn-small btn-primary" onClick={() => void run(() => apiSend("/api/admin/featured", "POST", { chapterId: c.id }))}>
                        Feature
                      </button>
                    </td>
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

function FeaturedRow({
  story,
  onRewrite,
  colors,
  first,
  last,
  onMove,
  onSave,
  onRemove,
}: {
  story: Featured;
  colors: string[];
  first: boolean;
  last: boolean;
  onMove: (by: number) => void;
  onSave: (card: Partial<Featured>) => void;
  onRewrite: () => Promise<void>;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(story.title);
  const [blurb, setBlurb] = useState(story.blurb);
  const changed = title !== story.title || blurb !== story.blurb;
  const [rewriting, setRewriting] = useState(false);

  return (
    <tr>
      <td>
        <Thumb src={story.cover} />
      </td>
      <td style={{ minWidth: 280 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} aria-label="Card title" />
        <textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={200} rows={2} placeholder="Baby Vambie learns…" aria-label="Card line" style={{ marginTop: 6 }} />
        {/* Written from the story when it's featured (VSB-151); another on request. */}
        <button
          type="button"
          className="btn-small btn-secondary"
          style={{ marginTop: 4 }}
          disabled={rewriting}
          onClick={() => {
            setRewriting(true);
            void onRewrite().finally(() => setRewriting(false));
          }}
        >
          {rewriting ? "Writing…" : "Write another"}
        </button>
        <div className="status-line">
          From "{story.chapterTitle}" ·{" "}
          <a href={story.url} target="_blank" rel="noreferrer">
            {story.url.replace(/^https?:\/\//, "")}
          </a>
        </div>
        {changed && (
          <div className="row inline" style={{ marginTop: 6, gap: 10 }}>
            <button className="btn-small btn-primary" disabled={!title.trim()} onClick={() => onSave({ title, blurb })}>
              Save card
            </button>
            {title !== story.title && <span className="status-line">The link changes to match the new title.</span>}
          </div>
        )}
      </td>
      <td>
        <div className="row inline" style={{ gap: 6, marginTop: 0 }}>
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={story.color === c}
              title={c}
              onClick={() => onSave({ color: c })}
              style={{ width: 26, height: 26, borderRadius: 13, background: SWATCHES[c] ?? c, border: story.color === c ? "3px solid var(--ink)" : "1px solid #ccc", padding: 0, cursor: "pointer" }}
            />
          ))}
        </div>
      </td>
      <td>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0 }}>
          <input type="checkbox" checked={story.enabled} onChange={(e) => onSave({ enabled: e.target.checked })} style={{ width: "auto" }} />
          {story.enabled ? "Shown" : "Hidden"}
        </label>
      </td>
      <td>
        <div className="row inline" style={{ gap: 4, marginTop: 0 }}>
          <button className="btn-small btn-secondary" disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
            ↑
          </button>
          <button className="btn-small btn-secondary" disabled={last} onClick={() => onMove(1)} aria-label="Move down">
            ↓
          </button>
        </div>
      </td>
      <td>
        <button className="btn-small btn-secondary" onClick={onRemove}>
          Remove
        </button>
      </td>
    </tr>
  );
}
