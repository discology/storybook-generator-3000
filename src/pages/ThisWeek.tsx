import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { IconAlert, IconCheck, IconMic, IconPlay } from "../components/icons";
import { Chev, Loading, Masthead, Sheet, StepRow } from "../components/ui";
import { memoryTitle } from "../components/MemoryListRow";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { possessive } from "../lib/format";
import type { ThisWeek as ThisWeekData } from "../types";

const PROCESSING = ["recorded", "transcribing", "transcribed"];

// This week's chapter: the latest recording's progress, then the chapter made
// from the week's memories the morning after the weekly reminder.
export default function ThisWeek() {
  const { id } = useParams();
  const { storybook } = useStorybookData(id);
  const [data, setData] = useState<ThisWeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    apiGet(`/api/storybooks/${id}/this-week`)
      .then(setData)
      .catch(() => setError("We couldn't load this week's chapter."));
  }, [id]);
  useEffect(load, [load]);

  const busy = !!data && (data.generating || data.memories.some((m) => PROCESSING.includes(m.status)));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  const makeNow = async () => {
    setStarting(true);
    setError(null);
    try {
      await apiSend(`/api/storybooks/${id}/chapters/weekly`, "POST");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the chapter. Try again.");
    } finally {
      setStarting(false);
    }
  };

  const retry = async (memoryId: string) => {
    await apiSend(`/api/memories/${memoryId}/process`, "POST");
    load();
  };

  if (!data || !storybook) return <Loading />;

  const base = `/storybooks/${id}`;
  const child = storybook.child.displayName;
  const owner = storybook.me.role === "owner";
  const latest = data.memories.find((m) => m.mine) ?? data.memories[0];
  const day = new Date(data.nextChapterAt).toLocaleDateString("en-US", { weekday: "long" });
  const allowed = data.memories.filter((m) => m.storyUseConsent);
  const inProgress = data.chapterInProgress;
  const madeAfterLatest = inProgress && (!latest || new Date(inProgress.createdAt) > new Date(latest.recordedAt));

  return (
    <div className="page">
      <TopBar back={base} wordmark menu={`${base}/settings`} />
      <Masthead
        plate="tall"
        title={
          <>
            A new chapter
            <br />
            is taking shape.
          </>
        }
        art="open-book"
        center
      />
      <Sheet grow>
        <div className="steps steps--boxed">
          {latest ? (
            <>
              <StepRow
                state="done"
                title="Recording saved"
                sub={latest.mine ? "Your audio is safely stored." : `${latest.contributor.name}'s memory is safely stored.`}
              />
              {PROCESSING.includes(latest.status) ? (
                <StepRow state="active" title="Preparing your words" sub="Listening to your recording…" />
              ) : latest.status === "failed" ? (
                <div className="step">
                  <span className="step__icon step__icon--error">
                    <IconAlert size={22} />
                  </span>
                  <div className="grow">
                    <p className="step__title">We couldn't make out the words</p>
                    <p className="step__sub">{latest.processingError ?? "Something went wrong."}</p>
                    <button className="tlink" style={{ marginTop: 6 }} onClick={() => void retry(latest.id)}>
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <StepRow state="done" title="Transcript ready" sub="We've prepared your words." />
              )}
            </>
          ) : (
            <StepRow state="pending" title="Record a memory" sub="Anything from this week, big or tiny." />
          )}

          {data.generating ? (
            <StepRow state="active" title="Creating your chapter" sub="Bringing it all together…" />
          ) : madeAfterLatest && inProgress ? (
            <Link to={`${base}/chapters/${inProgress.id}/pages`} className="step" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="step__icon step__icon--done">
                <IconCheck size={22} strokeWidth={3.2} />
              </span>
              <span className="grow">
                <p className="step__title">Your chapter is written</p>
                <p className="step__sub">
                  “{inProgress.title}” · {inProgress.pagesStatus === "illustrating" ? "drawing the pictures now" : "open it to look through the pages"}
                </p>
              </span>
              <Chev />
            </Link>
          ) : (
            <div className="step">
              <span className="step__icon step__icon--pending" />
              <div className="grow">
                <p className="step__title">Creating your chapter</p>
                <p className="step__sub">
                  {allowed.length || data.otherCount
                    ? `${day} morning, from ${allowed.length + data.otherCount} ${allowed.length + data.otherCount === 1 ? "memory" : "memories"} this week.`
                    : `${day} morning, from this week's memories.`}
                </p>
                {owner && data.readyCount > 0 && (
                  <button className="tlink" style={{ marginTop: 6 }} onClick={() => void makeNow()} disabled={starting}>
                    {starting ? "Starting…" : "Make it now"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {data.error && !data.generating && <p className="error-text">The last try didn't work: {data.error}</p>}
        {error && <p className="error-text">{error}</p>}

        {allowed.length > 1 && (
          <div style={{ marginTop: 18 }}>
            <p className="eyebrow t-muted" style={{ margin: "0 0 6px" }}>
              In this week's chapter
            </p>
            {allowed.map((m) => (
              <p key={m.id} className="t-small" style={{ margin: "4px 0" }}>
                • {memoryTitle(m)}
                {!m.mine && <span className="t-muted"> · {m.contributor.name}</span>}
              </p>
            ))}
          </div>
        )}

        <p className="t-center t-small t-muted" style={{ margin: "18px 0 0" }}>
          You can leave this page.
          <br />
          We'll let you know when it's ready.
        </p>
        <div className="stack" style={{ marginTop: 18 }}>
          <Link className="btn btn--lime btn--caps" to={base}>
            Back to {possessive(child)} story <Chev />
          </Link>
          {latest ? (
            <Link className="btn btn--dark btn--caps" to={`${base}/memories/${latest.id}`}>
              <IconPlay size={20} /> Listen to your memory <Chev />
            </Link>
          ) : (
            <Link className="btn btn--dark btn--caps" to={`${base}/record`}>
              <IconMic size={20} filled /> Record a memory <Chev />
            </Link>
          )}
        </div>
      </Sheet>
    </div>
  );
}
