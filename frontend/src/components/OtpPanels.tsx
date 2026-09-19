import { useEffect, useRef, useState } from "react";

/**
 * The code the sending facility has just been issued.
 *
 * Shown once, to the issuing console only. The other console is told a code
 * exists but never receives it — that is the whole point of the handshake, so
 * this component is deliberately the only place a code is ever rendered.
 */
export function IssuedCodeCard({
  code,
  title,
  instruction,
  expiresAt,
}: {
  code: string;
  title: string;
  instruction: string;
  expiresAt?: string;
}) {
  const remaining = useCountdown(expiresAt);

  return (
    <div className="rounded-[14px] p-5" style={{ background: "#0B2E13", border: "1px solid #1A5C2A" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#7FD492" }}>
        {title}
      </p>

      <p
        className="text-[34px] font-semibold text-white mt-2 font-mono"
        style={{ letterSpacing: "0.22em" }}
      >
        {code}
      </p>

      <p className="text-[13px] mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.68)" }}>
        {instruction}
      </p>

      {remaining !== null && (
        <p className="text-[12px] mt-3" style={{ color: remaining > 0 ? "#7FD492" : "#FF9F8A" }}>
          {remaining > 0 ? `Valid for ${formatDuration(remaining)}` : "Expired — issue a new code"}
        </p>
      )}
    </div>
  );
}

/** Six-digit entry with paste support and per-box focus movement. */
export function CodeEntry({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
}: {
  length?: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, digit: string) {
    const next = value.padEnd(length, " ").split("");
    next[index] = digit;
    const joined = next.join("").replace(/\s/g, "");
    onChange(joined);
    return joined;
  }

  function handleChange(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setDigit(index, "");
      return;
    }

    // A paste fills forward from the focused box rather than one character.
    if (digits.length > 1) {
      const merged = (value.slice(0, index) + digits).slice(0, length);
      onChange(merged);
      const focus = Math.min(merged.length, length - 1);
      refs.current[focus]?.focus();
      if (merged.length === length) onComplete?.(merged);
      return;
    }

    const joined = setDigit(index, digits);
    if (index < length - 1) refs.current[index + 1]?.focus();
    if (joined.length === length) onComplete?.(joined);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  }

  return (
    <div className="flex gap-2">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          disabled={disabled}
          value={value[index] ?? ""}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          className="w-11 h-13 text-center text-[20px] font-semibold font-mono bg-white border rounded-[10px] focus:outline-none disabled:opacity-50"
          style={{
            borderColor: value[index] ? "#0071E3" : "#D8D8DC",
            borderWidth: "1.5px",
            height: "52px",
            color: "#1D1D1F",
          }}
        />
      ))}
    </div>
  );
}

function useCountdown(expiresAt?: string): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return;
    }
    // The API sends naive UTC timestamps; append Z so the browser does not
    // read them as local time and show a wrong countdown.
    const target = new Date(expiresAt.endsWith("Z") ? expiresAt : `${expiresAt}Z`).getTime();

    function tick() {
      setRemaining(Math.max(0, Math.round((target - Date.now()) / 1000)));
    }

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return remaining;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}
