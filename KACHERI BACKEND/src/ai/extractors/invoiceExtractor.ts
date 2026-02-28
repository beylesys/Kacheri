// KACHERI BACKEND/src/ai/extractors/invoiceExtractor.ts
// Document Intelligence: Invoice-specific data extraction
//
// Extracts: vendor, customer, line items, totals, payment info, etc.

import { composeText } from '../modelRouter';
import {
  extractJsonFromResponse,
  normalizeDate,
  buildFieldConfidences,
  extractTitleHeuristic,
  OUT_START,
  OUT_END,
  type ExtractorOptions,
  type ExtractorResult,
  type InvoiceExtraction,
  type InvoiceVendor,
  type InvoiceCustomer,
  type LineItem,
  type GenericExtraction,
} from './types';

/* ============= System Prompt ============= */

const INVOICE_SYSTEM_PROMPT = `You are Kacheri's invoice data extractor.

Extract the following fields from the invoice:
- invoiceNumber: The invoice/bill number or ID
- vendor: Object with {name, address?, taxId?} - who issued the invoice
- customer: Object with {name, address?} - who the invoice is for
- issueDate: When the invoice was issued (YYYY-MM-DD format)
- dueDate: When payment is due (YYYY-MM-DD format)
- lineItems: Array of {description, quantity?, unitPrice?, amount}
- subtotal: Sum before tax
- tax: Tax amount (if applicable)
- total: Final amount due
- currency: Currency code (e.g., "USD", "EUR", "INR")
- paymentInstructions: Bank details, payment methods, etc.

IMPORTANT:
1. Return ONLY valid JSON, no explanations outside the markers
2. Use null for fields you cannot find or extract
3. Use YYYY-MM-DD format for all dates
4. All monetary amounts should be numbers (not strings)
5. Include confidence scores (0.0 to 1.0) for each extracted field
6. The document may be in any language. Extract field values in the original language. Normalize dates to YYYY-MM-DD and amounts to numbers regardless of language.

Return your response wrapped in markers:
${OUT_START}
{
  "extraction": {
    "invoiceNumber": "INV-2026-001",
    "vendor": {"name": "Vendor Corp", "address": "123 Main St"},
    "customer": {"name": "Customer Inc"},
    "issueDate": "2026-01-15",
    "dueDate": "2026-02-15",
    "lineItems": [{"description": "Consulting Services", "quantity": 10, "unitPrice": 150, "amount": 1500}],
    "subtotal": 1500,
    "tax": 150,
    "total": 1650,
    "currency": "USD",
    ...
  },
  "confidences": {
    "invoiceNumber": 0.95,
    "vendor": 0.90,
    "total": 0.98,
    ...
  }
}
${OUT_END}`;

/* ============= Field List for Confidence Tracking ============= */

const INVOICE_FIELDS = [
  'invoiceNumber',
  'vendor',
  'customer',
  'issueDate',
  'dueDate',
  'lineItems',
  'subtotal',
  'tax',
  'total',
  'currency',
  'paymentInstructions',
];

/* ============= Normalization Functions ============= */

function normalizeVendor(raw: unknown): InvoiceVendor {
  if (!raw || typeof raw !== 'object') {
    return { name: 'Unknown Vendor' };
  }
  const obj = raw as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Unknown Vendor',
    address: typeof obj.address === 'string' ? obj.address : undefined,
    taxId: typeof obj.taxId === 'string' ? obj.taxId : undefined,
  };
}

function normalizeCustomer(raw: unknown): InvoiceCustomer {
  if (!raw || typeof raw !== 'object') {
    return { name: 'Unknown Customer' };
  }
  const obj = raw as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Unknown Customer',
    address: typeof obj.address === 'string' ? obj.address : undefined,
  };
}

function normalizeLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  const result: LineItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    // Description and amount are required
    const description = typeof obj.description === 'string' ? obj.description : '';
    const amount = typeof obj.amount === 'number' ? obj.amount : 0;

    if (!description && amount === 0) continue;

    const lineItem: LineItem = {
      description: description || 'Item',
      amount,
    };
    if (typeof obj.quantity === 'number') lineItem.quantity = obj.quantity;
    if (typeof obj.unitPrice === 'number') lineItem.unitPrice = obj.unitPrice;
    result.push(lineItem);
  }
  return result;
}

function normalizeInvoiceExtraction(raw: unknown): InvoiceExtraction {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  return {
    documentType: 'invoice',
    invoiceNumber:
      typeof obj.invoiceNumber === 'string' && obj.invoiceNumber.trim()
        ? obj.invoiceNumber.trim()
        : 'Unknown',
    vendor: normalizeVendor(obj.vendor),
    customer: normalizeCustomer(obj.customer),
    issueDate: normalizeDate(obj.issueDate) || 'Unknown',
    dueDate: normalizeDate(obj.dueDate) || 'Unknown',
    lineItems: normalizeLineItems(obj.lineItems),
    subtotal: typeof obj.subtotal === 'number' ? obj.subtotal : 0,
    tax: typeof obj.tax === 'number' ? obj.tax : undefined,
    total: typeof obj.total === 'number' ? obj.total : 0,
    currency: typeof obj.currency === 'string' && obj.currency.trim() ? obj.currency.trim() : 'USD',
    paymentInstructions:
      typeof obj.paymentInstructions === 'string' ? obj.paymentInstructions : undefined,
  };
}

/* ============= Fallback Extraction ============= */

function createFallbackResult(text: string, rawResponse?: string, error?: string): ExtractorResult {
  const title = extractTitleHeuristic(text);

  const fallback: GenericExtraction = {
    documentType: 'other',
    title,
    summary: text.slice(0, 500) + (text.length > 500 ? '...' : ''),
    keyPoints: [],
    entities: [],
    dates: [],
    amounts: [],
  };

  return {
    extraction: fallback,
    fieldConfidences: { title: 0.3, summary: 0.2 },
    rawResponse,
    notes: error ? [`error: ${error}`] : undefined,
  };
}

/* ============= Main Extraction Function ============= */

/**
 * Extract invoice data from text using AI.
 *
 * @param text - The invoice text to extract from
 * @param options - Provider, model, seed options
 * @returns Extraction result with invoice data and confidence scores
 */
export async function extractInvoice(
  text: string,
  options: ExtractorOptions = {}
): Promise<ExtractorResult> {
  const notes: string[] = [];

  const prompt = `Extract invoice data from this document:\n\n---\n${text}\n---`;

  try {
    const result = await composeText(prompt, {
      systemPrompt: INVOICE_SYSTEM_PROMPT,
      maxTokens: 2000,
      provider: options.provider,
      model: options.model,
      seed: options.seed,
    });

    const { json, parseError, usedMarkers } = extractJsonFromResponse(result.text);

    if (!usedMarkers) {
      notes.push('model_output_missing_markers');
    }

    if (parseError || !json) {
      notes.push(`parse_error: ${parseError}`);
      return createFallbackResult(text, result.text, parseError);
    }

    const obj = json as Record<string, unknown>;
    const rawExtraction = obj.extraction || obj;
    const rawConfidences = (obj.confidences || {}) as Record<string, number>;

    const extraction = normalizeInvoiceExtraction(rawExtraction);
    const fieldConfidences = buildFieldConfidences(
      extraction as unknown as Record<string, unknown>,
      rawConfidences,
      INVOICE_FIELDS
    );

    return {
      extraction,
      fieldConfidences,
      rawResponse: result.text,
      notes: notes.length > 0 ? notes : undefined,
    };
  } catch (err) {
    notes.push(`extraction_error: ${String(err)}`);
    return createFallbackResult(text, undefined, String(err));
  }
}
