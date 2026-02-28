// KACHERI FRONTEND/src/types/negotiation.ts
// Negotiation: TypeScript types for negotiation sessions, rounds, changes, and counterproposals.
//
// These types mirror the backend schemas defined in:
//   - KACHERI BACKEND/src/store/negotiationSessions.ts
//   - KACHERI BACKEND/src/store/negotiationRounds.ts
//   - KACHERI BACKEND/src/store/negotiationChanges.ts
//   - KACHERI BACKEND/src/store/negotiationCounterproposals.ts
//   - KACHERI BACKEND/src/routes/negotiations.ts
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 10

/* ============= Base Types ============= */

export type NegotiationStatus =
  | 'draft'
  | 'active'
  | 'awaiting_response'
  | 'reviewing'
  | 'settled'
  | 'abandoned';

export type RoundType =
  | 'initial_proposal'
  | 'counterproposal'
  | 'revision'
  | 'final';

export type ProposedBy = 'internal' | 'external';

export type ChangeType = 'insert' | 'delete' | 'replace';

export type ChangeCategory = 'substantive' | 'editorial' | 'structural';

export type ChangeStatus = 'pending' | 'accepted' | 'rejected' | 'countered';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type CounterproposalMode = 'balanced' | 'favorable' | 'minimal_change';

export type AnalysisRecommendation = 'accept' | 'reject' | 'counter' | 'review';

/* ============= Domain Types ============= */

/** Top-level negotiation session. One session per document per counterparty. */
export type NegotiationSession = {
  id: string;
  docId: string;
  workspaceId: string;
  title: string;
  counterpartyName: string;
  counterpartyLabel: string | null;
  status: NegotiationStatus;
  currentRound: number;
  totalChanges: number;
  acceptedChanges: number;
  rejectedChanges: number;
  pendingChanges: number;
  startedBy: string;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Individual round within a negotiation. Contains a document snapshot. */
export type NegotiationRound = {
  id: string;
  sessionId: string;
  roundNumber: number;
  roundType: RoundType;
  proposedBy: ProposedBy;
  proposerLabel: string | null;
  snapshotHtml: string;
  snapshotText: string;
  snapshotHash: string;
  versionId: string | null;
  importSource: string | null;
  notes: string | null;
  changeCount: number;
  createdBy: string;
  createdAt: string;
};

/** Round summary without snapshot HTML/text (used in list and session detail responses). */
export type RoundSummary = Omit<NegotiationRound, 'snapshotHtml' | 'snapshotText'>;

/** Individual change detected between rounds. */
export type NegotiationChange = {
  id: string;
  sessionId: string;
  roundId: string;
  changeType: ChangeType;
  category: ChangeCategory;
  sectionHeading: string | null;
  originalText: string | null;
  proposedText: string | null;
  fromPos: number;
  toPos: number;
  status: ChangeStatus;
  suggestionId: number | null;
  riskLevel: RiskLevel | null;
  aiAnalysis: AnalysisResult | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** AI analysis result for a change. */
export type AnalysisResult = {
  category: ChangeCategory;
  riskLevel: RiskLevel;
  summary: string;
  impact: string;
  historicalContext: string | null;
  clauseComparison: string | null;
  complianceFlags: string[];
  recommendation: AnalysisRecommendation;
  recommendationReason: string;
};

/** AI-generated counterproposal alternative for a change. */
export type NegotiationCounterproposal = {
  id: string;
  changeId: string;
  mode: CounterproposalMode;
  proposedText: string;
  rationale: string;
  clauseId: string | null;
  proofId: string | null;
  accepted: boolean;
  createdBy: string;
  createdAt: string;
};

/** Change status counts (used in session detail, round detail, and summary). */
export type ChangeSummary = {
  pending: number;
  accepted: number;
  rejected: number;
  countered: number;
};

/** Proof reference (id + hash) returned by AI endpoints. */
export type ProofRef = {
  id: string;
  hash: string;
};

/** Clause library match reference (returned with counterproposals). */
export type ClauseMatchRef = {
  clauseId: string;
  title: string;
  similarity: number;
};

/* ============= API Request Types ============= */

export type CreateSessionParams = {
  title: string;
  counterpartyName: string;
  counterpartyLabel?: string;
};

export type UpdateSessionParams = {
  title?: string;
  counterpartyName?: string;
  counterpartyLabel?: string | null;
  status?: NegotiationStatus;
};

export type CreateRoundParams = {
  html: string;
  text?: string;
  proposedBy: ProposedBy;
  proposerLabel?: string;
  importSource?: string;
  notes?: string;
};

export type ImportRoundOptions = {
  proposerLabel?: string;
  notes?: string;
};

export type ListChangesOptions = {
  roundId?: string;
  status?: ChangeStatus;
  category?: ChangeCategory;
  riskLevel?: RiskLevel;
  limit?: number;
  offset?: number;
};

export type UpdateChangeStatusParams = {
  status: ChangeStatus;
};

export type GenerateCounterproposalParams = {
  mode: CounterproposalMode;
};

export type ListWorkspaceNegotiationsOptions = {
  status?: NegotiationStatus;
  counterparty?: string;
  limit?: number;
  offset?: number;
};

/* ============= API Response Types ============= */

/** Response from POST /docs/:id/negotiations */
export type CreateSessionResponse = NegotiationSession;

/** Response from GET /docs/:id/negotiations */
export type ListSessionsResponse = {
  docId: string;
  sessions: NegotiationSession[];
  total: number;
};

/** Response from GET /negotiations/:nid */
export type SessionDetailResponse = {
  session: NegotiationSession;
  rounds: RoundSummary[];
  changeSummary: ChangeSummary;
  positionDriftWarning?: boolean;
};

/** Response from PATCH /negotiations/:nid */
export type UpdateSessionResponse = NegotiationSession;

/** Response from POST /negotiations/:nid/rounds */
export type CreateRoundResponse = {
  round: RoundSummary;
  changeCount: number;
  session: NegotiationSession;
};

/** Response from POST /negotiations/:nid/rounds/import */
export type ImportRoundResponse = {
  round: RoundSummary;
  changeCount: number;
  session: NegotiationSession;
  import: {
    filename: string;
    format: string;
    bytes: number;
  };
};

/** Response from GET /negotiations/:nid/rounds */
export type ListRoundsResponse = {
  sessionId: string;
  rounds: RoundSummary[];
  total: number;
};

/** Response from GET /negotiations/:nid/rounds/:rid */
export type RoundDetailResponse = {
  round: NegotiationRound;
  changeCount: number;
  changeSummary: ChangeSummary;
};

/** Response from GET /negotiations/:nid/changes */
export type ListChangesResponse = {
  sessionId: string;
  changes: NegotiationChange[];
  total: number;
  limit?: number;
  offset?: number;
  filters: {
    roundId: string | null;
    status: ChangeStatus | null;
    category: ChangeCategory | null;
    riskLevel: RiskLevel | null;
  };
};

/** Response from GET /negotiations/:nid/changes/:cid */
export type ChangeDetailResponse = {
  change: NegotiationChange;
};

/** Response from PATCH /negotiations/:nid/changes/:cid */
export type UpdateChangeResponse = {
  change: NegotiationChange;
  session: NegotiationSession;
};

/** Response from POST /negotiations/:nid/changes/:cid/analyze */
export type AnalyzeSingleResponse = {
  change: NegotiationChange;
  analysis: AnalysisResult;
  fromCache: boolean;
  proof: ProofRef | null;
};

/** Single change result within a batch analysis response. */
export type BatchAnalyzeResultItem = {
  changeId: string;
  riskLevel: RiskLevel;
  category: ChangeCategory;
  recommendation: AnalysisRecommendation;
  fromCache: boolean;
};

/** Response from POST /negotiations/:nid/rounds/:rid/analyze */
export type BatchAnalyzeResponse = {
  analyzed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: BatchAnalyzeResultItem[];
  failedChangeIds?: string[];
  proof: ProofRef | null;
};

/** Response from POST /negotiations/:nid/changes/:cid/counterproposal */
export type GenerateCounterproposalResponse = {
  counterproposal: NegotiationCounterproposal;
  clauseMatch: ClauseMatchRef | null;
  proof: ProofRef | null;
};

/** Response from GET /negotiations/:nid/changes/:cid/counterproposals */
export type ListCounterproposalsResponse = {
  changeId: string;
  counterproposals: NegotiationCounterproposal[];
  total: number;
};

/** Response from POST /negotiations/:nid/changes/accept-all */
export type AcceptAllResponse = {
  accepted: number;
  session: NegotiationSession;
};

/** Response from POST /negotiations/:nid/changes/reject-all */
export type RejectAllResponse = {
  rejected: number;
  session: NegotiationSession;
};

/** Latest round summary within session summary stats. */
export type LatestRoundSummary = {
  id: string;
  roundNumber: number;
  roundType: RoundType;
  proposedBy: ProposedBy;
  changeCount: number;
  createdAt: string;
};

/** Session summary stats. */
export type SessionSummaryStats = {
  totalRounds: number;
  totalChanges: number;
  byStatus: ChangeSummary;
  byCategory: {
    substantive: number;
    editorial: number;
    structural: number;
  };
  byRisk: {
    low: number;
    medium: number;
    high: number;
    critical: number;
    unassessed: number;
  };
  acceptanceRate: number | null;
  latestRound: LatestRoundSummary | null;
};

/** Response from GET /negotiations/:nid/summary */
export type SessionSummaryResponse = {
  session: NegotiationSession;
  stats: SessionSummaryStats;
};

/** Settlement details within settle response. */
export type SettlementDetail = {
  versionId: number | null;
  suggestionsCreated: number;
  acceptedChanges: number;
  rejectedChanges: number;
  counteredChanges: number;
};

/** Response from POST /negotiations/:nid/settle */
export type SettleResponse = {
  session: NegotiationSession;
  settlement: SettlementDetail;
  proof: ProofRef | null;
};

/** Response from POST /negotiations/:nid/abandon */
export type AbandonResponse = {
  session: NegotiationSession;
};

/** Negotiation item enriched with document title (workspace listing). */
export type WorkspaceNegotiationItem = NegotiationSession & {
  docTitle: string;
};

/** Response from GET /workspaces/:wid/negotiations */
export type ListWorkspaceNegotiationsResponse = {
  workspaceId: string;
  negotiations: WorkspaceNegotiationItem[];
  total: number;
  filters: {
    status: NegotiationStatus | null;
    counterparty: string | null;
  };
};

/** Workspace-level negotiation statistics. */
export type NegotiationStats = {
  total: number;
  active: number;
  settledThisMonth: number;
  averageRounds: number | null;
  overallAcceptanceRate: number | null;
  byStatus: {
    draft: number;
    active: number;
    awaiting_response: number;
    reviewing: number;
    settled: number;
    abandoned: number;
  };
};

/** Response from GET /workspaces/:wid/negotiations/stats */
export type WorkspaceNegotiationStatsResponse = {
  workspaceId: string;
  stats: NegotiationStats;
};
