import { describe, it, expect } from 'vitest';
import {
  detectAnomalies,
  getRulesForDocumentType,
  getAllRuleCodes,
  getRuleByCode,
} from '../anomalyDetector.js';
import type { ContractExtraction, InvoiceExtraction, MeetingNotesExtraction, ProposalExtraction } from '../types.js';
import type { WorkspaceStandard } from '../rules/types.js';

/* ============= detectAnomalies — Contract ============= */

describe('detectAnomalies — contract', () => {
  it('evaluates universal + contract rules', () => {
    const result = detectAnomalies({
      extraction: {
        documentType: 'contract',
        title: 'Service Agreement',
        parties: [{ name: 'Acme', role: 'party_a' }],
        effectiveDate: '2026-01-01',
      } as ContractExtraction,
      fieldConfidences: { title: 0.95, parties: 0.9, effectiveDate: 0.85 },
    });

    // 4 universal + 6 contract = 10 rules
    expect(result.rulesEvaluated).toBe(10);
    // Should trigger: NO_TERMINATION_CLAUSE, NO_LIABILITY_LIMIT, NO_GOVERNING_LAW
    const codes = result.anomalies.map((a) => a.code);
    expect(codes).toContain('NO_TERMINATION_CLAUSE');
    expect(codes).toContain('NO_LIABILITY_LIMIT');
    expect(codes).toContain('NO_GOVERNING_LAW');
  });

  it('produces no anomalies for complete contract', () => {
    const result = detectAnomalies({
      extraction: {
        documentType: 'contract',
        title: 'Service Agreement',
        parties: [{ name: 'Acme', role: 'party_a' }, { name: 'Client', role: 'party_b' }],
        effectiveDate: '2026-01-01',
        expirationDate: '2027-01-01',
        paymentTerms: { netDays: 30, amount: 10000, currency: 'USD' },
        terminationClause: { noticePeriod: '30 days' },
        liabilityLimit: { amount: 500000, currency: 'USD' },
        governingLaw: 'State of California',
        signatures: [
          { party: 'Acme', signedDate: '2026-01-01' },
          { party: 'Client', signedDate: '2026-01-02' },
        ],
      } as ContractExtraction,
      fieldConfidences: { title: 0.95, parties: 0.9, effectiveDate: 0.85, paymentTerms: 0.8 },
    });

    expect(result.anomalies).toHaveLength(0);
  });
});

/* ============= detectAnomalies — Invoice ============= */

describe('detectAnomalies — invoice', () => {
  it('evaluates universal + invoice rules', () => {
    const result = detectAnomalies({
      extraction: {
        documentType: 'invoice',
        invoiceNumber: 'INV-001',
        vendor: { name: 'Vendor Corp' },
        customer: { name: 'Customer Inc' },
        issueDate: '2026-01-01',
        dueDate: '2099-02-01',
        lineItems: [{ description: 'Services', amount: 1000 }],
        subtotal: 1000,
        tax: 100,
        total: 1100,
        currency: 'USD',
      } as InvoiceExtraction,
      fieldConfidences: { total: 0.9, dueDate: 0.8 },
    });

    // 4 universal + 5 invoice = 9 rules
    expect(result.rulesEvaluated).toBe(9);
  });
});

/* ============= detectAnomalies — Proposal ============= */

describe('detectAnomalies — proposal', () => {
  it('evaluates universal + proposal rules', () => {
    const result = detectAnomalies({
      extraction: {
        documentType: 'proposal',
        title: 'Web Dev Proposal',
        vendor: 'Acme',
        client: 'Client',
        date: '2026-01-01',
        scope: ['Web development'],
        deliverables: [{ name: 'Website' }],
        pricing: { total: 50000 },
      } as ProposalExtraction,
      fieldConfidences: {},
    });

    // 4 universal + 4 proposal = 8 rules
    expect(result.rulesEvaluated).toBe(8);
  });
});

/* ============= detectAnomalies — Meeting Notes ============= */

describe('detectAnomalies — meeting_notes', () => {
  it('evaluates universal + meeting notes rules', () => {
    const result = detectAnomalies({
      extraction: {
        documentType: 'meeting_notes',
        title: 'Standup',
        date: '2026-01-15',
        attendees: ['Alice'],
        discussions: [],
        actionItems: [{ task: 'Follow up', assignee: 'Alice', dueDate: '2026-02-01' }],
      } as MeetingNotesExtraction,
      fieldConfidences: {},
    });

    // 4 universal + 4 meeting_notes = 8 rules
    expect(result.rulesEvaluated).toBe(8);
    expect(result.anomalies).toHaveLength(0);
  });
});

/* ============= detectAnomalies — Report (universal only) ============= */

describe('detectAnomalies — report', () => {
  it('evaluates only universal rules for report', () => {
    const result = detectAnomalies({
      extraction: {
        documentType: 'report',
        title: 'Q1 Report',
        date: '2026-03-31',
        author: 'John',
        keyFindings: ['Revenue up 10%'],
      } as any,
      fieldConfidences: {},
    });

    // 4 universal rules only (no report-specific rules)
    expect(result.rulesEvaluated).toBe(4);
  });
});

/* ============= Workspace Custom Rules ============= */

describe('detectAnomalies — workspace standards', () => {
  it('evaluates workspace required_field standard', () => {
    const standard: WorkspaceStandard = {
      id: 'std_1',
      workspaceId: 'ws_1',
      documentType: 'contract',
      ruleType: 'required_field',
      config: { fieldPath: 'governingLaw' },
      severity: 'error',
      enabled: true,
    };

    const result = detectAnomalies({
      extraction: {
        documentType: 'contract',
        title: 'Test',
        parties: [{ name: 'A', role: 'party_a' }],
        effectiveDate: '2026-01-01',
      } as ContractExtraction,
      fieldConfidences: {},
      workspaceStandards: [standard],
    });

    expect(result.customRulesEvaluated).toBe(1);
    const customAnomaly = result.anomalies.find((a) => a.code.startsWith('CUSTOM_'));
    expect(customAnomaly).toBeDefined();
    expect(customAnomaly!.severity).toBe('error');
  });

  it('skips disabled standards', () => {
    const standard: WorkspaceStandard = {
      id: 'std_1',
      workspaceId: 'ws_1',
      documentType: 'contract',
      ruleType: 'required_field',
      config: { fieldPath: 'governingLaw' },
      severity: 'error',
      enabled: false,
    };

    const result = detectAnomalies({
      extraction: {
        documentType: 'contract',
        title: 'Test',
        parties: [],
      } as ContractExtraction,
      fieldConfidences: {},
      workspaceStandards: [standard],
    });

    expect(result.customRulesEvaluated).toBe(0);
  });

  it('evaluates value_range standard — triggers above max', () => {
    const standard: WorkspaceStandard = {
      id: 'std_2',
      workspaceId: 'ws_1',
      documentType: 'contract',
      ruleType: 'value_range',
      config: { fieldPath: 'paymentTerms.netDays', min: 0, max: 60 },
      severity: 'warning',
      enabled: true,
    };

    const result = detectAnomalies({
      extraction: {
        documentType: 'contract',
        title: 'Test',
        parties: [],
        paymentTerms: { netDays: 90 },
      } as ContractExtraction,
      fieldConfidences: {},
      workspaceStandards: [standard],
    });

    const customAnomaly = result.anomalies.find((a) => a.code.includes('ABOVE_MAX'));
    expect(customAnomaly).toBeDefined();
    expect(customAnomaly!.message).toContain('90');
  });

  it('does not trigger value_range when within limits', () => {
    const standard: WorkspaceStandard = {
      id: 'std_2',
      workspaceId: 'ws_1',
      documentType: 'contract',
      ruleType: 'value_range',
      config: { fieldPath: 'paymentTerms.netDays', min: 0, max: 60 },
      severity: 'warning',
      enabled: true,
    };

    const result = detectAnomalies({
      extraction: {
        documentType: 'contract',
        title: 'Test',
        parties: [],
        paymentTerms: { netDays: 30 },
      } as ContractExtraction,
      fieldConfidences: {},
      workspaceStandards: [standard],
    });

    const customAnomaly = result.anomalies.find((a) => a.code.includes('ABOVE_MAX') || a.code.includes('BELOW_MIN'));
    expect(customAnomaly).toBeUndefined();
  });

  it('applies standards with documentType "other" to any extraction', () => {
    const standard: WorkspaceStandard = {
      id: 'std_3',
      workspaceId: 'ws_1',
      documentType: 'other',
      ruleType: 'required_field',
      config: { fieldPath: 'title' },
      severity: 'info',
      enabled: true,
    };

    const result = detectAnomalies({
      extraction: {
        documentType: 'invoice',
        invoiceNumber: 'INV-001',
        vendor: { name: 'V' },
        customer: { name: 'C' },
        issueDate: '2026-01-01',
        dueDate: '2099-01-01',
        lineItems: [],
        subtotal: 0,
        total: 50,
        currency: 'USD',
        title: 'My Invoice',
      } as unknown as InvoiceExtraction,
      fieldConfidences: {},
      workspaceStandards: [standard],
    });

    expect(result.customRulesEvaluated).toBe(1);
  });
});

/* ============= Utility Functions ============= */

describe('getRulesForDocumentType', () => {
  it('returns universal + contract rules for contract', () => {
    const rules = getRulesForDocumentType('contract');
    expect(rules.length).toBe(10); // 4 universal + 6 contract
  });

  it('returns universal + invoice rules for invoice', () => {
    const rules = getRulesForDocumentType('invoice');
    expect(rules.length).toBe(9); // 4 universal + 5 invoice
  });

  it('returns only universal rules for report', () => {
    const rules = getRulesForDocumentType('report');
    expect(rules.length).toBe(4); // 4 universal only
  });
});

describe('getAllRuleCodes', () => {
  it('returns all unique rule codes', () => {
    const codes = getAllRuleCodes();
    expect(codes.length).toBeGreaterThanOrEqual(23);
    expect(codes).toContain('MISSING_TITLE');
    expect(codes).toContain('NO_TERMINATION_CLAUSE');
    expect(codes).toContain('DUE_DATE_IN_PAST');
    expect(codes).toContain('NO_PRICING_INFORMATION');
    expect(codes).toContain('NO_ACTION_ITEMS');
  });
});

describe('getRuleByCode', () => {
  it('finds universal rule by code', () => {
    const rule = getRuleByCode('MISSING_TITLE');
    expect(rule).toBeDefined();
    expect(rule!.meta.documentTypes).toBe('all');
  });

  it('finds type-specific rule by code', () => {
    const rule = getRuleByCode('NO_TERMINATION_CLAUSE');
    expect(rule).toBeDefined();
    expect(rule!.meta.documentTypes).toEqual(['contract']);
  });

  it('returns undefined for unknown code', () => {
    expect(getRuleByCode('NONEXISTENT_RULE')).toBeUndefined();
  });
});
