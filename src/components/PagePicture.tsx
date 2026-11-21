import { useEffect, useState, type CSSProperties } from "react";

// A page's illustration, shaped by its picture size: vignettes fade into the
// paper, framed pictures sit in a thin ink frame, full and wordless pages are
// tall. Pages made before picture sizes existed keep the original wide format.
const VIGNETTE_MASK = "radial-gradient(ellipse 62% 62% at 50% 50%, #000 58%, transparent 76%)";
const revealedIllustrations = new Set<string>();

export default function PagePicture({
  src,
  size,
  alt,
  dim = false,
  reveal = false,
  instant = false,
}: {
  src: string;
  size: string;
  alt: string;
  dim?: boolean;
  reveal?: boolean;
  instant?: boolean;
}) {
  const [shouldReveal, setShouldReveal] = useState(() => {
    if (instant) return false;
    if (reveal) return true;
    return !revealedIllustrations.has(src);
  });

  useEffect(() => {
    if (instant) {
      revealedIllustrations.add(src);
      setShouldReveal(false);
      return;
    }
    if (reveal) {
      revealedIllustrations.add(src);
      setShouldReveal(true);
      return;
    }
    if (revealedIllustrations.has(src)) {
      setShouldReveal(false);
    } else {
      revealedIllustrations.add(src);
      setShouldReveal(true);
    }
  }, [src, reveal, instant]);

  const cls = shouldReveal && !dim ? "ink-reveal" : undefined;
  const base: CSSProperties = { display: "block", objectFit: "cover", opacity: dim ? 0.4 : undefined };

  switch (size) {
    case "vignette":
      return (
        <img
          key={shouldReveal ? `${src}-reveal` : src}
          src={src}
          alt={alt}
          className={cls}
          style={{ ...base, width: "78%", margin: "0 auto", aspectRatio: "1", maskImage: VIGNETTE_MASK, WebkitMaskImage: VIGNETTE_MASK }}
        />
      );
    case "framed":
      return (
        <img
          key={shouldReveal ? `${src}-reveal` : src}
          src={src}
          alt={alt}
          className={cls}
          style={{ ...base, width: "88%", margin: "0 auto", aspectRatio: "1", border: "2px solid #3b3227" }}
        />
      );
    case "full":
    case "wordless":
      return <img key={shouldReveal ? `${src}-reveal` : src} src={src} alt={alt} className={cls} style={{ ...base, width: "100%", aspectRatio: "2 / 3" }} />;
    default:
      return <img key={shouldReveal ? `${src}-reveal` : src} src={src} alt={alt} className={cls} style={{ ...base, width: "100%", aspectRatio: "3 / 2", borderRadius: 14 }} />;
  }
}
