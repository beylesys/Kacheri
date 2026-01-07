// KACHERI FRONTEND/src/components/ProofOnboardingModal.tsx
// Phase 5 - P3.1: Multi-step onboarding wizard for the proof system

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./proofOnboardingModal.css";

/* ---------- localStorage Keys ---------- */
export const ONBOARDING_KEYS = {
  completed: "kacheri:proofOnboardingCompleted",
  dismissed: "kacheri:proofOnboardingDismissed",
  version: "kacheri:proofOnboardingVersion",
} as const;

export const CURRENT_ONBOARDING_VERSION = "1";

/* ---------- Helper: Should show onboarding? ---------- */
export function shouldShowOnboarding(): boolean {
  try {
    const dismissed = localStorage.getItem(ONBOARDING_KEYS.dismissed) === "1";
    if (dismissed) return false;

    const completed = localStorage.getItem(ONBOARDING_KEYS.completed) === "1";
    const version = localStorage.getItem(ONBOARDING_KEYS.version);

    // Show if not completed or version is old
    if (!completed) return true;
    if (version !== CURRENT_ONBOARDING_VERSION) return true;

    return false;
  } catch {
    return false;
  }
}

/* ---------- Step Content ---------- */
interface StepContent {
  icon: string;
  title: string;
  description: string;
  details?: string[];
}

const STEPS: StepContent[] = [
  {
    icon: "🛡️",
    title: "Welcome to Kacheri's Proof System",
    description:
      "Every document action is cryptographically recorded for complete auditability. This ensures you can always verify what happened and when.",
  },
  {
    icon: "📄",
    title: "Export Verification",
    description:
      "When you export to PDF or DOCX, we store a SHA-256 hash. You can verify the file hasn't been modified since export.",
    details: [
      "Automatic hash generation on export",
      "One-click verification anytime",
      "Detect tampering instantly",
    ],
  },
  {
    icon: "🤖",
    title: "AI Action Tracking",
    description:
      "Every AI compose or rewrite is logged with full provenance. Nothing is hidden.",
    details: [
      "Provider & model recorded",
      "Full prompt text stored",
      "Input/output hashes for verification",
    ],
  },
  {
    icon: "📊",
    title: "Understanding Health Badges",
    description:
      "Documents show health badges indicating their proof verification status. Here's what each means:",
    details: [
      "🟢 Healthy — All proofs verified",
      "🟡 Stale — Needs re-verification",
      "🔴 Failed — Verification issues detected",
      "⚫ Unverified — Proofs not yet checked",
    ],
  },
];

/* ---------- Props ---------- */
export interface ProofOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

/* ---------- Component ---------- */
export default function ProofOnboardingModal({
  isOpen,
  onClose,
  onComplete,
}: ProofOnboardingModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const isFirstStep = step === 0;
  const isLastStep = step === STEPS.length - 1;
  const currentStep = STEPS[step];

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setDontShowAgain(false);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(ONBOARDING_KEYS.dismissed, "1");
      } catch {
        // Ignore storage errors
      }
    }
    onClose();
  }, [dontShowAgain, onClose]);

  const handleComplete = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_KEYS.completed, "1");
      localStorage.setItem(ONBOARDING_KEYS.version, CURRENT_ONBOARDING_VERSION);
      if (dontShowAgain) {
        localStorage.setItem(ONBOARDING_KEYS.dismissed, "1");
      }
    } catch {
      // Ignore storage errors
    }
    onComplete();
  }, [dontShowAgain, onComplete]);

  const handleViewDocs = useCallback(() => {
    handleComplete();
    navigate("/help/proofs");
  }, [handleComplete, navigate]);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      handleComplete();
    } else {
      setStep((s) => s + 1);
    }
  }, [isLastStep, handleComplete]);

  const handlePrevious = useCallback(() => {
    if (!isFirstStep) {
      setStep((s) => s - 1);
    }
  }, [isFirstStep]);

  if (!isOpen) return null;

  return (
    <div className="onboarding-backdrop" onClick={handleClose}>
      <div className="onboarding-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          className="onboarding-close"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
        >
          ×
        </button>

        {/* Content */}
        <div className="onboarding-content">
          <div className="onboarding-icon">{currentStep.icon}</div>
          <h2 className="onboarding-title">{currentStep.title}</h2>
          <p className="onboarding-description">{currentStep.description}</p>

          {currentStep.details && (
            <ul className="onboarding-details">
              {currentStep.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Don't show again checkbox (only on last step) */}
        {isLastStep && (
          <label className="onboarding-checkbox">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>Don't show this again</span>
          </label>
        )}

        {/* Progress dots */}
        <div className="onboarding-progress">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === step ? "active" : ""}`}
              onClick={() => setStep(i)}
              role="button"
              tabIndex={0}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="onboarding-nav">
          {isFirstStep ? (
            <button className="onboarding-btn secondary" onClick={handleClose}>
              Skip
            </button>
          ) : (
            <button className="onboarding-btn secondary" onClick={handlePrevious}>
              ← Previous
            </button>
          )}

          <div className="onboarding-nav-right">
            {isLastStep && (
              <button className="onboarding-btn tertiary" onClick={handleViewDocs}>
                View Docs →
              </button>
            )}
            <button className="onboarding-btn primary" onClick={handleNext}>
              {isLastStep ? "Get Started" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
