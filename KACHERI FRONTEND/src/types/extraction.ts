// KACHERI FRONTEND/src/types/extraction.ts
// Document Intelligence: TypeScript types for extraction schemas, actions, and standards.
//
// These types mirror the backend schemas defined in:
//   - KACHERI BACKEND/src/store/extractions.ts
//   - KACHERI BACKEND/src/store/extractionActions.ts
//   - KACHERI BACKEND/src/store/extractionStandards.ts
//   - KACHERI BACKEND/src/ai/extractors/types.ts
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 8

/* ============= Base Types ============= */

export type DocumentType =
  | 'contract'
  | 'invoice'
  | 'proposal'
  | 'meeting_notes'
  | 'report'
  | 'other';

export type AnomalySeverity = 'info' | 'warning' | 'error';

export type Anomaly = {
  code: string;
  severity: AnomalySeverity;
  message: string;
  suggestion?: string;
};

export type FieldConfidence = Record<string, number>;

/* ============= Contract Schema ============= */

export type Party = {
  name: string;
  role: 'party_a' | 'party_b' | 'other';
  address?: string;
};

export type Signature = {
  party: string;
  signedDate?: string;
};

export type PaymentTerms = {
  amount?: number;
  currency?: string;
  frequency?: string;
  dueDate?: string;
  netDays?: number;
};

export type TerminationClause = {
  noticePeriod?: string;
  conditions?: string[];
};

export type LiabilityLimit = {
  amount?: number;
  currency?: string;
};

export type ContractExtraction = {
  documentType: 'contract';
  title: string;
  parties: Party[];
  effectiveDate?: string;
  expirationDate?: string;
  termLength?: string;
  autoRenewal?: boolean;
  paymentTerms?: PaymentTerms;
  terminationClause?: TerminationClause;
  liabilityLimit?: LiabilityLimit;
  governingLaw?: string;
  keyObligations?: string[];
  signatures?: Signature[];
};

/* ============= Invoice Schema ============= */

export type InvoiceVendor = {
  name: string;
  address?: string;
  taxId?: string;
};

export type InvoiceCustomer = {
  name: string;
  address?: string;
};

export type LineItem = {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
};

export type InvoiceExtraction = {
  documentType: 'invoice';
  invoiceNumber: string;
  vendor: InvoiceVendor;
  customer: InvoiceCustomer;
  issueDate: string;
  dueDate: string;
  lineItems: LineItem[];
  subtotal: number;
  tax?: number;
  total: number;
  currency: string;
  paymentInstructions?: string;
};

/* ============= Proposal Schema ============= */

export type ProposalDeliverable = {
  name: string;
  description?: string;
  timeline?: string;
};

export type ProposalPricingBreakdown = {
  item: string;
  amount: number;
};

export type ProposalPricing = {
  total?: number;
  currency?: string;
  breakdown?: ProposalPricingBreakdown[];
  paymentSchedule?: string;
};

export type ProposalMilestone = {
  name: string;
  date: string;
};

export type ProposalTimeline = {
  startDate?: string;
  endDate?: string;
  milestones?: ProposalMilestone[];
};

export type ProposalExtraction = {
  documentType: 'proposal';
  title: string;
  vendor: string;
  client: string;
  date: string;
  validUntil?: string;
  executiveSummary?: string;
  scope: string[];
  deliverables: ProposalDeliverable[];
  pricing: ProposalPricing;
  timeline?: ProposalTimeline;
  assumptions?: string[];
  exclusions?: string[];
};

/* ============= Meeting Notes Schema ============= */

export type MeetingDiscussion = {
  topic: string;
  summary: string;
  decisions?: string[];
};

export type MeetingActionItem = {
  task: string;
  assignee?: string;
  dueDate?: string;
  status?: string;
};

export type NextMeeting = {
  date?: string;
  agenda?: string[];
};

export type MeetingNotesExtraction = {
  documentType: 'meeting_notes';
  title: string;
  date: string;
  attendees: string[];
  absentees?: string[];
  agenda?: string[];
  discussions: MeetingDiscussion[];
  actionItems: MeetingActionItem[];
  nextMeeting?: NextMeeting;
};

/* ============= Report Schema ============= */

export type ReportPeriod = {
  from: string;
  to: string;
};

export type ReportMetric = {
  name: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'stable';
};

export type ReportRisk = {
  description: string;
  severity?: 'low' | 'medium' | 'high';
  mitigation?: string;
};

export type ReportExtraction = {
  documentType: 'report';
  title: string;
  author?: string;
  date: string;
  period?: ReportPeriod;
  executiveSummary?: string;
  keyFindings: string[];
  metrics?: ReportMetric[];
  recommendations?: string[];
  risks?: ReportRisk[];
};

/* ============= Generic/Other Schema ============= */

export type GenericEntity = {
  type: 'person' | 'organization' | 'date' | 'amount' | 'location' | 'other';
  value: string;
  context?: string;
};

export type GenericDate = {
  date: string;
  context: string;
};

export type GenericAmount = {
  value: number;
  currency?: string;
  context: string;
};

export type GenericExtraction = {
  documentType: 'other';
  title: string;
  date?: string;
  author?: string;
  summary: string;
  keyPoints: string[];
  entities: GenericEntity[];
  dates: GenericDate[];
  amounts: GenericAmount[];
};

/* ============= Union Type for All Extractions ============= */

export type ExtractionResult =
  | ContractExtraction
  | InvoiceExtraction
  | ProposalExtraction
  | MeetingNotesExtraction
  | ReportExtraction
  | GenericExtraction;

/* ============= Domain Types ============= */

export type Extraction = {
  id: string;
  docId: string;
  documentType: DocumentType;
  typeConfidence: number;
  extraction: Record<string, unknown>;
  fieldConfidences: FieldConfidence | null;
  anomalies: Anomaly[] | null;
  proofId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type ExtractionCorrection = {
  id: string;
  extractionId: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  correctedBy: string;
  correctedAt: string;
};

/* ============= Action Types ============= */

export type ActionType = 'reminder' | 'flag_review' | 'export' | 'compare';
export type ActionStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

export type ExtractionAction = {
  id: string;
  extractionId: string;
  actionType: ActionType;
  fieldPath: string | null;
  config: Record<string, unknown> | null;
  status: ActionStatus;
  scheduledFor: string | null;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
};

/* ============= Workspace Standard Types ============= */

export type RuleType = 'required_field' | 'value_range' | 'comparison' | 'custom';

export type ExtractionStandard = {
  id: string;
  workspaceId: string;
  documentType: DocumentType;
  ruleType: RuleType;
  config: Record<string, unknown>;
  severity: AnomalySeverity;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
};

/* ============= API Request Types ============= */

export type ExtractParams = {
  text: string;
  forceDocType?: DocumentType;
  reextract?: boolean;
  provider?: string;
  model?: string;
  seed?: string;
};

export type UpdateExtractionParams = {
  documentType?: DocumentType;
  corrections?: Record<string, unknown>;
};

export type CreateActionParams = {
  type: 'reminder' | 'flag_review';
  field?: string;
  config?: {
    reminderDate?: string;
    message?: string;
  };
};

export type CreateStandardParams = {
  documentType: DocumentType;
  ruleType: RuleType;
  config: Record<string, unknown>;
  severity?: AnomalySeverity;
  enabled?: boolean;
};

export type UpdateStandardParams = {
  documentType?: DocumentType;
  ruleType?: RuleType;
  config?: Record<string, unknown>;
  severity?: AnomalySeverity;
  enabled?: boolean;
};

export type ListStandardsOptions = {
  documentType?: DocumentType;
  enabled?: boolean;
};

/* ============= API Response Types ============= */

export type ExtractResponse = {
  extractionId: string;
  docId: string;
  documentType: DocumentType;
  confidence: number;
  extraction: Record<string, unknown>;
  fieldConfidences: FieldConfidence;
  anomalies: Anomaly[];
  proofId: string | null;
  proofHash: string;
  extractedAt: string;
};

export type GetExtractionResponse = {
  extractionId: string;
  docId: string;
  documentType: DocumentType;
  confidence: number;
  extraction: Record<string, unknown>;
  fieldConfidences: FieldConfidence | null;
  anomalies: Anomaly[] | null;
  proofId: string | null;
  extractedAt: string;
  updatedAt: string;
  corrections?: ExtractionCorrection[];
};

export type UpdateExtractionResponse = {
  extractionId: string;
  docId: string;
  documentType: DocumentType;
  extraction: Record<string, unknown>;
  correctedFields: string[];
  correctedAt: string;
  correctedBy: string;
};

export type CreateActionResponse = {
  actionId: string;
  type: string;
  status: string;
  scheduledFor?: string | null;
  field: string | null;
  config: Record<string, unknown> | null;
  commentId?: number;
  createdAt: string;
};

export type ListActionsResponse = {
  extractionId: string;
  docId: string;
  actions: Array<{
    actionId: string;
    type: string;
    status: string;
    field: string | null;
    config: Record<string, unknown> | null;
    scheduledFor: string | null;
    completedAt: string | null;
    createdBy: string;
    createdAt: string;
  }>;
  total: number;
};

export type DeleteActionResponse = {
  actionId: string;
  status: 'cancelled' | 'deleted';
  message: string;
};

export type ListStandardsResponse = {
  workspaceId: string;
  standards: ExtractionStandard[];
  total: number;
};

export type CreateStandardResponse = {
  standard: ExtractionStandard;
  message: string;
};

export type UpdateStandardResponse = {
  standard: ExtractionStandard;
  message: string;
};

export type DeleteStandardResponse = {
  standardId: string;
  message: string;
};
