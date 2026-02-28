// KACHERI FRONTEND/src/components/jaal/GuidePanel.tsx
// AI Guide actions panel — Slice S4 (Phase B)
//
// Summarize, Extract Links, Compare — with preview-before-approval flow.
// State persists to localStorage. All actions call backend API (S5).

import { useState, useEffect, useCallback } from 'react';
import { jaalApi } from '../../api/jaal';
import type { JaalProof, GuideResponse, PolicyEvaluation } from '../../api/jaal';

/* ---------- Types ---------- */

type GuideProvider = 'local' | 'openai' | 'anthropic';
type GuideAction = 'summarize' | 'extract_links' | 'compare';

interface GuideState {
  provider: GuideProvider;
  model: string;
  zeroRetention: boolean;
  compareUrl: string;
}

interface PreviewData {
  action: GuideAction;
  policy: PolicyEvaluation | null;
  egressPlan: { provider: string; approxChars: number; destination: string };
}

const DEFAULT_MODELS: Record<GuideProvider, string> = {
  local: '',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

const STORAGE_KEY = 'jaal_guideState';

function loadGuideState(): GuideState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GuideState>;
      return {
        provider: parsed.provider ?? 'local',
        model: parsed.model ?? '',
        zeroRetention: parsed.zeroRetention ?? false,
        compareUrl: parsed.compareUrl ?? '',
      };
    }
  } catch {
    /* ignore */
  }
  return { provider: 'local', model: '', zeroRetention: false, compareUrl: '' };
}

function saveGuideState(state: GuideState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/* ---------- Component ---------- */

interface GuidePanelProps {
  currentUrl: string;
  pageContent: string;
  onProofCreated?: (proof: JaalProof) => void;
}

export function GuidePanel({ currentUrl, pageContent, onProofCreated }: GuidePanelProps) {
  const [guideState, setGuideState] = useState<GuideState>(loadGuideState);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<GuideResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist guide state changes
  useEffect(() => {
    saveGuideState(guideState);
  }, [guideState]);

  const updateState = useCallback(
    (patch: Partial<GuideState>) => {
      setGuideState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const effectiveModel = guideState.model || DEFAULT_MODELS[guideState.provider];

  /* ---- Preview step ---- */

  const requestPreview = useCallback(
    async (action: GuideAction) => {
      setError(null);
      setResult(null);

      // Build egress plan for user to review
      const egressPlan = {
        provider: guideState.provider,
        approxChars: pageContent.length,
        destination:
          guideState.provider === 'local'
            ? 'Local processing (no egress)'
            : `${guideState.provider} API (${effectiveModel})`,
      };

      // Check policy
      let policy: PolicyEvaluation | null = null;
      try {
        policy = await jaalApi.evaluatePolicy({
          action,
          url: currentUrl,
          mode: 'guide',
        });
      } catch {
        // Policy service may not be available (S5 not implemented)
        // Proceed without policy check
      }

      setPreview({ action, policy, egressPlan });
    },
    [guideState.provider, effectiveModel, currentUrl, pageContent.length],
  );

  /* ---- Execute action ---- */

  const executeAction = useCallback(async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);

    try {
      let response: GuideResponse;

      switch (preview.action) {
        case 'summarize':
          response = await jaalApi.summarize({ url: currentUrl, content: pageContent });
          break;
        case 'extract_links':
          response = await jaalApi.extractLinks({ url: currentUrl, content: pageContent });
          break;
        case 'compare':
          response = await jaalApi.compare({
            urlA: currentUrl,
            contentA: pageContent,
            urlB: guideState.compareUrl,
            contentB: '', // Content B fetched server-side
          });
          break;
      }

      setResult(response);
      setPreview(null);

      // If proof was created, notify parent
      if (response.proofId && onProofCreated) {
        try {
          const proof = await jaalApi.getProof(response.proofId);
          onProofCreated(proof);
        } catch {
          /* proof fetch is best-effort */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [preview, currentUrl, pageContent, guideState.compareUrl, onProofCreated]);

  const cancelPreview = useCallback(() => {
    setPreview(null);
  }, []);

  const hasContent = currentUrl.length > 0;

  return (
    <div className="guide-panel" role="region" aria-label="AI Guide">
      {/* Provider Selection */}
      <div className="guide-section">
        <div className="guide-section-title">Provider</div>
        <div className="guide-provider-group">
          {(['local', 'openai', 'anthropic'] as const).map((p) => (
            <button
              key={p}
              className={`guide-provider-btn${guideState.provider === p ? ' active' : ''}`}
              onClick={() => updateState({ provider: p })}
              type="button"
              aria-pressed={guideState.provider === p}
            >
              {p === 'local' ? 'Local' : p === 'openai' ? 'OpenAI' : 'Anthropic'}
            </button>
          ))}
        </div>
      </div>

      {/* Model Input */}
      <div className="guide-section">
        <div className="guide-section-title">Model</div>
        <input
          className="guide-input"
          type="text"
          value={guideState.model}
          onChange={(e) => updateState({ model: e.target.value })}
          placeholder={DEFAULT_MODELS[guideState.provider] || 'auto'}
          aria-label="Model name"
        />
      </div>

      {/* Zero Retention */}
      {guideState.provider !== 'local' && (
        <label className="guide-checkbox-row">
          <input
            type="checkbox"
            checked={guideState.zeroRetention}
            onChange={(e) => updateState({ zeroRetention: e.target.checked })}
          />
          <span>Zero data retention</span>
        </label>
      )}

      {/* Compare URL */}
      <div className="guide-section">
        <div className="guide-section-title">Compare URL</div>
        <input
          className="guide-input"
          type="url"
          value={guideState.compareUrl}
          onChange={(e) => updateState({ compareUrl: e.target.value })}
          placeholder="https://example.com/page-b"
          aria-label="Comparison URL"
        />
      </div>

      {/* Action Buttons */}
      <div className="guide-section">
        <div className="guide-section-title">Actions</div>
        <div className="guide-actions">
          <button
            className="jaal-action-btn"
            onClick={() => requestPreview('summarize')}
            disabled={!hasContent || loading || preview !== null}
            type="button"
          >
            Summarize
          </button>
          <button
            className="jaal-action-btn"
            onClick={() => requestPreview('extract_links')}
            disabled={!hasContent || loading || preview !== null}
            type="button"
          >
            Extract Links
          </button>
          <button
            className="jaal-action-btn"
            onClick={() => requestPreview('compare')}
            disabled={
              !hasContent ||
              !guideState.compareUrl ||
              loading ||
              preview !== null
            }
            type="button"
          >
            Compare
          </button>
        </div>
      </div>

      {/* Preview / Approval */}
      {preview && (
        <div className="jaal-preview" role="dialog" aria-label="Action preview">
          <div className="jaal-preview-header">
            <span className="jaal-preview-badge allowed">
              {preview.action.replace('_', ' ')}
            </span>
            {preview.policy && (
              <span
                className={`jaal-preview-badge ${preview.policy.allowed ? 'allowed' : 'denied'}`}
              >
                {preview.policy.allowed ? 'Policy: Allow' : 'Policy: Deny'}
              </span>
            )}
          </div>

          <div className="jaal-preview-section">
            <div className="jaal-preview-section-title">Egress Plan</div>
            <div className="jaal-preview-section-body">
              Destination: {preview.egressPlan.destination}
              <br />
              Approx. data: ~{Math.round(preview.egressPlan.approxChars / 1000)}K chars
            </div>
          </div>

          {preview.policy && !preview.policy.allowed && (
            <div className="jaal-preview-section">
              <div className="jaal-preview-section-title">Denial Reasons</div>
              <div className="jaal-preview-section-body">
                {preview.policy.reasons.join('; ')}
              </div>
            </div>
          )}

          <div className="jaal-preview-actions">
            <button
              className="jaal-action-btn"
              onClick={cancelPreview}
              type="button"
            >
              Cancel
            </button>
            <button
              className="jaal-action-btn primary"
              onClick={executeAction}
              disabled={preview.policy !== null && !preview.policy.allowed}
              type="button"
            >
              Approve &amp; Execute
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="jaal-skeleton">
          <div className="jaal-skeleton-row">
            <div className="jaal-skeleton-bar" style={{ width: '100%', height: 16 }} />
          </div>
          <div className="jaal-skeleton-row">
            <div className="jaal-skeleton-bar" style={{ width: '75%', height: 12 }} />
          </div>
          <div className="jaal-skeleton-row">
            <div className="jaal-skeleton-bar" style={{ width: '60%', height: 12 }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="jaal-error" role="alert">{error}</div>}

      {/* Result Output */}
      {result && (
        <div className="guide-output">
          <div className="guide-output-header">
            <span className="guide-output-title">Result</span>
            {result.proofId && (
              <span className="guide-proof-link">
                Proof: {result.proofId.slice(0, 12)}...
              </span>
            )}
          </div>
          {result.result}
        </div>
      )}
    </div>
  );
}
