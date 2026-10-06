import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AccessDenied from "../components/AccessDenied";
import MemoryListRow from "../components/MemoryListRow";
import { IconBookmark, IconChevronRight, IconClose, IconMic, IconSearch, IconStar } from "../components/icons";
import { Chev, Loading, Mascot, Segmented } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { useInlineAudio } from "../hooks/useInlineAudio";
import { apiSend } from "../lib/api";
import { chapterLabel, formatDate, formatMonth, possessive } from "../lib/format";
import type { StorybookChapter } from "../types";

const DATE_RANGES = [
  { value: "all", label: "All dates" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 3 months" },
  { value: "365", label: "This past year" },
];

const monthKey = (iso: string) => iso.slice(0, 7);

// The Memories tab: published chapters and the family's memories, with filters.
export default function Memories() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { storybook, status } = useStorybookData(id);
  const audio = useInlineAudio();
  const tab = params.get("tab") === "memories" ? "memories" : "chapters";
  const [range, setRange] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const [who, setWho] = useState("");
  const [month, setMonth] = useState("");
  const [marks, setMarks] = useState<Record<string, boolean>>({});

  const chapters = useMemo(() => {
    if (!storybook) return [];
    const since = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    return storybook.chapters
      .filter((c) => c.status === "published")
      .filter((c) => new Date(c.publishedAt ?? c.createdAt).getTime() >= since)
      .filter((c) => !favorites || (marks[c.id] ?? c.favorite))
      .sort((a, b) => b.sequence - a.sequence);
  }, [storybook, range, favorites, marks]);

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    storybook?.memories.forEach((m) => seen.set(m.contributor.id, m.mine ? "You" : m.contributor.name));
    return [...seen.entries()];
  }, [storybook]);

  const months = useMemo(() => [...new Set(storybook?.memories.map((m) => monthKey(m.eventDate ?? m.recordedAt)) ?? [])], [storybook]);

  const memories = useMemo(() => {
    if (!storybook) return [];
    const q = query.trim().toLowerCase();
    return storybook.memories.filter(
      (m) =>
        (!who || m.contributor.id === who) &&
        (!month || monthKey(m.eventDate ?? m.recordedAt) === month) &&
        (!favorites || m.favorite) &&
        (!q || [m.title, m.words, m.promptText, m.contributor.name].some((t) => t?.toLowerCase().includes(q)))
    );
  }, [storybook, query, who, month, favorites]);

  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;

  const base = `/storybooks/${storybook.id}`;
  const child = storybook.child.displayName;
  const filtered = query || who || month || favorites;

  const toggleMark = async (c: StorybookChapter) => {
    const next = !(marks[c.id] ?? c.favorite);
    setMarks((m) => ({ ...m, [c.id]: next }));
    await apiSend(`/api/chapters/${c.id}/mark`, "PUT", { favorite: next }).catch(() => setMarks((m) => ({ ...m, [c.id]: !next })));
  };

  const clearFilters = () => {
    setWho("");
    setMonth("");
    setFavorites(false);
  };

  return (
    <div className="page page--nav">
      <TopBar wordmark avatar={`${base}/settings`} />
      <header className="masthead" style={{ paddingTop: 0, paddingBottom: 18 }}>
        <h1 className="h-display h-display--md masthead__title">{tab === "chapters" ? `${possessive(child)} growing story.` : `${possessive(child)} memories.`}</h1>
      </header>
      <div className="pad">
        <Segmented
          dark
          value={tab}
          onChange={(t) => setParams(t === "memories" ? { tab: "memories" } : {}, { replace: true })}
          options={[
            { value: "chapters", label: "Chapters" },
            { value: "memories", label: "Memories" },
          ]}
        />

        {tab === "chapters" ? (
          <>
            <div className="chips" style={{ margin: "16px 0" }}>
              <label className="chip">
                <span className="sr-only">Date range</span>
                <select value={range} onChange={(e) => setRange(e.target.value)}>
                  {DATE_RANGES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <IconChevronRight size={16} className="chip__chev" />
              </label>
              <button className={`chip ${favorites ? "chip--on" : ""}`} onClick={() => setFavorites((f) => !f)} aria-pressed={favorites}>
                <IconStar size={18} filled={favorites} /> Favorites
              </button>
            </div>
            {chapters.length === 0 ? (
              <EmptyCard
                art={favorites ? "magnifier" : "open-book"}
                title={favorites ? "No favorites yet." : "No chapters yet."}
                text={favorites ? "Tap the bookmark on a chapter to keep it here." : "The week's memories become a new chapter each week."}
              />
            ) : (
              chapters.map((c) => {
                const marked = marks[c.id] ?? c.favorite;
                return (
                  <div key={c.id} className="chapter-tile">
                    <Link to={`${base}/read/${c.id}`} className="hstack" style={{ flex: 1, color: "inherit", textDecoration: "none", gap: 14, minWidth: 0 }}>
                      {c.cover ? <img src={`/${c.cover}`} alt="" className="chapter-tile__cover" /> : <span className="chapter-tile__cover" />}
                      <span className="chapter-tile__text">
                        <span className="chapter-tile__label">{chapterLabel(c.sequence)}</span>
                        <span className="chapter-tile__title" style={{ display: "block" }}>{c.title}</span>
                        <span className="chapter-tile__date">{formatDate(c.publishedAt ?? c.createdAt)}</span>
                      </span>
                      <span className="chapter-tile__chev">
                        <IconChevronRight size={22} />
                      </span>
                    </Link>
                    <button
                      className={`chapter-tile__mark ${marked ? "chapter-tile__mark--on" : ""}`}
                      onClick={() => void toggleMark(c)}
                      aria-pressed={marked}
                      aria-label={marked ? "Remove bookmark" : "Bookmark this chapter"}
                    >
                      <IconBookmark size={24} filled={marked} />
                    </button>
                  </div>
                );
              })
            )}
          </>
        ) : (
          <>
            <div className="search" style={{ marginTop: 16 }}>
              <span className="search__icon">
                <IconSearch size={22} />
              </span>
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories" aria-label="Search memories" />
              {query && (
                <button className="search__clear" onClick={() => setQuery("")} aria-label="Clear search">
                  <IconClose size={22} />
                </button>
              )}
            </div>
            <div className="chips" style={{ margin: "12px 0 8px" }}>
              <FilterChip
                label="Anyone"
                value={who}
                onChange={setWho}
                options={people.map(([value, label]) => ({ value, label }))}
              />
              <FilterChip label="Any month" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: formatMonth(`${m}-15T12:00:00`) }))} />
              <button className={`chip ${favorites ? "chip--on" : ""}`} onClick={() => setFavorites((f) => !f)} aria-pressed={favorites}>
                <IconStar size={18} filled={favorites} /> Favorites
              </button>
            </div>
            {memories.length === 0 ? (
              filtered ? (
                <div className="sheet" style={{ margin: "8px 0 0", textAlign: "center" }}>
                  <Mascot name="magnifier" style={{ width: 170, margin: "0 auto", display: "block" }} />
                  <h2 className="h-display h-display--sm" style={{ color: "var(--ink)", fontSize: 40, marginTop: 6 }}>
                    No matches
                    <br />
                    this time.
                  </h2>
                  <p className="t-body t-muted" style={{ margin: "10px 0 18px" }}>Try another word or clear your filters.</p>
                  <div className="stack">
                    {who || month || favorites ? (
                      <>
                        <button className="btn btn--lime btn--caps" onClick={clearFilters}>
                          Clear filters <Chev />
                        </button>
                        {query && (
                          <button className="btn btn--outline" onClick={() => setQuery("")}>
                            Clear search
                          </button>
                        )}
                      </>
                    ) : (
                      <button className="btn btn--lime btn--caps" onClick={() => setQuery("")}>
                        Clear search <Chev />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyCard art="mic" title="No memories yet." text="Record a little moment to start the story." />
              )
            ) : (
              memories.map((m) => (
                <MemoryListRow
                  key={m.id}
                  memory={m}
                  to={`${base}/memories/${m.id}`}
                  playing={audio.playingId === m.id}
                  onPlay={() => m.audioSrc && audio.toggle(m.id, m.audioSrc)}
                  showWho
                />
              ))
            )}
          </>
        )}

        <Link className="btn btn--lime btn--caps" to={`${base}/record`} style={{ marginTop: 20 }}>
          <IconMic size={24} filled /> Record a memory <Chev />
        </Link>
      </div>
      <BottomNav storybookId={storybook.id} />
    </div>
  );
}

function FilterChip({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const current = options.find((o) => o.value === value);
  if (current) {
    return (
      <span className="chip chip--light">
        {current.label}
        <button onClick={() => onChange("")} aria-label={`Clear ${label}`} style={{ background: "none", border: 0, color: "inherit", padding: 0, display: "inline-flex", cursor: "pointer" }}>
          <IconClose size={18} />
        </button>
      </span>
    );
  }
  return (
    <label className="chip">
      <span className="sr-only">{label}</span>
      <select value="" onChange={(e) => onChange(e.target.value)}>
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronRight size={16} className="chip__chev" />
    </label>
  );
}

function EmptyCard({ art, title, text }: { art: "magnifier" | "open-book" | "mic"; title: string; text: string }) {
  return (
    <div className="card card--dark" style={{ textAlign: "center", marginTop: 8 }}>
      <Mascot name={art} style={{ width: 120, display: "block", margin: "0 auto" }} />
      <p className="h-title h-title--sm" style={{ marginTop: 6 }}>{title}</p>
      <p className="t-small t-muted-dark" style={{ margin: "6px 0 0" }}>{text}</p>
    </div>
  );
}
