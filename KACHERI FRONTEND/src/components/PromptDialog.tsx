// frontend/src/components/PromptDialog.tsx
import React, { useEffect, useState } from "react";
import "./promptDialog.css";

export type PromptDialogMode = "prompt" | "confirm";

export interface PromptDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** "prompt" = show text input, "confirm" = just message + buttons */
  mode?: PromptDialogMode;
  title: string;
  description?: string;
  /** Initial value for the input when mode === "prompt" */
  initialValue?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Label for the primary action button (defaults to "OK") */
  confirmLabel?: string;
  /** Label for the cancel button (defaults to "Cancel") */
  cancelLabel?: string;
  /** Show a subtle error line under the input (optional) */
  errorMessage?: string | null;
  /** Disable buttons and show "busy" state while saving (optional) */
  loading?: boolean;
  /** Auto-focus the input when the dialog opens */
  autoFocus?: boolean;
  /**
   * Called when the user confirms.
   * For mode="prompt" this receives the current input value.
   * For mode="confirm" this receives undefined.
   */
  onConfirm: (value?: string) => void;
  /** Called when the user cancels or clicks outside the dialog. */
  onCancel: () => void;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  open,
  mode = "prompt",
  title,
  description,
  initialValue = "",
  placeholder,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  errorMessage,
  loading = false,
  autoFocus = true,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue ?? "");

  // Reset value when the dialog is (re)opened or initialValue changes
  useEffect(() => {
    if (open) {
      setValue(initialValue ?? "");
    }
  }, [open, initialValue]);

  if (!open) return null;

  const isPrompt = mode === "prompt";

  const handleConfirm = () => {
    if (loading) return;
    if (isPrompt) {
      onConfirm(value);
    } else {
      onConfirm(undefined);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    onCancel();
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      handleCancel();
    }
    if (e.key === "Enter" && isPrompt) {
      // Allow Enter to confirm from the input
      if ((e.target as HTMLElement).tagName === "INPUT") {
        e.preventDefault();
        handleConfirm();
      }
    }
  };

  const confirmDisabled =
    loading || (isPrompt && value.trim().length === 0);

  const backdropClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    // Only close if the click is on the backdrop, not inside the modal
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  return (
    <div
      className="bk-modal-backdrop"
      onMouseDown={backdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bk-prompt-title"
    >
      <div
        className="bk-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="bk-modal-header">
          <h2 id="bk-prompt-title" className="bk-modal-title">
            {title}
          </h2>
          {description && (
            <p className="bk-modal-description">{description}</p>
          )}
        </header>

        {isPrompt && (
          <div className="bk-modal-body">
            <input
              className="bk-modal-input"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              autoFocus={autoFocus}
            />
          </div>
        )}

        {errorMessage && (
          <div className="bk-modal-error">{errorMessage}</div>
        )}

        <footer className="bk-modal-actions">
          <button
            type="button"
            className="bk-button"
            onClick={handleCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="bk-button bk-button-primary"
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {loading ? "Saving…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PromptDialog;
