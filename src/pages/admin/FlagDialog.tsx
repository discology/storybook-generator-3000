import { useEffect, useState } from "react";
import { apiSend, ApiError } from "../../lib/api";
import { IconClose } from "../../components/icons";
import { PICTURE_CATEGORIES, WORDS_CATEGORIES } from "../../lib/flags";

// Flag a page's picture, words or both (VSB-95), from Story Review. The server
// saves the prompt, model, page plan and words with it.

type Target = "picture" | "words" | "both";

interface FlagPage {
  id: string;
  pageNumber: number;
  text: string;
  image: string | null;
}

export default function FlagDialog({ page, onClose, onSaved }: { page: FlagPage; onClose: () => void; onSaved: () => void }) {
  const [target, setTarget] = useState<Target>(page.image ? "picture" : "words");
  const [categories, setCategories] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [shouldBe, setShouldBe] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const groups = [
    ...(target !== "words" ? [["The picture", PICTURE_CATEGORIES] as const] : []),
    ...(target !== "picture" ? [["The words", WORDS_CATEGORIES] as const] : []),
  ];
  const offered = new Set(groups.flatMap(([, cats]) => Object.keys(cats)));
  const chosen = categories.filter((c) => offered.has(c));
  const toggle = (key: string) => setCategories((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/admin/pages/${page.id}/flags`, "POST", { target, categories: chosen, note, shouldBe });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the flag.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="backdrop" onClick={() => !busy && onClose()} />
      <div className="adm-modal adm-modal--auto" role="dialog" aria-modal="true" aria-label={`Flag page ${page.pageNumber}`}>
        <div className="adm-modal__head">
          <h2 className="h-title" style={{ fontSize: 26, margin: 0 }}>
            Flag page {page.pageNumber}
          </h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <IconClose size={22} />
          </button>
        </div>
        <div className="adm-modal__body">
          <section className="adm-modal__main">
            {page.image && <img src={`/${page.image}`} alt="" style={{ width: "100%", borderRadius: 12, display: "block" }} />}
            <p className="t-body" style={{ margin: "12px 0 0" }}>
              {page.text || <em className="t-muted">No words on this page.</em>}
            </p>
          </section>
          <aside className="adm-modal__side" style={{ gap: 12, overflowY: "auto" }}>
            <div className="adm-tabs" role="radiogroup" aria-label="What's wrong" style={{ margin: 0 }}>
              {(["picture", "words", "both"] as Target[]).map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={target === t}
                  className={`adm-tab ${target === t ? "adm-tab--on" : ""}`}
                  style={{ padding: "0 14px", minHeight: 38, fontSize: 15 }}
                  disabled={t !== "words" && !page.image}
                  onClick={() => setTarget(t)}
                >
                  {t === "picture" ? "Picture" : t === "words" ? "Words" : "Both"}
                </button>
              ))}
            </div>
            {groups.map(([label, cats]) => (
              <div key={label}>
                <span className="field__label">{label}</span>
                <div className="flag-chips">
                  {Object.entries(cats).map(([key, name]) => (
                    <button key={key} type="button" className={`flag-chip ${chosen.includes(key) ? "flag-chip--on" : ""}`} aria-pressed={chosen.includes(key)} onClick={() => toggle(key)}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <label className="field__label" htmlFor="flag-note">
              What's wrong
            </label>
            <textarea id="flag-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Planned as a close-up of her hands, but it's a medium shot of everyone." />
            <label className="field__label" htmlFor="flag-should">
              What it should be (optional)
            </label>
            <textarea id="flag-should" className="input" rows={2} value={shouldBe} onChange={(e) => setShouldBe(e.target.value)} placeholder="e.g. Tight on Grandma's hands pressing the seed in." />
            <p className="t-xs t-muted" style={{ margin: 0 }}>
              The picture's prompt, the page plan and the words are saved with the flag.
            </p>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn--lime btn--caps" disabled={busy || !chosen.length || !note.trim()} onClick={() => void save()}>
              {busy ? "Saving…" : "Save flag"}
            </button>
          </aside>
        </div>
      </div>
    </>
  );
}
