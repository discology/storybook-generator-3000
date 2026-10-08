import { useEffect, useMemo, useState } from "react";
import { Chev, Field, Masthead, Note, Sheet } from "./ui";
import { IconImage } from "./icons";
import { ApiError, apiSend, settle } from "../lib/api";

// "You, in the pictures": shown once, right after someone starts a storybook or
// accepts an invitation. It creates their family character with what the child
// calls them, and an optional private photo the artist uses to draw them. Never a
// photo of the child: Baby Vambie stands in for the child on every page.

// What the child might call someone, from the relationship they picked. Never
// guessed from a name: a name can't tell Mama from Papa (VSB-89).
function childWords(relationship: string | null, name: string) {
  const first = name.trim().split(/\s+/)[0] || name.trim();
  switch (relationship) {
    case "Parent":
      return { options: ["Mama", "Papa", "Mom", "Dad", "Mommy", "Daddy"], preset: null };
    case "Grandparent":
      return { options: ["Grandma", "Grandpa", "Nana", "Gigi", "Abuela", "Oma"], preset: null };
    case "Auntie":
      return { options: [`Auntie ${first}`, `Aunt ${first}`], preset: `Auntie ${first}` };
    case "Uncle":
      return { options: [`Uncle ${first}`], preset: `Uncle ${first}` };
    case "Sibling":
    case "Cousin":
    case "Family friend":
      return { options: first ? [first] : [], preset: first || null };
    default:
      return { options: first ? [first] : [], preset: null };
  }
}

const PHOTO_TYPES = "image/png,image/jpeg,image/webp";

export default function YouInThePictures({
  storybookId,
  childName,
  myName,
  relationship,
  expecting = false,
  onDone,
}: {
  storybookId: string;
  childName: string;
  myName: string;
  relationship: string | null;
  expecting?: boolean;
  onDone: () => void;
}) {
  const child = childName.trim() || "your child";
  const { options, preset } = useMemo(() => childWords(relationship, myName), [relationship, myName]);
  const [word, setWord] = useState<string | null>(preset);
  const [other, setOther] = useState(false);
  const [custom, setCustom] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!PHOTO_TYPES.split(",").includes(f.type)) return setError("Use a PNG, JPEG or WebP photo.");
    if (f.size > 10 * 1024 * 1024) return setError("That photo is over 10 MB. Try a smaller one.");
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const childWord = (other ? custom : word ?? "").trim();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const character = await apiSend(`/api/storybooks/${storybookId}/characters`, "POST", {
        name: myName.trim(),
        relationship: relationship ?? "",
        aliases: childWord ? [childWord] : [],
      });
      if (file) {
        const design = character.designs?.find((d: { variant: string; status: string }) => d.variant === "today" && d.status === "draft") ?? character.designs?.[0];
        if (design) {
          const body = new FormData();
          body.append("photo", file);
          const res = await settle(await fetch(`/api/designs/${design.id}/photo`, { method: "POST", body }));
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new ApiError(res.status, data.error || "The photo didn't upload. You can add it later under Who's in the pictures.");
          }
        }
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Masthead
        title={
          <>
            You, in the
            <br />
            pictures.
          </>
        }
        sub={`Family appear in ${child}'s book as themselves, drawn as Vambies.`}
        style={{ paddingTop: 0, paddingRight: 140 }}
      />
      <Sheet peek="peek" grow>
        <Field label={expecting ? `What will ${child} call you?` : `What does ${child} call you?`}>
          <div className="choices choices--wrap">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                className={`choice ${!other && word === o ? "choice--on" : ""}`}
                aria-pressed={!other && word === o}
                onClick={() => {
                  setOther(false);
                  setWord(o);
                }}
              >
                {o}
              </button>
            ))}
            <button type="button" className={`choice ${other ? "choice--on" : ""}`} aria-pressed={other} onClick={() => setOther(true)}>
              Something else
            </button>
          </div>
          {other && (
            <input
              className="input"
              style={{ marginTop: 12 }}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. Baba, Tata, Lolo"
              aria-label={`What ${child} calls you`}
              autoFocus
            />
          )}
        </Field>

        <Field label="A photo of you (optional)" hint="It helps the artist get your face, hair and glasses right.">
          <label className="photo-pick">
            <input type="file" accept={PHOTO_TYPES} onChange={(e) => pick(e.target.files?.[0])} />
            {preview ? <img src={preview} alt="Your photo" /> : <span className="photo-pick__icon"><IconImage size={28} /></span>}
            <span className="photo-pick__text">
              <strong>{preview ? "Photo added" : "Add a photo"}</strong>
              <span>{preview ? "Tap to choose a different one" : "From your camera or your photos"}</span>
            </span>
          </label>
        </Field>

        <Note kind="info">
          Your photo stays private: only the artist uses it, to draw you, and it never appears in the book. Just you, please, never {child}. Baby Vambie stands in for {child} on every page.
        </Note>

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--lime btn--caps" type="button" disabled={busy} onClick={() => void save()} style={{ marginTop: 20 }}>
          {busy ? (file ? "Reading your photo…" : "Saving…") : "Save"} <Chev />
        </button>
        <p className="t-center" style={{ marginTop: 16 }}>
          <button type="button" className="tlink" onClick={onDone} disabled={busy}>
            Skip for now
          </button>
        </p>
      </Sheet>
    </>
  );
}
