// "Teach Baby Vambie a lesson" for the Framer landing page (VSB-140).
// Paste this file into Framer as a code component (Assets, Code, New file).
// The lesson box and its button sit on the page; the button opens a modal for
// the child's name and birthday, then opens the app's /try with all three in
// the link, where the preview starts by itself. "Make your own story" at the end
// of a book in StoryShelf.tsx opens the same modal (VSB-148). Colors, fonts,
// words and the app's address are settings in Framer's right-hand panel.

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { addPropertyControls, ControlType } from "framer";

interface Props {
  appUrl: string;
  placeholder: string;
  buttonLabel: string;
  modalTitle: string;
  modalButtonLabel: string;
  modalNote: string;
  textFont: string;
  headingFont: string;
  buttonColor: string;
  buttonTextColor: string;
  boxColor: string;
  textColor: string;
  style?: CSSProperties;
}

const today = () => new Date().toISOString().slice(0, 10);

function lessonUrl(appUrl: string, lesson: string, name: string, birthday: string) {
  const params = new URLSearchParams({ lesson: lesson.trim(), name: name.trim(), birthday });
  return `${appUrl.replace(/\/+$/, "")}/try?${params.toString()}`;
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export default function LessonBox(props: Props) {
  const { placeholder, buttonLabel, textFont, buttonColor, buttonTextColor, boxColor, textColor } = props;
  const [lesson, setLesson] = useState("");
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);

  const generate = () => {
    if (!lesson.trim()) {
      setNudge(true);
      return;
    }
    setNudge(false);
    setOpen(true);
  };

  // "Make your own story" at the end of a book (StoryShelf.tsx, VSB-148).
  useEffect(() => {
    const onOpen = (e: Event) => {
      (e as CustomEvent<{ handled: boolean }>).detail.handled = true;
      setNudge(false);
      setOpen(true);
    };
    window.addEventListener("vambie:open-lesson", onOpen);
    return () => window.removeEventListener("vambie:open-lesson", onOpen);
  }, []);

  return (
    <div style={{ ...props.style, width: "100%", fontFamily: textFont }}>
      <div style={{ background: boxColor, borderRadius: 12, padding: "16px 14px 12px", boxSizing: "border-box" }}>
        <textarea
          value={lesson}
          onChange={(e) => {
            setLesson(e.target.value);
            if (nudge && e.target.value.trim()) setNudge(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              generate();
            }
          }}
          placeholder={placeholder}
          aria-label="What do you want to teach Baby Vambie?"
          maxLength={300}
          rows={2}
          style={{ width: "100%", border: "none", outline: "none", resize: "none", background: "transparent", color: textColor, fontFamily: textFont, fontSize: 15, lineHeight: 1.4, padding: 0 }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
          <span role="status" style={{ fontSize: 13, color: "#B4232A", minHeight: 16 }}>
            {nudge ? "Tell us what you'd like to teach Baby Vambie." : ""}
          </span>
          <button type="button" onClick={generate} style={buttonStyle(buttonColor, buttonTextColor, textFont)}>
            {buttonLabel}
            <span aria-hidden="true" style={{ borderLeft: `1px solid ${buttonTextColor}55`, paddingLeft: 10, marginLeft: 10 }}>
              ➤
            </span>
          </button>
        </div>
      </div>
      {open && <LessonModal {...props} lesson={lesson} onClose={() => setOpen(false)} />}
    </div>
  );
}

function LessonModal(props: Props & { lesson: string; onClose: () => void }) {
  const { appUrl, modalTitle, modalButtonLabel, modalNote, textFont, headingFont, buttonColor, buttonTextColor, onClose } = props;
  // Opened from a book with nothing typed yet, the modal asks for the lesson too.
  const [askLesson] = useState(!props.lesson.trim());
  const [lesson, setLesson] = useState(props.lesson);
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!lesson.trim()) return setError("Tell us what you'd like to teach Baby Vambie.");
    if (!name.trim()) return setError("Add their name or nickname.");
    if (!birthday || birthday > today()) return setError("Add their birthday. Stories are written for their age.");
    window.location.href = lessonUrl(appUrl, lesson, name, birthday);
  };

  const label: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "14px 0 6px", color: "#111" };
  const input: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1.5px solid #111", borderRadius: 10, padding: "12px 12px", fontSize: 16, fontFamily: textFont, background: "#fff", color: "#111" };

  const modal = (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: textFont }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{ position: "relative", width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, padding: "26px 22px 20px", boxSizing: "border-box", color: "#111" }}
      >
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 10, right: 12, border: "none", background: "none", fontSize: 26, lineHeight: 1, cursor: "pointer", color: "#111" }}>
          ×
        </button>
        <h2 style={{ fontFamily: headingFont, fontSize: 30, lineHeight: 1, textTransform: "uppercase", textAlign: "left", color: "#111", background: "none", padding: 0, margin: "0 28px 12px 0" }}>{modalTitle}</h2>
        {askLesson ? (
          <>
            <label style={{ ...label, marginTop: 0 }} htmlFor="vambie-lesson-text">
              I want to teach Baby Vambie…
            </label>
            <textarea
              id="vambie-lesson-text"
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="to share, to be brave at the doctor…"
              style={{ ...input, resize: "none", lineHeight: 1.4 }}
            />
          </>
        ) : (
          <p style={{ fontSize: 15, lineHeight: 1.4, margin: 0, padding: "10px 12px", background: "#F3F3F3", borderRadius: 10 }}>
            “{/^i want to teach/i.test(lesson.trim()) ? lesson.trim() : `I want to teach Baby Vambie ${lesson.trim()}`}”
          </p>
        )}
        <label style={label} htmlFor="vambie-lesson-name">
          Their name or nickname
        </label>
        <input id="vambie-lesson-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" placeholder="Mia" style={input} />
        <label style={label} htmlFor="vambie-lesson-birthday">
          Their birthday
        </label>
        <input id="vambie-lesson-birthday" type="date" value={birthday} max={today()} onChange={(e) => setBirthday(e.target.value)} style={input} />
        <p role="status" style={{ fontSize: 13, color: "#B4232A", minHeight: 18, margin: "10px 0 0" }}>
          {error ?? ""}
        </p>
        <button type="submit" style={{ ...buttonStyle(buttonColor, buttonTextColor, textFont), width: "100%", justifyContent: "center", padding: "14px 18px", marginTop: 6 }}>
          {modalButtonLabel}
          <span aria-hidden="true" style={{ marginLeft: 10 }}>
            ➤
          </span>
        </button>
        <p style={{ fontSize: 12, color: "#555", textAlign: "center", margin: "10px 0 0" }}>{modalNote}</p>
      </form>
    </div>
  );
  // Framer renders pages on the server first; the modal only exists in the browser.
  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}

const buttonStyle = (background: string, color: string, fontFamily: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px 10px 14px",
  background,
  color,
  fontFamily,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

LessonBox.defaultProps = {
  appUrl: "https://vambie-storybook.fly.dev",
  placeholder: "I want to teach Baby Vambie…",
  buttonLabel: "Generate my story",
  modalTitle: "Who's this story for?",
  modalButtonLabel: "Make my story",
  modalNote: "You'll see a free preview first. No account needed.",
  textFont: "Inter, system-ui, sans-serif",
  headingFont: "Anton, Impact, sans-serif",
  buttonColor: "#000000",
  buttonTextColor: "#FFFFFF",
  boxColor: "#FFFFFF",
  textColor: "#111111",
};

addPropertyControls(LessonBox, {
  appUrl: { type: ControlType.String, title: "App address" },
  placeholder: { type: ControlType.String, title: "Placeholder" },
  buttonLabel: { type: ControlType.String, title: "Button" },
  modalTitle: { type: ControlType.String, title: "Modal title" },
  modalButtonLabel: { type: ControlType.String, title: "Modal button" },
  modalNote: { type: ControlType.String, title: "Modal note" },
  textFont: { type: ControlType.String, title: "Text font" },
  headingFont: { type: ControlType.String, title: "Title font" },
  buttonColor: { type: ControlType.Color, title: "Button color" },
  buttonTextColor: { type: ControlType.Color, title: "Button text" },
  boxColor: { type: ControlType.Color, title: "Box color" },
  textColor: { type: ControlType.Color, title: "Text color" },
});
