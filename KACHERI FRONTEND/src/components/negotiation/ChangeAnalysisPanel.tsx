// KACHERI FRONTEND/src/components/negotiation/ChangeAnalysisPanel.tsx
// Expanded AI analysis view for a negotiation change.
// Renders: summary, impact, risk level, historical context, clause comparison,
// compliance flags, recommendation with reasoning, and "Generate Counterproposal" button.
//
// Pure presentational — all data via props.
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 13

import type { AnalysisResult, AnalysisRecommendation } from '../../types/negotiation';
import RiskBadge from './RiskBadge';

type Props = {
  analysis: AnalysisResult;
  changeId: string;
  onGenerateCounterproposal: (changeId: string) => void;
  isTerminal: boolean;
};

const REC_LABELS: Record<AnalysisRecommendation, string> = {
  accept: 'Accept',
  reject: 'Reject',
  counter: 'Counter',
  review: 'Review',
};

export default function ChangeAnalysisPanel({
  analysis,
  changeId,
  onGenerateCounterproposal,
  isTerminal,
}: Props) {
  return (
    <div className="change-analysis">
      {/* Summary */}
      <div className="change-analysis-summary">{analysis.summary}</div>

      {/* Impact */}
      <div className="change-analysis-impact">{analysis.impact}</div>

      {/* Risk Level */}
      <div className="change-analysis-row">
        <span className="change-analysis-label">Risk</span>
        <RiskBadge level={analysis.riskLevel} />
      </div>

      {/* Historical Context */}
      {analysis.historicalContext && (
        <div className="change-analysis-section">
          <span className="change-analysis-label">Historical Context</span>
          <p>{analysis.historicalContext}</p>
        </div>
      )}

      {/* Clause Comparison */}
      {analysis.clauseComparison && (
        <div className="change-analysis-section">
          <span className="change-analysis-label">Clause Comparison</span>
          <p>{analysis.clauseComparison}</p>
        </div>
      )}

      {/* Compliance Flags */}
      {analysis.complianceFlags.length > 0 && (
        <div className="change-analysis-flags">
          <span className="change-analysis-flags-label">Compliance Flags</span>
          {analysis.complianceFlags.map((flag, i) => (
            <span key={i} className="change-analysis-flag">
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* Recommendation */}
      <div className="change-analysis-recommendation">
        <div className="change-analysis-rec-header">
          <span className="change-analysis-label">Recommendation</span>
          <span className={`change-analysis-rec-badge ${analysis.recommendation}`}>
            {REC_LABELS[analysis.recommendation]}
          </span>
        </div>
        <div className="change-analysis-rec-reason">
          {analysis.recommendationReason}
        </div>
      </div>

      {/* Generate Counterproposal */}
      {!isTerminal && (
        <button
          className="change-analysis-counter-btn"
          onClick={() => onGenerateCounterproposal(changeId)}
        >
          Generate Counterproposal
        </button>
      )}
    </div>
  );
}
