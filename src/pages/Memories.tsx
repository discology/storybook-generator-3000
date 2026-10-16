import { useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AccessDenied from "../components/AccessDenied";
import MemoryListRow from "../components/MemoryListRow";
import { IconChevronRight, IconClose, IconMic, IconSearch, IconStar } from "../components/icons";
import { Chev, Loading, Mascot } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { useInlineAudio } from "../hooks/useInlineAudio";
import { capitalize, childLabel, formatMonth, possessive } from "../lib/format";

const monthKey = (iso: string) => iso.slice(0, 7);

// The Memories tab (VSB-136): the family's memories, each with who it's from
// (VSB-135), with search and filters. Chapters are in the Book tab.
export default function Memories() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { storybook, status } = useStorybookData(id);
  const audio = useInlineAudio();
  const [favorites, setFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const [who, setWho] = useState("");
  const [month, setMonth] = useState("");

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

  // The chapter list used to live here, behind a switch: an old link to it opens Book.
  if (params.get("tab") === "chapters") return <Navigate to={`/storybooks/${id}/book`} replace />;
  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;

  const base = `/storybooks/${storybook.id}`;
  const child = childLabel(storybook.child.displayName, storybook.me?.role === "owner");
  const filtered = query || who || month || favorites;

  const clearFilters = () => {
    setWho("");
    setMonth("");
    setFavorites(false);
  };

  return (
    <div className="page page--nav">
      <TopBar wordmark avatar={`${base}/settings`} />
      <header className="masthead" style={{ paddingTop: 0, paddingBottom: 18 }}>
        <h1 className="h-display h-display--md masthead__title">{capitalize(`${possessive(child)} memories.`)}</h1>
      </header>
      <div className="pad">
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
            />
          ))
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

