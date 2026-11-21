import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface HoldToConfirmButtonProps {
  label: ReactNode;
  holdingLabel?: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  durationMs?: number;
  className?: string;
}

export default function HoldToConfirmButton({
  label,
  holdingLabel,
  onConfirm,
  disabled = false,
  durationMs = 2000,
  className = "",
}: HoldToConfirmButtonProps) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || confirmedRef.current || timerRef.current) return;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      confirmedRef.current = true;
      setHolding(false);
      onConfirmRef.current();
      setTimeout(() => {
        confirmedRef.current = false;
      }, 400);
    }, durationMs);
  }, [disabled, durationMs]);

  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  useEffect(() => () => cancel(), [cancel]);

  return (
    <button
      type="button"
      className={`btn btn--caps btn-hold ${disabled ? "" : "btn--danger-solid"} ${holding ? "btn-hold--active" : ""} ${className}`.trim()}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.repeat) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={cancel}
      aria-describedby={disabled ? undefined : "hold-confirm-hint"}
    >
      <span className="btn-hold__label">{holding && holdingLabel ? holdingLabel : label}</span>
      <span className="btn-hold__fill" aria-hidden="true">
        <span className="btn-hold__label">{holding && holdingLabel ? holdingLabel : label}</span>
      </span>
    </button>
  );
}
