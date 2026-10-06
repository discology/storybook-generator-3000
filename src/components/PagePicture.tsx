import type { CSSProperties } from "react";

// A page's illustration, shaped by its picture size: vignettes fade into the
// paper, framed pictures sit in a thin ink frame, full and wordless pages are
// tall. Pages made before picture sizes existed keep the original wide format.
const VIGNETTE_MASK = "radial-gradient(ellipse 62% 62% at 50% 50%, #000 58%, transparent 76%)";

export default function PagePicture({ src, size, alt, dim = false }: { src: string; size: string; alt: string; dim?: boolean }) {
  const base: CSSProperties = { display: "block", objectFit: "cover", opacity: dim ? 0.4 : 1 };
  switch (size) {
    case "vignette":
      return (
        <img
          src={src}
          alt={alt}
          style={{ ...base, width: "78%", margin: "0 auto", aspectRatio: "1", maskImage: VIGNETTE_MASK, WebkitMaskImage: VIGNETTE_MASK }}
        />
      );
    case "framed":
      return <img src={src} alt={alt} style={{ ...base, width: "88%", margin: "0 auto", aspectRatio: "1", border: "2px solid #3b3227" }} />;
    case "full":
    case "wordless":
      return <img src={src} alt={alt} style={{ ...base, width: "100%", aspectRatio: "2 / 3" }} />;
    default:
      return <img src={src} alt={alt} style={{ ...base, width: "100%", aspectRatio: "3 / 2", borderRadius: 14 }} />;
  }
}
