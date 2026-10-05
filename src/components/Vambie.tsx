type Mood = "happy" | "worried" | "celebrating" | "curious" | "sleepy";

interface VambieProps {
  mood?: Mood;
  size?: number;
  className?: string;
}

export default function Vambie({ mood = "happy", size = 96, className }: VambieProps) {
  const armsUp = mood === "celebrating";
  const eyesUp = mood === "curious";
  const eyesClosed = mood === "sleepy";
  const browsDown = mood === "worried";

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="vambie-body" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#6FEAEA" />
          <stop offset="55%" stopColor="#2FD4D4" />
          <stop offset="100%" stopColor="#1CB8B8" />
        </radialGradient>
      </defs>

      {/* arms */}
      <ellipse
        cx={armsUp ? 16 : 14}
        cy={armsUp ? 42 : 62}
        rx="9"
        ry="7"
        fill="#2FD4D4"
        transform={armsUp ? "rotate(-25 16 42)" : undefined}
      />
      <ellipse
        cx={armsUp ? 84 : 86}
        cy={armsUp ? 42 : 62}
        rx="9"
        ry="7"
        fill="#2FD4D4"
        transform={armsUp ? "rotate(25 84 42)" : undefined}
      />

      {/* body */}
      <circle cx="50" cy="52" r="38" fill="url(#vambie-body)" />

      {/* brows (worried only) */}
      {browsDown && (
        <>
          <path d="M 28 38 L 42 34" stroke="#0A3A3A" strokeWidth="3" strokeLinecap="round" />
          <path d="M 72 38 L 58 34" stroke="#0A3A3A" strokeWidth="3" strokeLinecap="round" />
        </>
      )}

      {/* eyes */}
      {eyesClosed ? (
        <>
          <path d="M 30 44 Q 37 48 44 44" stroke="#0A3A3A" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 56 44 Q 63 48 70 44" stroke="#0A3A3A" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="37" cy="44" rx="11" ry="13" fill="white" />
          <ellipse cx="63" cy="44" rx="11" ry="13" fill="white" />
          <circle cx={eyesUp ? 39 : 37} cy={eyesUp ? 39 : 46} r="5.5" fill="#111" />
          <circle cx={eyesUp ? 65 : 63} cy={eyesUp ? 39 : 46} r="5.5" fill="#111" />
        </>
      )}

      {/* mouth + fangs */}
      <path d="M 40 64 Q 50 72 60 64" stroke="#0A3A3A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 43 64 L 46 70 L 49 64 Z" fill="white" />
      <path d="M 57 64 L 54 70 L 51 64 Z" fill="white" />

      {/* belly highlight */}
      <ellipse cx="38" cy="34" rx="10" ry="6" fill="#ffffff" opacity="0.25" />
    </svg>
  );
}
