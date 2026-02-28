// KACHERI BACKEND/src/ai/extractors/rules/universalRules.ts
// Document Intelligence: Universal anomaly rules (apply to ALL document types)
//
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 3

import type { Anomaly } from '../../../store/extractions';
import type { Rule, RuleContext } from './types';
import { createAnomaly, hasValue } from './types';

/* ============= Rule: Missing Title ============= */

const missingTitleRule: Rule = {
  meta: {
    code: 'MISSING_TITLE',
    name: 'Missing Title',
    description: 'Document has no title or title is empty/generic',
    documentTypes: 'all',
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    const ext = ctx.extraction as unknown as Record<string, unknown>;
    const title = ext.title;

    const genericTitles = [
      'Untitled',
      'Untitled Document',
      'Untitled Contract',
      'Untitled Proposal',
      'Untitled Meeting Notes',
      'Untitled Report',
      'Unknown',
      '',
    ];

    if (!hasValue(title) || genericTitles.includes(String(title).trim())) {
      return [
        createAnomaly(
          'MISSING_TITLE',
          'warning',
          'No meaningful title found in this document',
          'Consider adding a descriptive title to improve document organization'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: No Dates Found ============= */

const noDatesRule: Rule = {
  meta: {
    code: 'NO_DATES_FOUND',
    name: 'No Dates Found',
    description: 'No dates were extracted from the document',
    documentTypes: 'all',
    defaultSeverity: 'info',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    const ext = ctx.extraction as unknown as Record<string, unknown>;

    // Check common date fields across document types
    const dateFields = [
      'date',
      'effectiveDate',
      'expirationDate',
      'issueDate',
      'dueDate',
      'validUntil',
      'signedDate',
    ];

    const hasAnyDate = dateFields.some((field) => {
      const value = ext[field];
      return hasValue(value) && value !== 'Unknown';
    });

    // Also check dates array for generic extraction
    if (ext.dates && Array.isArray(ext.dates) && ext.dates.length > 0) {
      return [];
    }

    // Check signatures for dates
    if (ext.signatures && Array.isArray(ext.signatures)) {
      const hasSignatureDate = ext.signatures.some(
        (sig: Record<string, unknown>) => hasValue(sig.signedDate)
      );
      if (hasSignatureDate) return [];
    }

    if (!hasAnyDate) {
      return [
        createAnomaly(
          'NO_DATES_FOUND',
          'info',
          'No dates were identified in this document',
          'If this document contains important dates, consider re-extracting or manually adding them'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: No Parties/Entities ============= */

const noPartiesRule: Rule = {
  meta: {
    code: 'NO_PARTIES_IDENTIFIED',
    name: 'No Parties Identified',
    description: 'No parties, entities, or key people were identified',
    documentTypes: 'all',
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    const ext = ctx.extraction as unknown as Record<string, unknown>;

    // Check various entity fields across document types
    const hasParties =
      ext.parties && Array.isArray(ext.parties) && ext.parties.length > 0;
    const hasVendor = hasValue(ext.vendor);
    const hasClient = hasValue(ext.client);
    const hasCustomer = hasValue(ext.customer);
    const hasAttendees =
      ext.attendees && Array.isArray(ext.attendees) && ext.attendees.length > 0;
    const hasEntities =
      ext.entities && Array.isArray(ext.entities) && ext.entities.length > 0;
    const hasAuthor = hasValue(ext.author);

    if (
      !hasParties &&
      !hasVendor &&
      !hasClient &&
      !hasCustomer &&
      !hasAttendees &&
      !hasEntities &&
      !hasAuthor
    ) {
      return [
        createAnomaly(
          'NO_PARTIES_IDENTIFIED',
          'warning',
          'No parties, people, or organizations were identified in this document',
          'Review the document to ensure key stakeholders are properly mentioned'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: Low Confidence Critical Fields ============= */

const lowConfidenceRule: Rule = {
  meta: {
    code: 'LOW_CONFIDENCE_CRITICAL_FIELD',
    name: 'Low Confidence on Critical Field',
    description: 'A critical field has confidence below 50%',
    documentTypes: 'all',
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    const anomalies: Anomaly[] = [];
    const THRESHOLD = 0.5;

    // Define critical fields per document type
    const criticalFields: Record<string, string[]> = {
      contract: ['parties', 'effectiveDate', 'paymentTerms'],
      invoice: ['invoiceNumber', 'total', 'dueDate', 'vendor'],
      proposal: ['pricing', 'scope', 'deliverables'],
      meeting_notes: ['actionItems', 'attendees', 'date'],
      report: ['keyFindings', 'date'],
      other: ['title', 'summary'],
    };

    const docType = ctx.extraction.documentType;
    const fields = criticalFields[docType] || criticalFields.other;

    for (const field of fields) {
      const confidence = ctx.fieldConfidences[field];
      if (confidence !== undefined && confidence < THRESHOLD) {
        anomalies.push(
          createAnomaly(
            'LOW_CONFIDENCE_CRITICAL_FIELD',
            'warning',
            `Low confidence (${Math.round(confidence * 100)}%) on critical field: ${field}`,
            `Review and verify the extracted value for "${field}" - it may need manual correction`
          )
        );
      }
    }

    return anomalies;
  },
};

/* ============= Export All Universal Rules ============= */

export const universalRules: Rule[] = [
  missingTitleRule,
  noDatesRule,
  noPartiesRule,
  lowConfidenceRule,
];
