import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { IconClose, IconSparkle, IconSpinner } from "../../components/icons";
import { Field, Mascot } from "../../components/ui";
import type { Prompt } from "../../types";
import type { MascotName } from "../../components/ui";

// Picks a prompt card's artwork: draw new pictures from the question, or reuse
// Baby Vambie's card poses or any picture made for a card (server/promptArt.ts).

export type ArtworkTab = "generate" | "poses" | "made";

interface LibraryPicture {
  path: string;
  label: string;
  source: "pose" | "generated" | "upload";
  createdAt?: string;
}

interface Library {
  poses: LibraryPicture[];
  made: LibraryPicture[];
  perClick: number;
}

const TABS: { key: ArtworkTab; label: string }[] = [
  { key: "generate", label: "Generate from the question" },
  { key: "poses", label: "Card poses" },
  { key: "made", label: "Made for cards" },
];

// About what one click costs: two high-quality 3D pictures with Baby Vambie's reference.
const COST_PER_CLICK = "about $0.40";

export default function PromptArtworkDialog({
  promptId,
  card,
  defaultPose,
  initialTab,
  onPick,
  onClose,
}: {
  promptId: string;
  card: Pick<Prompt, "question" | "supportingText" | "cardColor" | "category" | "artworkPath">;
  defaultPose: MascotName; // what the card shows without artwork
  initialTab: ArtworkTab;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ArtworkTab>(initialTab);
  const [library, setLibrary] = useState<Library | null>(null);
  const [selected, setSelected] = useState<string | null>(card.artworkPath);
  const [idea, setIdea] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [drawn, setDrawn] = useState<LibraryPicture[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    apiGet("/api/admin/prompt-art")
      .then(setLibrary)
      .catch(() => setError("Couldn't load the library."));
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !drawing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, onClose]);

  const generate = async () => {
    setDrawing(true);
    setError(null);
    try {
      const { artworks } = await apiSend(`/api/prompts/${promptId}/artwork/generate`, "POST", {
        question: card.question,
        supportingText: card.supportingText ?? "",
        cardColor: card.cardColor,
        idea,
      });
      const pictures: LibraryPicture[] = artworks.map((a: { imagePath: string; question: string }) => ({ path: a.imagePath, label: a.question, source: "generated" }));
      setDrawn((d) => [...pictures, ...d]);
      setSelected(pictures[0]?.path ?? null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The pictures couldn't be drawn. Try again.");
    } finally {
      setDrawing(false);
    }
  };

  const grid = (pictures: LibraryPicture[], captions = false) => (
    <div className="art-grid">
      {pictures.map((p) => (
        <button
          key={p.path}
          className={`art-tile prompt-card--${card.cardColor} ${selected === p.path ? "art-tile--on" : ""}`}
          onClick={() => setSelected(p.path)}
          aria-pressed={selected === p.path}
          title={p.label}
        >
          <img src={`/${p.path}`} alt={p.label} loading="lazy" />
          {captions && <span className="art-tile__label">{p.label}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="backdrop" onClick={() => !drawing && onClose()} />
      <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Card artwork">
        <div className="adm-modal__head">
          <h2 className="h-title" style={{ fontSize: 26, margin: 0 }}>
            Card artwork
          </h2>
          <button className="icon-btn" onClick={onClose} disabled={drawing} aria-label="Close">
            <IconClose size={22} />
          </button>
        </div>
        <div className="adm-tabs" role="tablist" style={{ margin: "0 0 16px" }}>
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={`adm-tab ${tab === t.key ? "adm-tab--on" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
              {t.key === "made" && library ? ` (${library.made.length})` : ""}
            </button>
          ))}
        </div>

        <div className="adm-modal__body">
          <section className="adm-modal__main">
            {tab === "generate" && (
              <>
                <p className="t-body" style={{ marginTop: 0 }}>
                  Draws {library?.perClick ?? 2} pictures of Baby Vambie, in the style of the card poses, for “{card.question || "this card's question"}”
                </p>
                <Field label="Picture idea (optional)" htmlFor="art-idea" hint="Leave it empty to let the AI choose from the question.">
                  <textarea
                    id="art-idea"
                    className="textarea"
                    style={{ minHeight: 80 }}
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    maxLength={400}
                    placeholder="Baby Vambie blowing out a candle on a little birthday cupcake"
                  />
                </Field>
                <button className="btn btn--lime btn--sm btn--auto" style={{ marginTop: 14 }} onClick={() => void generate()} disabled={drawing || !card.question.trim()}>
                  {drawing ? (
                    <>
                      <IconSpinner size={18} /> Drawing… about a minute
                    </>
                  ) : (
                    <>
                      <IconSparkle size={18} /> Draw {library?.perClick ?? 2} pictures · {COST_PER_CLICK}
                    </>
                  )}
                </button>
                {drawn.length > 0 ? (
                  <>
                    <h3 className="art-heading">Drawn just now</h3>
                    {grid(drawn)}
                    <p className="t-xs t-muted" style={{ marginTop: 8 }}>
                      Every picture is kept under Made for cards, so you can come back to it.
                    </p>
                  </>
                ) : (
                  !drawing && (
                    <p className="t-small t-muted" style={{ marginTop: 14 }}>
                      Pictures are drawn on a transparent background, like the card poses, so they sit on the card's color.
                    </p>
                  )
                )}
              </>
            )}
            {tab === "poses" && (library ? grid(library.poses) : <p>Loading…</p>)}
            {tab === "made" &&
              (!library ? (
                <p>Loading…</p>
              ) : library.made.length ? (
                grid(library.made, true)
              ) : (
                <p className="t-small t-muted">Nothing yet. Pictures you generate or upload for any card appear here.</p>
              ))}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </section>

          <aside className="adm-modal__side">
            <div className={`prompt-card prompt-card--${card.cardColor} art-preview`}>
              <span className={`badge badge--caps badge--sm prompt-card__badge ${card.cardColor === "purple" ? "badge--pink" : "badge--purple"}`}>{card.category || "Category"}</span>
              <span className="prompt-card__q">{card.question || "Your question"}</span>
              {selected ? (
                <img src={`/${selected}`} alt="" className="prompt-card__art" style={{ borderRadius: 16, aspectRatio: "1", objectFit: "cover" }} />
              ) : (
                <Mascot name={defaultPose} className="prompt-card__art" />
              )}
            </div>
            <button className="btn btn--purple btn--sm" style={{ marginTop: 14 }} disabled={!selected || selected === card.artworkPath || drawing} onClick={() => selected && onPick(selected)}>
              Use this picture
            </button>
            <p className="t-xs t-muted" style={{ marginTop: 8, textAlign: "center" }}>
              Families see it after you publish the card.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
