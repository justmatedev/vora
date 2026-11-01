import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
export function TemporaryNotice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const remaining = useRef(6000),
    dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  useEffect(() => {
    if (paused) return;
    const started = Date.now(),
      timer = window.setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused]);
  return (
    <div
      className="compact-confirmation"
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <Check size={14} />
      <span>{text}</span>
      <button className="icon-button" aria-label="Dispensar confirmação" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
