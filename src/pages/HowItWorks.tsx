import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BottomSheet, Chev } from "../components/ui";
import { IconChat, IconChevronLeft, IconChevronRight, IconPlay, IconWave } from "../components/icons";

// "How it works": four storybook pages, opened from the splash screen and from
// Help. Labels sit over the pictures as real text (public/art/how/).

const ART = "/art/how";

interface IntroPage {
  title: string;
  caption: string;
  art: ReactNode;
}

const Voice = () => (
  <span className="how-voice" aria-hidden="true">
    <IconWave size={16} />
  </span>
);

const PAGES: IntroPage[] = [
  {
    title: "A weekly nudge",
    caption: "Invite your family. Everyone gets a gentle weekly text.",
    art: (
      <>
        <img src={`${ART}/nudge.jpg`} alt="A mom and a grandmother smiling at their phones as a weekly text arrives" />
        <div className="how-note">
          <span className="how-note__icon">
            <IconChat size={18} />
          </span>
          <span>
            <strong>Your weekly moment</strong>
            <br />
            Pause, breathe, and remember a little moment with Mia from this week.
          </span>
        </div>
      </>
    ),
  },
  {
    title: "Rewind and reflect",
    caption: "Record a memory, a feeling, or a little reflection.",
    art: <img loading="lazy" src={`${ART}/reflect.jpg`} alt="A grandmother remembering a moment with Baby Vambie as she records it on her phone" />,
  },
  {
    title: "Many voices, one story",
    caption: "Family memories come together in your child's storybook.",
    art: (
      <>
        <img loading="lazy" src={`${ART}/book.jpg`} alt="Baby Vambie standing in an open storybook as threads of light rise from it" />
        <div className="how-voices">
          {[
            ["mom", "Mom"],
            ["dad", "Dad"],
            ["grandma", "Grandma"],
          ].map(([key, name]) => (
            <span key={key} className={`how-face how-face--${key}`}>
              <img loading="lazy" src={`${ART}/${key}.jpg`} alt="" />
              <Voice />
              <span className="how-face__name">{name}</span>
            </span>
          ))}
        </div>
        <span className="how-pill">Inspired by Mom, Dad &amp; Grandma</span>
      </>
    ),
  },
  {
    title: "Make it a family moment",
    caption: "Read together, listen back to the memories, and share with family.",
    art: (
      <>
        <img loading="lazy" src={`${ART}/moment.jpg`} alt="A mom reading a storybook with Baby Vambie while Grandma waves on a video call" />
        <span className="how-play" aria-hidden="true">
          <IconPlay size={26} filled />
        </span>
      </>
    ),
  },
];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function HowItWorks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [invite, setInvite] = useState(false);
  const last = PAGES.length - 1;

  // Signed-out visitors go on to sign up; signed-in families (from Help) go back.
  const leave = useCallback(() => {
    if (!user) navigate("/try");
    else if (window.history.length > 1) navigate(-1);
    else navigate("/");
  }, [user, navigate]);

  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(last, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (invite) return;
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index, invite]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    setIndex(Math.max(0, Math.min(last, Math.round(track.scrollLeft / track.clientWidth))));
  };

  return (
    <div className="page how">
      <div className="tbar">
        <Link to="/" className="wordmark" style={{ marginLeft: 8 }}>
          Vambie
        </Link>
        <div className="tbar__right">
          <button type="button" className="tlink tlink--light tlink--plain how-skip" onClick={leave}>
            {user ? "Close" : "Skip"}
          </button>
        </div>
      </div>

      <div className="how-track" ref={trackRef} onScroll={onScroll} aria-roledescription="carousel" aria-label="How Vambie works">
        {PAGES.map((p, i) => (
          <section key={p.title} className="how-slide" aria-roledescription="slide" aria-label={`${i + 1} of ${PAGES.length}: ${p.title}`} aria-hidden={i !== index}>
            <div className="how-paper">
              <div className="how-head">
                <span className="how-num">{String(i + 1).padStart(2, "0")}</span>
                <h1 className="how-title">{p.title}</h1>
              </div>
              <div className="how-art">{p.art}</div>
              <p className="how-caption">{p.caption}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="how-nav">
        <button type="button" className="how-btn how-btn--back" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous page">
          <IconChevronLeft size={26} strokeWidth={2.6} />
        </button>
        <div className="how-dots" aria-hidden="true">
          {PAGES.map((p, i) => (
            <span key={p.title} className={i === index ? "on" : ""} />
          ))}
        </div>
        {index < last ? (
          <button type="button" className="how-btn how-btn--next" onClick={() => goTo(index + 1)} aria-label="Next page">
            <IconChevronRight size={26} strokeWidth={2.6} />
          </button>
        ) : (
          <span className="how-btn how-btn--spacer" aria-hidden="true" />
        )}
      </div>
      <p className="how-count" aria-live="polite">
        {index + 1} / {PAGES.length}
      </p>

      {index === 0 && (
        <p className="how-hint">
          <span aria-hidden="true">↔</span> Swipe to turn the page
        </p>
      )}
      {index === last && (
        <div className="how-end">
          {user ? (
            <button type="button" className="btn btn--lime" onClick={leave}>
              Back to Vambie <Chev />
            </button>
          ) : (
            <>
              <Link className="btn btn--lime" to="/try">
                Start our family story <Chev />
              </Link>
              <button type="button" className="tlink tlink--light how-invite" onClick={() => setInvite(true)}>
                I have an invitation
              </button>
            </>
          )}
        </div>
      )}

      <BottomSheet open={invite} onClose={() => setInvite(false)} label="I have an invitation">
        <h2 className="h-title" style={{ fontSize: 26 }}>
          Joining from an invitation?
        </h2>
        <p className="t-body" style={{ marginTop: 8 }}>
          Open the invite link someone sent you. It takes you straight to your family's storybook.
        </p>
        <p className="t-small t-muted" style={{ marginTop: 8 }}>
          Already joined? Sign in with the phone number you used.
        </p>
        <Link className="btn btn--purple" style={{ marginTop: 18 }} to="/sign-in">
          Sign in <Chev />
        </Link>
        <button type="button" className="btn btn--soft" style={{ marginTop: 10 }} onClick={() => setInvite(false)}>
          Close
        </button>
      </BottomSheet>
    </div>
  );
}
