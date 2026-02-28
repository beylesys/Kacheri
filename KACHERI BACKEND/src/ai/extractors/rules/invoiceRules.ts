// KACHERI BACKEND/src/ai/extractors/rules/invoiceRules.ts
// Document Intelligence: Invoice-specific anomaly detection rules
//
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 3

import type { Anomaly } from '../../../store/extractions';
import type { InvoiceExtraction } from '../types';
import type { Rule, RuleContext } from './types';
import { createAnomaly } from './types';

/* ============= Type Guard ============= */

function isInvoiceExtraction(ext: unknown): ext is InvoiceExtraction {
  return (ext as InvoiceExtraction)?.documentType === 'invoice';
}

/* ============= Rule: Due Date in Past ============= */

const dueDateInPastRule: Rule = {
  meta: {
    code: 'DUE_DATE_IN_PAST',
    name: 'Due Date in Past',
    description: 'Invoice due date has already passed',
    documentTypes: ['invoice'],
    defaultSeverity: 'error',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isInvoiceExtraction(ctx.extraction)) return [];

    const { dueDate } = ctx.extraction;
    if (!dueDate || dueDate === 'Unknown') return [];

    try {
      const due = new Date(dueDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Compare dates only

      if (due < now) {
        const daysOverdue = Math.floor(
          (now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000)
        );
        return [
          createAnomaly(
            'DUE_DATE_IN_PAST',
            'error',
            `Invoice due date (${dueDate}) is ${daysOverdue} day(s) overdue`,
            'This invoice may require immediate attention for payment or follow-up'
          ),
        ];
      }
    } catch {
      // Invalid date format, skip
    }
    return [];
  },
};

/* ============= Rule: Missing Invoice Number ============= */

const missingInvoiceNumberRule: Rule = {
  meta: {
    code: 'MISSING_INVOICE_NUMBER',
    name: 'Missing Invoice Number',
    description: 'Invoice has no invoice number',
    documentTypes: ['invoice'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isInvoiceExtraction(ctx.extraction)) return [];

    const { invoiceNumber } = ctx.extraction;
    if (
      !invoiceNumber ||
      invoiceNumber === 'Unknown' ||
      invoiceNumber.trim() === ''
    ) {
      return [
        createAnomaly(
          'MISSING_INVOICE_NUMBER',
          'warning',
          'No invoice number found',
          'Invoice numbers are essential for tracking and reconciliation'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: Line Items Don't Sum to Total ============= */

const lineItemsSumMismatchRule: Rule = {
  meta: {
    code: 'LINE_ITEMS_SUM_MISMATCH',
    name: 'Line Items Sum Mismatch',
    description: 'Sum of line items does not match subtotal or total',
    documentTypes: ['invoice'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isInvoiceExtraction(ctx.extraction)) return [];

    const { lineItems, subtotal, total, tax } = ctx.extraction;
    if (!lineItems || lineItems.length === 0) return [];

    // Calculate sum of line items
    const lineItemSum = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);

    // Allow for small floating point differences (0.01)
    const tolerance = 0.01;

    // Check against subtotal
    if (subtotal > 0 && Math.abs(lineItemSum - subtotal) > tolerance) {
      return [
        createAnomaly(
          'LINE_ITEMS_SUM_MISMATCH',
          'warning',
          `Line items sum (${lineItemSum.toFixed(2)}) does not match subtotal (${subtotal.toFixed(2)})`,
          'Verify line item amounts and subtotal are correct'
        ),
      ];
    }

    // If no subtotal, check against total - tax
    if (subtotal === 0 && total > 0) {
      const expectedSubtotal = total - (tax || 0);
      if (Math.abs(lineItemSum - expectedSubtotal) > tolerance) {
        return [
          createAnomaly(
            'LINE_ITEMS_SUM_MISMATCH',
            'warning',
            `Line items sum (${lineItemSum.toFixed(2)}) does not match expected amount (${expectedSubtotal.toFixed(2)})`,
            'Verify line item amounts match the total'
          ),
        ];
      }
    }

    return [];
  },
};

/* ============= Rule: Missing Tax (Heuristic) ============= */

const missingTaxRule: Rule = {
  meta: {
    code: 'MISSING_TAX',
    name: 'Missing Tax',
    description: 'Invoice has no tax when total is significant',
    documentTypes: ['invoice'],
    defaultSeverity: 'info',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isInvoiceExtraction(ctx.extraction)) return [];

    const { tax, total } = ctx.extraction;

    // Only flag if total is significant (>100) and no tax
    if (total > 100 && (tax === undefined || tax === 0)) {
      return [
        createAnomaly(
          'MISSING_TAX',
          'info',
          'No tax amount specified on this invoice',
          'Verify whether tax should be applied based on jurisdiction and item types'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: Unusual Payment Terms ============= */

const unusualInvoicePaymentTermsRule: Rule = {
  meta: {
    code: 'UNUSUAL_INVOICE_PAYMENT_TERMS',
    name: 'Unusual Invoice Payment Terms',
    description: 'Invoice payment terms are unusually long',
    documentTypes: ['invoice'],
    defaultSeverity: 'info',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isInvoiceExtraction(ctx.extraction)) return [];

    const { issueDate, dueDate } = ctx.extraction;
    if (
      !issueDate ||
      !dueDate ||
      issueDate === 'Unknown' ||
      dueDate === 'Unknown'
    )
      return [];

    try {
      const issue = new Date(issueDate);
      const due = new Date(dueDate);
      const daysDiff = Math.floor(
        (due.getTime() - issue.getTime()) / (24 * 60 * 60 * 1000)
      );

      if (daysDiff > 90) {
        return [
          createAnomaly(
            'UNUSUAL_INVOICE_PAYMENT_TERMS',
            'info',
            `Payment terms of ${daysDiff} days exceed typical 30-90 day terms`,
            'Verify these extended payment terms are intentional'
          ),
        ];
      }
    } catch {
      // Invalid dates, skip
    }
    return [];
  },
};

/* ============= Export All Invoice Rules ============= */

export const invoiceRules: Rule[] = [
  dueDateInPastRule,
  missingInvoiceNumberRule,
  lineItemsSumMismatchRule,
  missingTaxRule,
  unusualInvoicePaymentTermsRule,
];
