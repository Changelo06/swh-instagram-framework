import { memo, useEffect, useRef, useState } from "react";

// Two-stage confirm: first click arms, second click fires. Auto-disarms after
// `armedMs` if the user doesn't follow through.
function ConfirmAction({
  onConfirm,
  label = "RETRY",
  armedLabel = "CONFIRM",
  Icon,
  ArmedIcon,
  disabled,
  armedMs = 3000,
  tone = "warn", // "warn" (yellow) | "danger" (red) | "neutral"
  size = "default",
  title,
}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!armed) return;
    timerRef.current = setTimeout(() => setArmed(false), armedMs);
    return () => clearTimeout(timerRef.current);
  }, [armed, armedMs]);

  const armColor =
    tone === "danger" ? "var(--tac-danger)" : tone === "warn" ? "var(--tac-warning)" : "var(--tac-accent)";

  const click = () => {
    if (disabled) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onConfirm?.();
  };

  const padding = size === "sm" ? "5px 10px" : "6px 12px";
  const fontSize = size === "sm" ? 12 : 12.5;

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled}
      title={title}
      style={{
        background: armed ? armColor : "transparent",
        border: armed
          ? `1px solid ${armColor}`
          : "1px solid var(--tac-border)",
        color: armed ? "var(--tac-bg)" : "var(--tac-fg)",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize,
        fontWeight: armed ? 600 : 500,
        borderRadius: 6,
        padding,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        opacity: disabled ? 0.4 : 1,
        transition: "background 100ms, border-color 100ms, color 100ms",
      }}
      onMouseEnter={(e) => {
        if (disabled || armed) return;
        e.currentTarget.style.borderColor = armColor;
      }}
      onMouseLeave={(e) => {
        if (disabled || armed) return;
        e.currentTarget.style.borderColor = "var(--tac-border)";
      }}
    >
      {armed && ArmedIcon ? (
        <ArmedIcon size={fontSize + 2} weight="bold" />
      ) : (
        Icon && <Icon size={fontSize + 2} weight="regular" />
      )}
      {armed ? armedLabel : label}
    </button>
  );
}

export default memo(ConfirmAction);
