import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import clsx from "clsx";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconInfo,
  IconSpinner,
} from "./icons";

// Baby Vambie artwork in the books' ink and wash, painted from the book-style reference (public/art/book).
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
  // Ink-and-wash poses with transparent paper (VSB-124).
  return <img src={`/art/book/vambie-${name}.webp`} alt="" className={className} style={style} draggable={false} />;
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

// A checkbox for rows that are already a <label> (the whole row toggles it).
export function CheckMark({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <>
      <input type="checkbox" className="check-input" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="check__box" aria-hidden="true">
        <IconCheck size={18} strokeWidth={3.4} />
      </span>
    </>
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
  const count = Math.max(1, options.length);
  const activeIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const gapPx = dark ? 4 : 8;
  const padPx = dark ? 4 : 0;
  const rightIdx = count - 1 - activeIdx;
  const totalGaps = (count - 1) * gapPx;
  const itemSubtract = `${(2 * padPx + totalGaps) / count}px`;
  const pct = 100 / count;
  const leftExpr = `calc(${padPx}px + ${activeIdx * pct}% - ${activeIdx} * ${itemSubtract} + ${activeIdx * gapPx}px)`;
  const rightExpr = `calc(${padPx}px + ${rightIdx * pct}% - ${rightIdx} * ${itemSubtract} + ${rightIdx * gapPx}px)`;
  const clipPath = `inset(${padPx}px ${rightExpr} ${padPx}px ${leftExpr} round ${dark ? "999px" : "14px"})`;

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
      <div className="seg__overlay" style={{ clipPath }} aria-hidden="true">
        {options.map((o) => (
          <span key={o.value} className="seg__btn seg__btn--overlay">
            {o.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MorphSlot<T extends string>({
  active,
  items,
  className,
}: {
  active: T;
  items: { key: T; content: ReactNode }[];
  className?: string;
}) {
  return (
    <span className={`morph-slot ${className ?? ""}`.trim()}>
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <span
            key={item.key}
            className={`morph-slot__item ${isActive ? "morph-slot__item--active" : ""}`.trim()}
            aria-hidden={!isActive || undefined}
          >
            {item.content}
          </span>
        );
      })}
    </span>
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

const firstChar = (part: string) => {
  const chars = Array.from(part);
  return chars.find((c) => !/^[\p{P}\p{S}]$/u.test(c) || /\p{Extended_Pictographic}/u.test(c)) ?? "";
};

export function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => ({ raw: p, ch: firstChar(p) }))
    .filter((p) => p.ch);
  if (parts.length === 0) return "?";
  const first = parts[0].ch;
  const isEmoji = first.codePointAt(0)! > 0xffff || /\p{Extended_Pictographic}/u.test(first);
  if (isEmoji) return first;
  const last = parts.length > 1 ? parts[parts.length - 1].ch : "";
  return (first + last).toUpperCase() || "?";
}

export function Avatar({ name, src, size, vambie }: { name: string; src?: string | null; size?: "sm" | "lg"; vambie?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const color = AVATAR_COLORS[Array.from(name).reduce((n, c) => n + (c.codePointAt(0) ?? 0), 0) % AVATAR_COLORS.length];
  const validSrc = src && src !== failedSrc ? src : null;
  return (
    <span className={`avatar ${size ? `avatar--${size}` : ""} ${vambie ? "avatar--vambie" : ""}`} style={vambie ? undefined : { background: color }}>
      {vambie ? <Mascot name="peek" style={{ width: "120%", marginTop: "18%" }} /> : validSrc ? <img src={validSrc} alt="" onError={() => setFailedSrc(validSrc)} /> : initials(name)}
    </span>
  );
}

export function BottomSheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  return (
    <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="backdrop" />
        <Drawer.Content className="bsheet" aria-describedby={undefined}>
          <div className="bsheet__grip" aria-hidden="true" />
          <Drawer.Title className="sr-only">{label}</Drawer.Title>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function getDialogContainer() {
  if (typeof document === "undefined") return undefined;
  return document.querySelector<HTMLElement>(".admin-shell") ?? document.body;
}

export function ModalDialog({
  open,
  onClose,
  label,
  className,
  style,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  style?: CSSProperties;
  dismissible?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && dismissible && onClose()}>
      <Dialog.Portal container={getDialogContainer()}>
        <Dialog.Overlay className="backdrop" />
        <Dialog.Content
          className={clsx("adm-modal", className)}
          style={style}
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
          onInteractOutside={(e) => !dismissible && e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  danger?: boolean;
  busy?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const activeBusy = busy || running;

  const handleConfirm = async () => {
    if (activeBusy) return;
    setRunning(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !activeBusy && onClose()}>
      <Dialog.Portal container={getDialogContainer()}>
        <Dialog.Overlay className="backdrop" />
        <Dialog.Content
          className="confirm-dialog"
          onEscapeKeyDown={(e) => activeBusy && e.preventDefault()}
          onPointerDownOutside={(e) => activeBusy && e.preventDefault()}
          onInteractOutside={(e) => activeBusy && e.preventDefault()}
        >
          <Dialog.Title className="h-title confirm-dialog__title">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="t-body t-muted confirm-dialog__desc">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Confirm action"}</Dialog.Description>
          )}
          <div className="confirm-dialog__actions">
            <button type="button" className="btn btn--outline btn--sm" disabled={activeBusy} onClick={onClose}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={clsx("btn btn--sm", danger ? "btn--danger-solid" : "btn--lime")}
              disabled={activeBusy}
              onClick={() => void handleConfirm()}
            >
              {activeBusy ? "Working…" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
