// KACHERI FRONTEND/src/ProofsPanel.tsx
// Phase 5 - P1.3: Enhanced Export Verification Badges
import { memo, useEffect, useState } from "react";
import { EvidenceAPI, ProofHealthAPI } from "./api";
import { canvasApi } from "./api/canvas";
import { PROOF_TOOLTIPS } from "./utils/tooltipHelpers";

type VerificationStatus = 'pass' | 'fail' | 'miss' | 'pending' | 'checking';

type ExportRow = {
  id?: string | number;
  ts: number | string;
  kind?: string;               // 'pdf' | 'docx' | legacy/null
  sha256?: string | null;
  pdfHash?: string | null;     // legacy
  verified?: boolean;
  verificationStatus?: VerificationStatus;
  verifiedAt?: string | null;
  fileName?: string;
  size?: number;
  proof?: any;
};

type ProvRow = {
  id?: string | number;
  ts: number | string;
  actor?: string;
  action: string;
  preview?: string;
  inputSize?: number;
  details?: any;
  [k: string]: any;
};

const FILTERS = ["", "create", "rename", "delete", "export:pdf", "export:docx", "ai:action", "ai:translate", "ai:extraction", "compliance:check", "clause:insert", "knowledge:search", "knowledge:index", "negotiation:analyze", "negotiation:counterproposal", "tts:read_aloud", "stt:dictate", "design:generate", "design:edit", "design:style", "design:export"];

// Format action labels with icons for better readability
const formatAction = (action: string): string => {
  const actionMap: Record<string, string> = {
    "tts:read_aloud": "Read Aloud",
    "stt:dictate": "Dictation",
    "ai:action": "AI Action",
    "ai:compose": "AI Compose",
    "ai:translate": "Translation",
    "ai:extraction": "AI Extraction",
    "export:pdf": "Export PDF",
    "export:docx": "Export DOCX",
    "import:apply": "Import Applied",
    "compliance:check": "Compliance Check",
    "clause:insert": "Clause Insert",
    "knowledge:search": "Knowledge Search",
    "knowledge:index": "Knowledge Index",
    "negotiation:analyze": "Negotiation Analysis",
    "negotiation:counterproposal": "Counterproposal",
    "design:generate": "Design Generate",
    "design:edit": "Design Edit",
    "design:style": "Design Restyle",
    "design:export": "Design Export",
    "design:image": "Design Image",
    "design:content": "Design Content",
    "design:compose": "Design Compose",
    "create": "Created",
    "rename": "Renamed",
    "delete": "Deleted",
  };
  return actionMap[action] || action;
};

// Verification status badge styling (Phase 5 - P1.3)
// Enhanced with centralized tooltips (Phase 5 - P3.2)
function getVerificationBadge(status: VerificationStatus, verified?: boolean, kind?: "pdf" | "docx"): {
  label: string;
  className: string;
  tooltip: string;
} {
  // Map legacy verified boolean to status if no explicit status
  if (status === undefined || status === null) {
    status = verified ? 'pass' : 'pending';
  }

  // Build tooltip with proof type explanation + status
  const kindExplanation = kind ? PROOF_TOOLTIPS.proofTypes[kind] : PROOF_TOOLTIPS.proofTypes.export;

  switch (status) {
    case 'pass':
      return {
        label: 'Verified',
        className: 'badge green',
        tooltip: `${kindExplanation}\n\nStatus: PASS\n${PROOF_TOOLTIPS.verificationBadges.pass}`
      };
    case 'fail':
      return {
        label: 'Failed',
        className: 'badge red',
        tooltip: `${kindExplanation}\n\nStatus: FAIL\n${PROOF_TOOLTIPS.verificationBadges.fail}`
      };
    case 'miss':
      return {
        label: 'Missing',
        className: 'badge',
        tooltip: `${kindExplanation}\n\nStatus: MISSING\n${PROOF_TOOLTIPS.verificationBadges.miss}`
      };
    case 'checking':
      return {
        label: 'Checking...',
        className: 'badge',
        tooltip: `${kindExplanation}\n\nVerifying export hash...`
      };
    case 'pending':
    default:
      return {
        label: 'Unverified',
        className: 'badge red',
        tooltip: `${kindExplanation}\n\nStatus: PENDING\n${PROOF_TOOLTIPS.verificationBadges.pending}`
      };
  }
}

function formatRelativeTime(ts: string | number | null | undefined): string {
  if (!ts) return '';
  try {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

/** Document type labels for extraction provenance display. */
const EXTRACTION_DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Contract',
  invoice: 'Invoice',
  proposal: 'Proposal',
  meeting_notes: 'Meeting Notes',
  report: 'Report',
  other: 'General',
};

/** Render structured card for ai:extraction provenance events. */
function renderExtractionDetails(details: any) {
  const docType = details?.documentType ?? 'unknown';
  const confidence = details?.typeConfidence;
  const anomalyCount = details?.anomalyCount ?? 0;
  const provider = details?.provider;
  const model = details?.model;
  const proofHash = details?.proofHash;

  const typeLabel = EXTRACTION_DOC_TYPE_LABELS[docType] ?? docType;

  const confPct = confidence != null ? `${Math.round(confidence * 100)}%` : null;
  const confClass =
    confidence != null
      ? confidence >= 0.8 ? 'green' : confidence >= 0.5 ? '' : 'red'
      : '';

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{typeLabel}</span>
        {confPct && (
          <span className={`badge ${confClass}`} title="Type confidence">
            {confPct}
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {anomalyCount > 0 && (
          <span className="badge" style={{ fontSize: 10 }}>
            {anomalyCount} anomal{anomalyCount === 1 ? 'y' : 'ies'}
          </span>
        )}
        {provider && model && (
          <span className="muted" style={{ fontSize: 10 }}>
            {provider}/{model}
          </span>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {proofHash.slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Trigger labels for compliance check provenance display. */
const COMPLIANCE_TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  auto_save: 'Auto',
  pre_export: 'Pre-Export',
};

/** Render structured card for compliance:check provenance events. */
function renderComplianceDetails(details: any) {
  const status = details?.status ?? 'unknown';
  const totalPolicies = details?.totalPolicies ?? 0;
  const passed = details?.passed ?? 0;
  const violations = details?.violations ?? 0;
  const warnings = details?.warnings ?? 0;
  const triggeredBy = details?.triggeredBy;
  const proofHash = details?.proofHash;

  const statusClass = status === 'passed' ? 'green' : status === 'failed' ? 'red' : '';
  const statusLabel = status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : status;
  const triggerLabel = triggeredBy ? (COMPLIANCE_TRIGGER_LABELS[triggeredBy] ?? triggeredBy) : null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span className={`badge ${statusClass}`} style={{ fontWeight: 600 }}>
          {statusLabel}
        </span>
        {triggerLabel && (
          <span className="badge" style={{ fontSize: 10 }}>
            {triggerLabel}
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {totalPolicies > 0 && (
          <span className="muted" style={{ fontSize: 10 }}>
            {passed}/{totalPolicies} passed
          </span>
        )}
        {violations > 0 && (
          <span className="badge red" style={{ fontSize: 10 }}>
            {violations} violation{violations === 1 ? '' : 's'}
          </span>
        )}
        {warnings > 0 && (
          <span className="badge" style={{ fontSize: 10, background: 'var(--warning-bg, #fef3c7)', color: 'var(--warning-text, #92400e)' }}>
            {warnings} warning{warnings === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {proofHash.slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Insertion method labels for clause:insert provenance display. */
const CLAUSE_INSERT_METHOD_LABELS: Record<string, string> = {
  manual: 'Manual',
  ai_suggest: 'AI Suggest',
  template: 'Template',
};

/** Render structured card for clause:insert provenance events. */
function renderClauseInsertDetails(details: any) {
  const clauseTitle = details?.clauseTitle ?? 'Unknown Clause';
  const clauseVersion = details?.clauseVersion;
  const insertionMethod = details?.insertionMethod;
  const contentPreview = details?.contentTextPreview;
  const proofHash = details?.proofHash;

  const methodLabel = insertionMethod
    ? (CLAUSE_INSERT_METHOD_LABELS[insertionMethod] ?? insertionMethod)
    : null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{clauseTitle}</span>
        {clauseVersion != null && (
          <span className="badge" style={{ fontSize: 10 }}>
            v{clauseVersion}
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {methodLabel && (
          <span className="badge" style={{ fontSize: 10 }}>
            {methodLabel}
          </span>
        )}
      </div>
      {contentPreview && (
        <div className="muted" style={{ fontSize: 11, marginBottom: 4, fontStyle: 'italic' }}>
          {contentPreview.length > 120
            ? contentPreview.slice(0, 120) + '...'
            : contentPreview}
        </div>
      )}
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {proofHash.slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Render structured card for knowledge:search provenance events. */
function renderKnowledgeSearchDetails(details: any) {
  const query = details?.query ?? details?.queryText ?? 'Unknown query';
  const resultCount = details?.resultCount ?? 0;
  const durationMs = details?.durationMs;
  const proofHash = details?.proofHash ?? details?.hash;

  const durationSec = durationMs != null ? (durationMs / 1000).toFixed(1) : null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontStyle: 'italic' }}>
          {query.length > 80 ? query.slice(0, 80) + '...' : query}
        </span>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span className="badge green" style={{ fontSize: 10 }}>
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </span>
        {durationSec && (
          <span className="muted" style={{ fontSize: 10 }}>
            {durationSec}s
          </span>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {proofHash.slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Mode labels for knowledge:index provenance display. */
const KNOWLEDGE_INDEX_MODE_LABELS: Record<string, string> = {
  full: 'Full Re-index',
  incremental: 'Incremental',
};

/** Render structured card for knowledge:index provenance events. */
function renderKnowledgeIndexDetails(details: any) {
  const mode = details?.mode ?? 'full';
  const docsProcessed = details?.docsProcessed ?? 0;
  const entitiesCreated = details?.entitiesCreated ?? 0;
  const entitiesReused = details?.entitiesReused ?? 0;
  const relationshipsCreated = details?.relationshipsCreated ?? 0;
  const relationshipsUpdated = details?.relationshipsUpdated ?? 0;
  const autoMerged = details?.autoMerged ?? 0;
  const errorCount = details?.errors ?? 0;
  const durationMs = details?.durationMs;
  const proofHash = details?.proofHash ?? details?.hash;

  const modeLabel = KNOWLEDGE_INDEX_MODE_LABELS[mode] ?? mode;
  const durationSec = durationMs != null ? (durationMs / 1000).toFixed(1) : null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="badge" style={{ fontWeight: 600 }}>
          {modeLabel}
        </span>
        {durationSec && (
          <span className="muted" style={{ fontSize: 10 }}>
            {durationSec}s
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span className="muted" style={{ fontSize: 10 }}>
          {docsProcessed} doc{docsProcessed === 1 ? '' : 's'}
        </span>
        <span className="badge green" style={{ fontSize: 10 }}>
          +{entitiesCreated} entities
        </span>
        {entitiesReused > 0 && (
          <span className="muted" style={{ fontSize: 10 }}>
            {entitiesReused} reused
          </span>
        )}
        {relationshipsCreated > 0 && (
          <span className="badge" style={{ fontSize: 10 }}>
            +{relationshipsCreated} relationships
          </span>
        )}
        {relationshipsUpdated > 0 && (
          <span className="muted" style={{ fontSize: 10 }}>
            {relationshipsUpdated} updated
          </span>
        )}
        {autoMerged > 0 && (
          <span className="badge" style={{ fontSize: 10 }}>
            {autoMerged} merged
          </span>
        )}
        {errorCount > 0 && (
          <span className="badge red" style={{ fontSize: 10 }}>
            {errorCount} error{errorCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {proofHash.slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Risk level color mapping for negotiation analysis. */
const RISK_LEVEL_COLORS: Record<string, string> = {
  low: 'green',
  medium: '',
  high: 'red',
  critical: 'red',
};

/** Recommendation labels for negotiation analysis. */
const RECOMMENDATION_LABELS: Record<string, string> = {
  accept: 'Accept',
  reject: 'Reject',
  counter: 'Counter',
  review: 'Review',
};

/** Mode labels for negotiation counterproposal display. */
const COUNTERPROPOSAL_MODE_LABELS: Record<string, string> = {
  balanced: 'Balanced',
  favorable: 'Favorable',
  minimal_change: 'Minimal Change',
};

/** Render structured card for negotiation:analyze provenance events. */
function renderNegotiationAnalyzeDetails(details: any) {
  const isBatch = !!details?.batch;
  const riskLevel = details?.riskLevel;
  const recommendation = details?.recommendation;
  const analyzed = details?.analyzed ?? 0;
  const failed = details?.failed ?? 0;
  const skipped = details?.skipped ?? 0;
  const durationMs = details?.durationMs;
  const fromCache = details?.fromCache;
  const proofHash = details?.proofId;

  const riskClass = riskLevel ? (RISK_LEVEL_COLORS[riskLevel] ?? '') : '';
  const recLabel = recommendation ? (RECOMMENDATION_LABELS[recommendation] ?? recommendation) : null;
  const durationSec = durationMs != null ? (durationMs / 1000).toFixed(1) : null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="badge" style={{ fontWeight: 600 }}>
          {isBatch ? 'Batch Analysis' : 'Change Analysis'}
        </span>
        {durationSec && (
          <span className="muted" style={{ fontSize: 10 }}>
            {durationSec}s
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {isBatch ? (
          <>
            <span className="badge green" style={{ fontSize: 10 }}>
              {analyzed} analyzed
            </span>
            {failed > 0 && (
              <span className="badge red" style={{ fontSize: 10 }}>
                {failed} failed
              </span>
            )}
            {skipped > 0 && (
              <span className="muted" style={{ fontSize: 10 }}>
                {skipped} skipped
              </span>
            )}
          </>
        ) : (
          <>
            {riskLevel && (
              <span className={`badge ${riskClass}`} style={{ fontSize: 10 }}>
                Risk: {riskLevel}
              </span>
            )}
            {recLabel && (
              <span className="badge" style={{ fontSize: 10 }}>
                {recLabel}
              </span>
            )}
            {fromCache && (
              <span className="muted" style={{ fontSize: 10 }}>
                cached
              </span>
            )}
          </>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {String(proofHash).slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Render structured card for negotiation:counterproposal provenance events. */
function renderNegotiationCounterproposalDetails(details: any) {
  const mode = details?.mode;
  const counterproposalId = details?.counterproposalId;
  const proofHash = details?.proofId;

  const modeLabel = mode ? (COUNTERPROPOSAL_MODE_LABELS[mode] ?? mode) : 'Unknown';

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>Counterproposal Generated</span>
        <span className="badge" style={{ fontSize: 10 }}>
          {modeLabel}
        </span>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {counterproposalId && (
          <span className="muted" style={{ fontSize: 10 }}>
            ID: {counterproposalId}
          </span>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {String(proofHash).slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Render structured card for design:generate provenance events. */
function renderDesignGenerateDetails(details: any) {
  const prompt = details?.prompt ?? '';
  const frameCount = details?.frameCount ?? 0;
  const docRefs = details?.docRefs;
  const provider = details?.provider;
  const model = details?.model;
  const proofHash = details?.proofHash;

  const docRefCount = Array.isArray(docRefs) ? docRefs.length : 0;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>Frame Generation</span>
        <span className="badge green" style={{ fontSize: 10 }}>
          {frameCount} frame{frameCount === 1 ? '' : 's'}
        </span>
      </div>
      {prompt && (
        <div className="muted" style={{ fontSize: 11, marginBottom: 4, fontStyle: 'italic' }}>
          {prompt.length > 120 ? prompt.slice(0, 120) + '...' : prompt}
        </div>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {docRefCount > 0 && (
          <span className="badge" style={{ fontSize: 10 }}>
            {docRefCount} doc ref{docRefCount === 1 ? '' : 's'}
          </span>
        )}
        {provider && model && (
          <span className="muted" style={{ fontSize: 10 }}>
            {provider}/{model}
          </span>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {proofHash.slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Render structured card for design:edit provenance events. */
function renderDesignEditDetails(details: any) {
  const prompt = details?.prompt ?? '';
  const frameId = details?.frameId ?? details?.frameModified;
  const provider = details?.provider;
  const model = details?.model;
  const proofHash = details?.proofHash;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>Frame Edit</span>
        {frameId && (
          <span className="badge" style={{ fontSize: 10 }}>
            Frame {typeof frameId === 'string' ? frameId.slice(0, 8) : frameId}
          </span>
        )}
      </div>
      {prompt && (
        <div className="muted" style={{ fontSize: 11, marginBottom: 4, fontStyle: 'italic' }}>
          {prompt.length > 120 ? prompt.slice(0, 120) + '...' : prompt}
        </div>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {provider && model && (
          <span className="muted" style={{ fontSize: 10 }}>
            {provider}/{model}
          </span>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {proofHash.slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Render structured card for design:style provenance events. */
function renderDesignStyleDetails(details: any) {
  const frameIds = details?.frameIds ?? [];
  const frameCount = Array.isArray(frameIds) ? frameIds.length : (details?.frameCount ?? 0);
  const provider = details?.provider;
  const model = details?.model;
  const proofHash = details?.proofHash;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>Frame Restyle</span>
        <span className="badge" style={{ fontSize: 10 }}>
          {frameCount} frame{frameCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {provider && model && (
          <span className="muted" style={{ fontSize: 10 }}>
            {provider}/{model}
          </span>
        )}
      </div>
      {proofHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Proof: {proofHash.slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Render structured card for design:export provenance events. */
function renderDesignExportDetails(details: any) {
  const format = details?.format ?? 'unknown';
  const frameCount = details?.frameCount ?? 0;
  const fileHash = details?.fileHash ?? details?.hash;
  const fileSize = details?.fileSize;
  const exportId = details?.exportId;

  const sizeFmt = fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>Canvas Export</span>
        <span className="badge green" style={{ fontSize: 10 }}>
          {format.toUpperCase()}
        </span>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span className="muted" style={{ fontSize: 10 }}>
          {frameCount} frame{frameCount === 1 ? '' : 's'}
        </span>
        {sizeFmt && (
          <span className="badge" style={{ fontSize: 10 }}>
            {sizeFmt}
          </span>
        )}
        {exportId && (
          <span className="muted" style={{ fontSize: 10 }}>
            ID: {exportId}
          </span>
        )}
      </div>
      {fileHash && (
        <div className="muted" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          Hash: {String(fileHash).slice(0, 24)}...
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 10 }}>
          Raw details
        </summary>
        <pre
          style={{
            background: 'var(--surface)',
            padding: 6,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    </div>
  );
}

type Props = {
  docId: string;
  /** Optional canvas ID — when provided, fetches canvas-scoped provenance instead of doc provenance. */
  canvasId?: string;
  /** When provided, the parent controls visibility. */
  open?: boolean;
  /** Called when the user clicks "×". Parent should set open=false. */
  onClose?: () => void;
  /** Changing this forces a reload (used by workspace proof_added). */
  refreshKey?: number;
};

function ProofsPanelInner({ docId, canvasId, open, onClose, refreshKey = 0 }: Props) {
  // Allow both controlled and uncontrolled usage
  const [internalOpen, setInternalOpen] = useState<boolean>(() => {
    return localStorage.getItem("kacheri:proofsOpen") === "1";
  });

  // Keep internal state aligned when parent toggles
  useEffect(() => {
    if (typeof open === "boolean") setInternalOpen(open);
  }, [open]);

  // Persist preference (so reload keeps last state)
  useEffect(() => {
    localStorage.setItem("kacheri:proofsOpen", internalOpen ? "1" : "0");
  }, [internalOpen]);

  // Key change: child can open itself even if parent passed open=false
  const isOpen = (typeof open === "boolean" ? open : internalOpen) || internalOpen;

  const close = () => {
    if (typeof onClose === "function") onClose();
    setInternalOpen(false);
  };
  const openNow = () => setInternalOpen(true);

  // ---------- Data ----------
  const [exportsList, setExports] = useState<ExportRow[]>([]);
  const [prov, setProv] = useState<ProvRow[]>([]);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [before, setBefore] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [refreshingExports, setRefreshingExports] = useState(false);
  const [verifyingExport, setVerifyingExport] = useState<string | number | null>(null);

  const toNumberTs = (ts: number | string) => (typeof ts === "number" ? ts : Date.parse(ts));
  const fmtTime = (ts: number | string) => new Date(ts).toLocaleString();
  const hash16 = (e: ExportRow) => (e.sha256?.slice?.(0, 16) ?? e.pdfHash?.slice?.(0, 16) ?? "—");

  const inferKind = (e: ExportRow): "pdf" | "docx" | undefined => {
    const k = (e.kind || "").toLowerCase();
    if (k === "pdf" || k === "docx") return k as "pdf" | "docx";
    const name = (e.fileName || "").toLowerCase();
    if (name.endsWith(".pdf")) return "pdf";
    if (name.endsWith(".docx")) return "docx";
    return undefined;
  };

  const downloadHref = (e: ExportRow): string | undefined => {
    const name = e.fileName;
    if (!name) return undefined;
    const k = inferKind(e);
    const enc = encodeURIComponent(name);
    if (k === "pdf")  return `/api/docs/${docId}/exports/pdf/${enc}`;
    if (k === "docx") return `/api/docs/${docId}/exports/docx/${enc}`;
    return undefined;
  };

  const loadExports = async () => {
    setRefreshingExports(true);
    try {
      const rows = await EvidenceAPI.listExports(docId);
      setExports(rows || []);
    } finally {
      setRefreshingExports(false);
    }
  };

  // Verify a single export (Phase 5 - P1.3)
  const verifyExport = async (exportRow: ExportRow) => {
    const id = exportRow.id;
    if (!id) return;

    setVerifyingExport(id);
    // Mark as checking in the UI
    setExports(prev => prev.map(e =>
      e.id === id ? { ...e, verificationStatus: 'checking' as VerificationStatus } : e
    ));

    try {
      const result = await ProofHealthAPI.verifyExport(docId, id);
      setExports(prev => prev.map(e =>
        e.id === id ? {
          ...e,
          verified: result.verified,
          verificationStatus: result.verified ? 'pass' : 'fail' as VerificationStatus,
          verifiedAt: new Date().toISOString()
        } : e
      ));
    } catch (err: any) {
      // On error, mark as failed
      setExports(prev => prev.map(e =>
        e.id === id ? { ...e, verificationStatus: 'fail' as VerificationStatus } : e
      ));
    } finally {
      setVerifyingExport(null);
    }
  };

  const loadProv = async (reset = false) => {
    setLoading(true);
    try {
      const opts = {
        action: actionFilter || undefined,
        limit: 25,
        before: reset ? undefined : before,
      };
      // Use canvas provenance API when canvasId is provided
      const rows: ProvRow[] = canvasId
        ? await canvasApi.listProvenance(canvasId, opts)
        : await EvidenceAPI.listProvenance(docId, opts);

      if (reset) {
        setProv(rows);
        const last = rows[rows.length - 1];
        setBefore(rows.length ? toNumberTs(last.ts) : undefined);
      } else {
        setProv((p) => [...p, ...rows]);
        if (rows.length) {
          const last = rows[rows.length - 1];
          setBefore(toNumberTs(last.ts));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Load on doc/canvas change / initial mount
  useEffect(() => { if (!canvasId) loadExports(); }, [docId, canvasId]);
  useEffect(() => { loadProv(true); }, [docId, canvasId, actionFilter]);

  // **Workspace-driven refresh** (proof_added → parent bumps refreshKey)
  useEffect(() => {
    if (!refreshKey) return;
    // Re-query both lists to surface the new artifact/event quickly.
    loadExports();
    loadProv(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // ---------- Drawer styles ----------
  const drawerStyle: React.CSSProperties = {
    position: "fixed",
    top: 72,                // below sticky toolbar
    right: 0,
    bottom: 16,
    width: 440,
    maxHeight: "calc(100vh - 88px)",
    padding: 14,
    overflow: "auto",
    borderRadius: 12,
    display: "block",       // always mounted; avoid flicker
    zIndex: 2000,           // stay over editor and overlays
    background: "var(--panel)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-md)",
    transform: isOpen ? "translateX(0)" : "translateX(calc(100% + 16px))",
    opacity: isOpen ? 1 : 0.92,
    transition: "transform .20s ease-out, opacity .20s ease-out",
  };

  const tabStyle: React.CSSProperties = {
    position: "fixed",
    top: "40%",
    right: 0,
    zIndex: 2001,
    writingMode: "vertical-rl",
    transform: "rotate(180deg)",
    background: "var(--brand-600)",
    color: "#fff",
    border: "none",
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    padding: "8px 6px",
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(0,0,0,.3)",
  };

  const exportsCount = exportsList.length;
  const provCount = prov.length;

  return (
    <>
      {!isOpen && (
        <button
          aria-label="Open Proofs & Activity"
          style={tabStyle}
          onClick={openNow}
          title="Open Proofs & Activity"
        >
          Proofs
        </button>
      )}

      <div
        id="proofs-panel"
        className="surface"
        role="complementary"
        aria-label="Proofs & Activity"
        style={drawerStyle}
      >
        {/* Header */}
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div className="h2" title={PROOF_TOOLTIPS.features.proofHealth}>Proofs & Activity</div>
            <div className="muted" style={{ fontSize: 12 }}>Verifiable exports and action timeline</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="button sm subtle"
              onClick={() => loadExports()}
              disabled={refreshingExports}
              title="Refresh exports"
            >
              {refreshingExports ? "Refreshing…" : "Refresh"}
            </button>
            <button className="button sm ghost" title="Close" aria-label="Close panel" onClick={close}>×</button>
          </div>
        </div>

        {/* Filters */}
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Filter:</span>
          {FILTERS.map((a) => {
            const isActive = a === actionFilter;
            return (
              <button
                key={a || "all"}
                className={`button sm ${isActive ? "primary" : "subtle"}`}
                aria-pressed={isActive}
                onClick={() => setActionFilter(a)}
                title={a || "all"}
              >
                {a || "all"}
              </button>
            );
          })}
        </div>

        {/* Exports */}
        <div style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <div className="h2">Exports</div>
            <span className="badge">{exportsCount}</span>
          </div>

          {exportsCount === 0 ? (
            <div className="empty">No exports yet.</div>
          ) : (
            <div className="stack">
              {exportsList.map((e) => {
                const href = downloadHref(e);
                const kind = inferKind(e);
                const vBadge = getVerificationBadge(
                  e.verificationStatus as VerificationStatus,
                  e.verified,
                  kind
                );
                const isVerifying = verifyingExport === e.id;
                const verifiedTime = e.verifiedAt ? formatRelativeTime(e.verifiedAt) : null;

                return (
                  <div
                    key={String(e.id ?? `ts:${e.ts}:${e.fileName ?? ""}`)}
                    className="card"
                    style={{ padding: 10, display: "grid", gap: 6 }}
                  >
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600 }}>
                        {e.fileName ? e.fileName : (kind ? kind.toUpperCase() : "Export")}
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>{fmtTime(e.ts)}</span>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="badge">hash {hash16(e)}…</span>
                      {e.size ? <span className="badge">{(e.size / 1024).toFixed(1)} KB</span> : null}
                      {/* Enhanced verification badge - Phase 5 P1.3 */}
                      <span
                        className={vBadge.className}
                        title={vBadge.tooltip}
                        style={{ cursor: 'help' }}
                      >
                        {vBadge.label}
                      </span>
                      {verifiedTime && (
                        <span className="muted" style={{ fontSize: 11 }}>
                          {verifiedTime}
                        </span>
                      )}
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 2 }}>
                      {/* Verify Now button - Phase 5 P1.3 */}
                      {e.id && (
                        <button
                          className="button sm subtle"
                          onClick={() => verifyExport(e)}
                          disabled={isVerifying}
                          title={PROOF_TOOLTIPS.features.verifyNow}
                          style={{ fontSize: 11 }}
                        >
                          {isVerifying ? "Verifying…" : "Verify Now"}
                        </button>
                      )}
                      <div className="spacer" />
                      {href ? (
                        <a
                          href={href}
                          className="button sm subtle"
                          download
                          title={`Download ${kind?.toUpperCase() || "file"}`}
                        >
                          Download
                        </a>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>no file link</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <div className="h2">Timeline</div>
            <span className="badge">{provCount}</span>
          </div>

          {provCount === 0 ? (
            <div className="empty">No events yet.</div>
          ) : (
            <div className="stack">
              {prov.map((p) => {
                const details = p.details ?? p;
                return (
                  <div
                    key={String(p.id ?? `ts:${p.ts}:${p.action}`)}
                    style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}
                  >
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <b>{formatAction(p.action)}</b>{" "}
                        {p.actor ? <small className="muted">by {p.actor}</small> : null}
                      </div>
                      <small className="muted">{fmtTime(p.ts)}</small>
                    </div>
                    {p.preview ? (
                      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                        {p.preview}
                      </div>
                    ) : null}
                    {p.action === 'ai:extraction'
                      ? renderExtractionDetails(details)
                      : p.action === 'compliance:check'
                        ? renderComplianceDetails(details)
                        : p.action === 'clause:insert'
                          ? renderClauseInsertDetails(details)
                          : p.action === 'knowledge:search'
                            ? renderKnowledgeSearchDetails(details)
                            : p.action === 'knowledge:index'
                              ? renderKnowledgeIndexDetails(details)
                              : p.action === 'negotiation:analyze'
                                ? renderNegotiationAnalyzeDetails(details)
                                : p.action === 'negotiation:counterproposal'
                                  ? renderNegotiationCounterproposalDetails(details)
                                  : p.action === 'design:generate' || p.action === 'design:compose'
                                    ? renderDesignGenerateDetails(details)
                                    : p.action === 'design:edit' || p.action === 'design:content'
                                      ? renderDesignEditDetails(details)
                                      : p.action === 'design:style'
                                        ? renderDesignStyleDetails(details)
                                        : p.action === 'design:export'
                                          ? renderDesignExportDetails(details)
                                          : (
                          <details style={{ marginTop: 6 }}>
                            <summary className="muted" style={{ cursor: "pointer" }}>Details</summary>
                            <pre
                              style={{
                                background: "var(--surface)",
                                padding: 8,
                                borderRadius: 8,
                                whiteSpace: "pre-wrap",
                                border: "1px solid var(--border)",
                              }}
                            >
                              {JSON.stringify(details, null, 2)}
                            </pre>
                          </details>
                        )
                    }
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <button className="button sm subtle" disabled={loading} onClick={() => loadProv(false)}>
              {loading ? "Loading…" : "Load older"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(ProofsPanelInner);
