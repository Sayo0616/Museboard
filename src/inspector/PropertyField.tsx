import { useEffect, useRef, useState } from "react";
import { Input } from "../ui/Input";

type PropertyFieldProps = {
  label: string;
  value: string | number;
  type?: "text" | "number";
  min?: number;
  max?: number;
  onEditStart?: () => void;
  onPreview?: (value: string | number) => void;
  onCommit: (value: string | number) => void;
  onCancel?: () => void;
};

export function PropertyField({
  label,
  value,
  type = "text",
  min,
  max,
  onEditStart,
  onPreview,
  onCommit,
  onCancel,
}: PropertyFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraft(String(value));
    }
  }, [value]);

  const parseDraft = (nextDraft: string): string | number | null => {
    if (type !== "number") return nextDraft;
    const trimmed = nextDraft.trim();
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return clampNumber(parsed, min, max);
  };

  const beginEditing = () => {
    if (isEditingRef.current) return;
    isEditingRef.current = true;
    onEditStart?.();
  };

  const resetDraft = () => {
    isEditingRef.current = false;
    setDraft(String(value));
    onCancel?.();
  };

  const commitDraft = () => {
    if (!isEditingRef.current) return;
    const parsed = parseDraft(draft);

    if (parsed === null) {
      resetDraft();
      return;
    }

    isEditingRef.current = false;
    const nextDraft = String(parsed);
    setDraft(nextDraft);
    onPreview?.(parsed);
    onCommit(parsed);
  };

  return (
    <label className="property-field">
      <span>{label}</span>
      <Input
        type="text"
        inputMode={type === "number" ? "decimal" : undefined}
        value={draft}
        onFocus={beginEditing}
        onChange={(event) => {
          beginEditing();
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const parsed = parseDraft(nextDraft);
          if (parsed !== null) {
            onPreview?.(parsed);
          }
        }}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            resetDraft();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function clampNumber(value: number, min?: number, max?: number) {
  let next = value;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
}
