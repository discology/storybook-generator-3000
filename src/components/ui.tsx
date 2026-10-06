import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconInfo,
  IconSpinner,
} from "./icons";

// Baby Vambie artwork generated from his official 3D render (public/art).
export type MascotName =
  | "peek"
  | "peek-worried"
  | "book"
  | "hug-book"
  | "open-book"
  | "closedbook"
  | "star"
  | "mic"
  | "key"
  | "envelope"
  | "envelope-happy"
  | "magnifier"
  | "papers"
  | "download";

export function Mascot({ name, className, style }: { name: MascotName; className?: string; style?: CSSProperties }) {
  return <img src={`/art/vambie-${name}.webp`} alt="" className={className} style={style} draggable={false} />;
}

export const Chev = ({ size = 20 }: { size?: number }) => <IconChevronRight size={size} strokeWidth={3} className="btn__chev" />;

// The dark header: a big condensed headline, with optional art and night backdrop.
export function Masthead({
  title,
  sub,
  badge,
  art,
  artMode = "scene",
  plate,
  center,
  size,
  children,
  style,
}: {
  title: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  art?: MascotName;
  artMode?: "scene" | "corner";
  plate?: "tall" | "wide";
  center?: boolean;
  size?: "md" | "sm";
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const classes = [
    "masthead",
    plate === "tall" && "masthead--plate",
    plate === "wide" && "masthead--wide-plate",
    center && "masthead--center",
    art && artMode === "corner" && "masthead--corner",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <header className={classes} style={style}>
      {badge && <div className="masthead__badge">{badge}</div>}
      <h1 className={`h-display masthead__title ${size ? `h-display--${size}` : ""}`}>{title}</h1>
      {sub && <p className="masthead__sub">{sub}</p>}
      {children}
      {art && <Mascot name={art} className={`masthead__art masthead__art--${artMode}`} />}
    </header>
  );
}

// The cream panel under a masthead; `peek` puts Baby Vambie over its top edge.
export function Sheet({
  children,
  peek,
  flush,
  grow,
  className,
  style,
}: {
  children: ReactNode;
  peek?: MascotName;
  flush?: boolean;
  grow?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const classes = ["sheet", flush && "sheet--flush", grow && "sheet--grow", peek && "has-peek", className].filter(Boolean).join(" ");
  return (
    <section className={classes} style={style}>
      {peek && <Mascot name={peek} className="sheet__peek" />}
      {children}
    </section>
  );
}

export function Note({
  kind = "info",
  title,
  icon,
  children,
  style,
}: {
  kind?: "info" | "warn" | "danger" | "ok" | "plain" | "dark";
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const glyph = icon ?? (kind === "warn" || kind === "danger" ? <IconAlert size={16} /> : kind === "ok" ? <IconCheck size={16} strokeWidth={3} /> : <IconInfo size={16} />);
  return (
    <div className={`note note--${kind}`} style={style} role={kind === "warn" || kind === "danger" ? "status" : undefined}>
      <span className="note__icon">{glyph}</span>
      <div className="note__body">
        {title && <strong className="note__title">{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export type StepState = "done" | "active" | "pending" | "held" | "error";

export function StepRow({ state, title, sub, icon }: { state: StepState; title: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  const glyph =
    icon ??
    (state === "done" || state === "held" ? (
      <IconCheck size={22} strokeWidth={3.2} />
    ) : state === "active" ? (
      <IconSpinner size={40} />
    ) : state === "error" ? (
      <IconAlert size={22} />
    ) : null);
  return (
    <div className="step">
      <span className={`step__icon step__icon--${state}`}>{glyph}</span>
      <div>
        <p className="step__title">{title}</p>
        {sub && <p className="step__sub">{sub}</p>}
      </div>
    </div>
  );
}

export function MenuRow({
  icon,
  title,
  sub,
  to,
  onClick,
  danger,
  right,
}: {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  const inner = (
    <>
      {icon && <span className="menu__icon">{icon}</span>}
      <span className="menu__text">
        <span className="menu__title">{title}</span>
        {sub && <span className="menu__sub" style={{ display: "block" }}>{sub}</span>}
      </span>
      {right ?? ((to || onClick) && <IconChevronRight size={22} className="menu__chev" />)}
    </>
  );
  const className = `menu__row ${danger ? "menu__row--danger" : ""}`;
  if (to) return <Link to={to} className={className}>{inner}</Link>;
  if (onClick) return <button type="button" className={className} onClick={onClick}>{inner}</button>;
  return <div className={className} style={{ cursor: "default" }}>{inner}</div>;
}

export function Field({ label, hint, htmlFor, strong, children }: { label?: ReactNode; hint?: ReactNode; htmlFor?: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className="field">
      {label && (
        <label className={`field__label ${strong ? "field__label--strong" : ""}`} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function Select({
  id,
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
  icon,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: (string | { value: string; label: string })[];
  disabled?: boolean;
  ariaLabel?: string;
  icon?: ReactNode; // shown at the start of the field
}) {
  return (
    <span className={`select ${icon ? "select--lead" : ""}`}>
      {icon && <span className="select__lead">{icon}</span>}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={ariaLabel}>
        {options.map((o) =>
          typeof o === "string" ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          )
        )}
      </select>
    </span>
  );
}

export function Check({ checked, onChange, children, sub, id }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <label className="check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check__box">
        <IconCheck size={18} strokeWidth={3.4} />
      </span>
      <span>
        {children}
        {sub && <span className="check__sub">{sub}</span>}
      </span>
    </label>
  );
}

export function RadioCard({ on, onClick, title, sub, badge }: { on: boolean; onClick: () => void; title: ReactNode; sub?: ReactNode; badge?: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`radio-card ${on ? "radio-card--on" : ""}`} onClick={onClick}>
      <span className="radio-card__dot" />
      <span>
        <span className="radio-card__title">
          {title}
          {badge}
        </span>
        {sub && <span className="radio-card__sub" style={{ display: "block" }}>{sub}</span>}
      </span>
    </button>
  );
}

export function RadioRow({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`radio-row ${on ? "radio-row--on" : ""}`} onClick={onClick}>
      <span className="radio-card__dot" />
      <span>{children}</span>
    </button>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  dark,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  dark?: boolean;
}) {
  return (
    <div className={`seg ${dark ? "seg--dark" : ""}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`seg__btn ${value === o.value ? "seg__btn--on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressSteps({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress-steps" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && <span className={`progress-steps__line ${i < step ? "progress-steps__line--on" : ""}`} />}
          <span className={`progress-steps__dot ${i < step ? "progress-steps__dot--on" : ""}`} />
        </span>
      ))}
      <span className="progress-steps__label">
        Step {step} of {total}
      </span>
    </div>
  );
}

const AVATAR_COLORS = ["#ffd3a1", "#ffc2e4", "#c9f5a8", "#bfe3ff", "#e3d1ff", "#ffe08a"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, src, size, vambie }: { name: string; src?: string | null; size?: "sm" | "lg"; vambie?: boolean }) {
  const color = AVATAR_COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className={`avatar ${size ? `avatar--${size}` : ""} ${vambie ? "avatar--vambie" : ""}`} style={vambie ? undefined : { background: color }}>
      {vambie ? <Mascot name="peek" style={{ width: "120%", marginTop: "18%" }} /> : src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}

export function BottomSheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="bsheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="bsheet__grip" />
        {children}
      </div>
    </>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <IconSpinner size={34} />
      <p className="t-small" style={{ marginTop: 10 }}>
        {label}
      </p>
    </div>
  );
}
