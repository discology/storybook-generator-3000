import type { ReactNode } from "react";

// Line icons on a 24px grid; size and color follow the surrounding text.
type IconProps = { size?: number; className?: string; filled?: boolean; strokeWidth?: number };

const icon = (paths: (p: IconProps) => ReactNode) =>
  function Icon(props: IconProps) {
    const { size = 22, className, strokeWidth = 2 } = props;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {paths(props)}
      </svg>
    );
  };

export const IconHome = icon(({ filled }) => (
  <>
    <path d="M3 11.2 12 3.8l9 7.4" />
    <path d="M5.2 9.6V20h4.9v-6.2h3.8V20h4.9V9.6" fill={filled ? "currentColor" : "none"} />
  </>
));

export const IconHeart = icon(({ filled }) => (
  <path
    d="M12 20.2s-7.6-4.6-9.4-9.4C1.3 7.3 3.4 4.2 6.7 4.2c2.1 0 3.6 1.2 5.3 3 1.7-1.8 3.2-3 5.3-3 3.3 0 5.4 3.1 4.1 6.6-1.8 4.8-9.4 9.4-9.4 9.4Z"
    fill={filled ? "currentColor" : "none"}
  />
));

export const IconPeople = icon(({ filled }) => (
  <>
    <circle cx="8.5" cy="8" r="3.2" fill={filled ? "currentColor" : "none"} />
    <circle cx="16.8" cy="9" r="2.6" fill={filled ? "currentColor" : "none"} />
    <path d="M2.5 20c0-3.4 2.7-6.1 6-6.1s6 2.7 6 6.1" fill={filled ? "currentColor" : "none"} />
    <path d="M14.9 14.2c2.6.2 5 2.3 5 5.8" />
  </>
));

export const IconSmile = icon(() => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </>
));

export const IconMenu = icon(() => <path d="M4 6.5h16M4 12h16M4 17.5h16" />);

export const IconChevronLeft = icon(() => <path d="M15 18l-6-6 6-6" />);
export const IconChevronRight = icon(() => <path d="M9 18l6-6-6-6" />);
export const IconChevronDown = icon(() => <path d="M6 9l6 6 6-6" />);
export const IconChevronUp = icon(() => <path d="M6 15l6-6 6 6" />);
export const IconSort = icon(() => <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />);

export const IconClose = icon(() => <path d="M6 6l12 12M18 6 6 18" />);
export const IconPlus = icon(() => <path d="M12 5v14M5 12h14" />);

export const IconLock = icon(({ filled }) => (
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill={filled ? "currentColor" : "none"} />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    {filled && <circle cx="12" cy="15.5" r="1.3" fill="#7b24fd" stroke="none" />}
  </>
));

export const IconCheck = icon(() => <path d="M20 6 9 17l-5-5" />);

export const IconWarning = icon(() => (
  <>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
  </>
));

export const IconAlert = icon(() => (
  <>
    <path d="M12 6v8" strokeWidth={3} />
    <circle cx="12" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
  </>
));

export const IconInfo = icon(() => (
  <>
    <path d="M12 11v7" strokeWidth={3} />
    <circle cx="12" cy="6.8" r="1.4" fill="currentColor" stroke="none" />
  </>
));

export const IconHelp = icon(() => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
    <circle cx="12" cy="17" r="0.7" fill="currentColor" />
  </>
));

export const IconClock = icon(() => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 2" />
  </>
));

export const IconMic = icon(({ filled }) => (
  <>
    <rect x="9" y="3" width="6" height="11.5" rx="3" fill={filled ? "currentColor" : "none"} />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
  </>
));

export const IconMail = icon(() => (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </>
));

export const IconPlay = icon(() => <path d="M8 5.2v13.6c0 .7.8 1.1 1.4.7l10-6.8c.5-.4.5-1.1 0-1.4l-10-6.8C8.8 4 8 4.5 8 5.2Z" fill="currentColor" stroke="none" />);

export const IconPause = icon(() => (
  <>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
  </>
));

export const IconSearch = icon(() => (
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.3-4.3" />
  </>
));

export const IconTrash = icon(() => (
  <>
    <path d="M4 7h16" />
    <path d="M9.5 7V4.5h5V7" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v5.5M14 11v5.5" />
  </>
));

export const IconDownload = icon(() => (
  <>
    <path d="M12 4v11" />
    <path d="m7 10.5 5 5 5-5" />
    <path d="M5 20h14" />
  </>
));

export const IconUpload = icon(() => (
  <>
    <path d="M12 16V5" />
    <path d="m7 9.5 5-5 5 5" />
    <path d="M5 20h14" />
  </>
));

export const IconShield = icon(() => (
  <>
    <path d="M12 3 4.8 6v5.2c0 4.5 3 8 7.2 9.8 4.2-1.8 7.2-5.3 7.2-9.8V6Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </>
));

export const IconBell = icon(() => (
  <>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </>
));

export const IconBook = icon(() => (
  <>
    <path d="M12 6.5c-2-1.6-4.6-2.2-8.5-2v14c3.9-.2 6.5.4 8.5 2 2-1.6 4.6-2.2 8.5-2v-14c-3.9-.2-6.5.4-8.5 2Z" />
    <path d="M12 6.5v14" />
  </>
));

export const IconUser = icon(() => (
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </>
));

export const IconSignOut = icon(() => (
  <>
    <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
    <path d="M10.5 12H21M17 8l4 4-4 4" />
  </>
));

export const IconDatabase = icon(() => (
  <>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
    <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
  </>
));

export const IconCoins = icon(() => (
  <>
    <ellipse cx="9" cy="7" rx="6" ry="2.6" />
    <path d="M3 7v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V7" />
    <path d="M9 13.6v3.8c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-4" />
    <path d="M15 11c3.3 0 6 1.2 6 2.6s-2.7 2.6-6 2.6-6-1.2-6-2.6" />
  </>
));

export const IconCalendar = icon(() => (
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>
));

export const IconBookmark = icon(({ filled }) => (
  <path d="M6.5 3.5h11v17L12 16.2l-5.5 4.3Z" fill={filled ? "currentColor" : "none"} />
));

export const IconStar = icon(({ filled }) => (
  <path
    d="m12 3.2 2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8Z"
    fill={filled ? "currentColor" : "none"}
  />
));

export const IconSparkle = icon(() => (
  <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5Z" fill="currentColor" stroke="none" />
));

export const IconEdit = icon(() => (
  <>
    <path d="M4 20h4L19 9l-4-4L4 16Z" />
    <path d="m13.5 6.5 4 4" />
  </>
));

export const IconDots = icon(() => (
  <>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
  </>
));

export const IconDotsVertical = icon(() => (
  <>
    <circle cx="12" cy="5.5" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="18.5" r="1.3" fill="currentColor" />
  </>
));

export const IconGrip = icon(() => (
  <>
    {[6, 12, 18].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1.3" fill="currentColor" stroke="none" />
        <circle cx="15" cy={y} r="1.3" fill="currentColor" stroke="none" />
      </g>
    ))}
  </>
));

export const IconSend = icon(() => (
  <>
    <path d="M21 3 10 14" />
    <path d="M21 3 14.5 21l-4.5-7-7-4.5Z" />
  </>
));

export const IconRefresh = icon(() => (
  <>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4.5V11h-6.5" />
  </>
));

export const IconChat = icon(() => (
  <>
    <path d="M4 5.5h16v10.5H9l-5 4Z" />
  </>
));

export const IconPlayCircle = icon(() => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7l5.5-3.5Z" fill="currentColor" />
  </>
));

export const IconSettings = icon(() => (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>
));

export const IconImage = icon(() => (
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m20.5 16-4.5-4.5L6 19.5" />
  </>
));

export const IconFileText = icon(() => (
  <>
    <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z" />
    <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
  </>
));

export const IconKey = icon(() => (
  <>
    <circle cx="7.5" cy="12" r="3.5" />
    <path d="M11 12h10M17.5 12v3M20.5 12v2.5" />
  </>
));

export const IconWave = icon(() => <path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0" />);

export const IconHold = icon(() => (
  <>
    <rect x="7" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none" />
  </>
));

export const IconTextSize = icon(() => (
  <>
    <path d="M3 18 7.5 6 12 18M4.6 14h5.8" />
    <path d="m13 18 3.5-8.5L20 18M14.2 15.3h4.6" />
  </>
));

export const IconWand = icon(() => (
  <>
    <path d="m4 20 12-12" />
    <path d="M15 4v3M13.5 5.5h3M19 9v2M18 10h2" />
  </>
));

export const IconSpinner = ({ size = 22, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={`spinner ${className ?? ""}`} aria-hidden="true">
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return <circle key={i} cx={12 + Math.cos(a) * 8} cy={12 + Math.sin(a) * 8} r={1.9} fill="currentColor" opacity={0.35 + (i / 8) * 0.65} />;
    })}
  </svg>
);

export const IconArchive = icon(() => (
  <>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9" />
    <path d="M10 13h4" />
  </>
));
