// KACHERI BACKEND/src/knowledge/entityHarvester.ts
// Cross-Document Intelligence: Entity harvester for extraction data
//
// Reads extraction_json from the extractions table and maps structured fields
// to canonical workspace entities + mentions. This is a deterministic mapping
// with no AI calls (AI normalization is Slice 4).
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 3

import { WorkspaceEntitiesStore } from "../store/workspaceEntities";
import type { EntityType } from "../store/workspaceEntities";
import { EntityMentionsStore } from "../store/entityMentions";
import { ExtractionsStore } from "../store/extractions";
import type { Extraction, DocumentType } from "../store/extractions";
import { FtsSync } from "./ftsSync";
import { listDocs } from "../store/docs";
import type { RawEntity, HarvestResult } from "./types";

/* ---------- Constants ---------- */

/** Common organization name suffixes for person vs organization heuristic */
const ORG_SUFFIXES = [
  "corp", "corporation", "inc", "incorporated", "llc", "llp",
  "ltd", "limited", "co", "company", "gmbh", "ag", "sa",
  "plc", "pllc", "lp", "group", "partners", "associates",
  "holdings", "enterprises", "foundation", "trust", "bank",
  "institute", "university", "college",
];

/* ---------- Helpers ---------- */

/**
 * Normalize an entity name for dedup matching.
 * Applies Unicode NFC normalization, trim, and lowercase.
 * NFC ensures consistent representation of accented/composite characters
 * (e.g., "café" via precomposed vs combining marks produces the same result).
 * Returns empty string for invalid input.
 */
export function normalizeName(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name.normalize("NFC").trim().toLowerCase();
}

/**
 * Determine if a name looks like an organization (vs a person).
 * Uses suffix matching against common org indicators.
 */
function looksLikeOrganization(name: string): boolean {
  const lower = name.toLowerCase().trim();
  // Check if the name ends with or contains a known org suffix
  const words = lower.split(/\s+/);
  const lastWord = words[words.length - 1]?.replace(/[.,]$/, "") ?? "";
  if (ORG_SUFFIXES.includes(lastWord)) return true;

  // Check if any word in the name is an org suffix (e.g., "Acme Corp International")
  for (const word of words) {
    const cleaned = word.replace(/[.,]$/, "");
    if (ORG_SUFFIXES.includes(cleaned)) return true;
  }

  return false;
}

/**
 * Format an amount as an entity name string.
 * Examples: "$150,000", "150,000 EUR", "10,000"
 */
function formatAmount(value: number, currency?: string): string {
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  if (currency === "USD" || currency === "$") return `$${formatted}`;
  if (currency) return `${formatted} ${currency}`;
  return formatted;
}

/**
 * Safely access a nested property from untyped extraction data.
 */
function safeGet<T>(data: Record<string, unknown>, key: string): T | undefined {
  const val = data[key];
  return val as T | undefined;
}

/**
 * Safely access an array from untyped extraction data.
 */
function safeArray<T>(data: Record<string, unknown>, key: string): T[] {
  const val = data[key];
  if (!Array.isArray(val)) return [];
  return val as T[];
}

/* ---------- Per-Document-Type Harvesters ---------- */

/**
 * Harvest entities from a contract extraction.
 */
function harvestContract(data: Record<string, unknown>): RawEntity[] {
  const entities: RawEntity[] = [];

  // Parties → person or organization + location from address
  const parties = safeArray<{ name?: string; role?: string; address?: string }>(data, "parties");
  for (let i = 0; i < parties.length; i++) {
    const party = parties[i];
    if (party?.name) {
      const isOrg = looksLikeOrganization(party.name);
      entities.push({
        name: party.name,
        entityType: isOrg ? "organization" : "person",
        fieldPath: `parties[${i}].name`,
        context: `Party (${party.role ?? "other"}) in contract`,
        metadata: isOrg ? { role: party.role } : { role: party.role },
      });

      if (party.address) {
        entities.push({
          name: party.address,
          entityType: "location",
          fieldPath: `parties[${i}].address`,
          context: `Address of ${party.name}`,
        });
      }
    }
  }

  // Dates
  const effectiveDate = safeGet<string>(data, "effectiveDate");
  if (effectiveDate) {
    entities.push({
      name: effectiveDate,
      entityType: "date",
      fieldPath: "effectiveDate",
      context: "Effective date of contract",
      metadata: { context: "effective date" },
    });
  }

  const expirationDate = safeGet<string>(data, "expirationDate");
  if (expirationDate) {
    entities.push({
      name: expirationDate,
      entityType: "date",
      fieldPath: "expirationDate",
      context: "Expiration date of contract",
      metadata: { context: "expiration date" },
    });
  }

  // Payment terms
  const paymentTerms = safeGet<{
    amount?: number;
    currency?: string;
    frequency?: string;
    dueDate?: string;
  }>(data, "paymentTerms");
  if (paymentTerms) {
    if (paymentTerms.amount != null) {
      entities.push({
        name: formatAmount(paymentTerms.amount, paymentTerms.currency),
        entityType: "amount",
        fieldPath: "paymentTerms.amount",
        context: "Payment amount in contract",
        metadata: {
          value: paymentTerms.amount,
          currency: paymentTerms.currency ?? "USD",
          frequency: paymentTerms.frequency,
          context: "payment",
        },
      });
    }
    if (paymentTerms.dueDate) {
      entities.push({
        name: paymentTerms.dueDate,
        entityType: "date",
        fieldPath: "paymentTerms.dueDate",
        context: "Payment due date",
        metadata: { context: "due date" },
      });
    }
  }

  // Liability limit
  const liabilityLimit = safeGet<{ amount?: number; currency?: string }>(data, "liabilityLimit");
  if (liabilityLimit?.amount != null) {
    entities.push({
      name: formatAmount(liabilityLimit.amount, liabilityLimit.currency),
      entityType: "amount",
      fieldPath: "liabilityLimit.amount",
      context: "Liability limit in contract",
      metadata: {
        value: liabilityLimit.amount,
        currency: liabilityLimit.currency ?? "USD",
        context: "liability cap",
      },
    });
  }

  // Governing law → location
  const governingLaw = safeGet<string>(data, "governingLaw");
  if (governingLaw) {
    entities.push({
      name: governingLaw,
      entityType: "location",
      fieldPath: "governingLaw",
      context: "Governing law jurisdiction",
      metadata: { context: "governing law" },
    });
  }

  // Signatures
  const signatures = safeArray<{ party?: string; signedDate?: string }>(data, "signatures");
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    if (sig?.party) {
      entities.push({
        name: sig.party,
        entityType: "person",
        fieldPath: `signatures[${i}].party`,
        context: "Signatory of contract",
      });
    }
    if (sig?.signedDate) {
      entities.push({
        name: sig.signedDate,
        entityType: "date",
        fieldPath: `signatures[${i}].signedDate`,
        context: `Signed date by ${sig.party ?? "unknown"}`,
        metadata: { context: "signed date" },
      });
    }
  }

  // Key obligations → term
  const obligations = safeArray<string>(data, "keyObligations");
  for (let i = 0; i < obligations.length; i++) {
    const obligation = obligations[i];
    if (obligation && typeof obligation === "string") {
      entities.push({
        name: obligation,
        entityType: "term",
        fieldPath: `keyObligations[${i}]`,
        context: "Key obligation in contract",
      });
    }
  }

  return entities;
}

/**
 * Harvest entities from an invoice extraction.
 */
function harvestInvoice(data: Record<string, unknown>): RawEntity[] {
  const entities: RawEntity[] = [];

  // Vendor → organization + location
  const vendor = safeGet<{ name?: string; address?: string }>(data, "vendor");
  if (vendor?.name) {
    entities.push({
      name: vendor.name,
      entityType: "organization",
      fieldPath: "vendor.name",
      context: "Invoice vendor",
    });
    if (vendor.address) {
      entities.push({
        name: vendor.address,
        entityType: "location",
        fieldPath: "vendor.address",
        context: `Address of ${vendor.name}`,
      });
    }
  }

  // Customer → organization + location
  const customer = safeGet<{ name?: string; address?: string }>(data, "customer");
  if (customer?.name) {
    entities.push({
      name: customer.name,
      entityType: "organization",
      fieldPath: "customer.name",
      context: "Invoice customer",
    });
    if (customer.address) {
      entities.push({
        name: customer.address,
        entityType: "location",
        fieldPath: "customer.address",
        context: `Address of ${customer.name}`,
      });
    }
  }

  // Dates
  const issueDate = safeGet<string>(data, "issueDate");
  if (issueDate) {
    entities.push({
      name: issueDate,
      entityType: "date",
      fieldPath: "issueDate",
      context: "Invoice issue date",
      metadata: { context: "issue date" },
    });
  }

  const dueDate = safeGet<string>(data, "dueDate");
  if (dueDate) {
    entities.push({
      name: dueDate,
      entityType: "date",
      fieldPath: "dueDate",
      context: "Invoice due date",
      metadata: { context: "due date" },
    });
  }

  // Line items → product
  const currency = safeGet<string>(data, "currency") ?? "USD";
  const lineItems = safeArray<{ description?: string; amount?: number }>(data, "lineItems");
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    if (item?.description) {
      entities.push({
        name: item.description,
        entityType: "product",
        fieldPath: `lineItems[${i}].description`,
        context: "Invoice line item",
      });
    }
  }

  // Total amount
  const total = safeGet<number>(data, "total");
  if (total != null) {
    entities.push({
      name: formatAmount(total, currency),
      entityType: "amount",
      fieldPath: "total",
      context: "Invoice total",
      metadata: { value: total, currency, context: "invoice total" },
    });
  }

  // Subtotal
  const subtotal = safeGet<number>(data, "subtotal");
  if (subtotal != null && subtotal !== total) {
    entities.push({
      name: formatAmount(subtotal, currency),
      entityType: "amount",
      fieldPath: "subtotal",
      context: "Invoice subtotal",
      metadata: { value: subtotal, currency, context: "subtotal" },
    });
  }

  // Tax
  const tax = safeGet<number>(data, "tax");
  if (tax != null && tax > 0) {
    entities.push({
      name: formatAmount(tax, currency),
      entityType: "amount",
      fieldPath: "tax",
      context: "Invoice tax",
      metadata: { value: tax, currency, context: "tax" },
    });
  }

  return entities;
}

/**
 * Harvest entities from a proposal extraction.
 */
function harvestProposal(data: Record<string, unknown>): RawEntity[] {
  const entities: RawEntity[] = [];

  // Vendor and client → organization
  const vendor = safeGet<string>(data, "vendor");
  if (vendor) {
    entities.push({
      name: vendor,
      entityType: "organization",
      fieldPath: "vendor",
      context: "Proposal vendor",
    });
  }

  const client = safeGet<string>(data, "client");
  if (client) {
    entities.push({
      name: client,
      entityType: "organization",
      fieldPath: "client",
      context: "Proposal client",
    });
  }

  // Dates
  const date = safeGet<string>(data, "date");
  if (date) {
    entities.push({
      name: date,
      entityType: "date",
      fieldPath: "date",
      context: "Proposal date",
      metadata: { context: "proposal date" },
    });
  }

  const validUntil = safeGet<string>(data, "validUntil");
  if (validUntil) {
    entities.push({
      name: validUntil,
      entityType: "date",
      fieldPath: "validUntil",
      context: "Proposal valid until",
      metadata: { context: "valid until" },
    });
  }

  // Deliverables → product
  const deliverables = safeArray<{ name?: string }>(data, "deliverables");
  for (let i = 0; i < deliverables.length; i++) {
    const d = deliverables[i];
    if (d?.name) {
      entities.push({
        name: d.name,
        entityType: "product",
        fieldPath: `deliverables[${i}].name`,
        context: "Proposal deliverable",
      });
    }
  }

  // Pricing
  const pricing = safeGet<{
    total?: number;
    currency?: string;
    breakdown?: Array<{ item?: string; amount?: number }>;
  }>(data, "pricing");
  if (pricing) {
    if (pricing.total != null) {
      entities.push({
        name: formatAmount(pricing.total, pricing.currency),
        entityType: "amount",
        fieldPath: "pricing.total",
        context: "Proposal total price",
        metadata: {
          value: pricing.total,
          currency: pricing.currency ?? "USD",
          context: "proposal total",
        },
      });
    }
    if (pricing.breakdown) {
      for (let i = 0; i < pricing.breakdown.length; i++) {
        const item = pricing.breakdown[i];
        if (item?.amount != null) {
          entities.push({
            name: formatAmount(item.amount, pricing.currency),
            entityType: "amount",
            fieldPath: `pricing.breakdown[${i}].amount`,
            context: `Pricing for ${item.item ?? "item"}`,
            metadata: {
              value: item.amount,
              currency: pricing.currency ?? "USD",
              context: "pricing breakdown",
            },
          });
        }
      }
    }
  }

  // Timeline
  const timeline = safeGet<{
    startDate?: string;
    endDate?: string;
    milestones?: Array<{ name?: string; date?: string }>;
  }>(data, "timeline");
  if (timeline) {
    if (timeline.startDate) {
      entities.push({
        name: timeline.startDate,
        entityType: "date",
        fieldPath: "timeline.startDate",
        context: "Proposal start date",
        metadata: { context: "start date" },
      });
    }
    if (timeline.endDate) {
      entities.push({
        name: timeline.endDate,
        entityType: "date",
        fieldPath: "timeline.endDate",
        context: "Proposal end date",
        metadata: { context: "end date" },
      });
    }
    if (timeline.milestones) {
      for (let i = 0; i < timeline.milestones.length; i++) {
        const ms = timeline.milestones[i];
        if (ms?.name) {
          entities.push({
            name: ms.name,
            entityType: "term",
            fieldPath: `timeline.milestones[${i}].name`,
            context: "Proposal milestone",
          });
        }
        if (ms?.date) {
          entities.push({
            name: ms.date,
            entityType: "date",
            fieldPath: `timeline.milestones[${i}].date`,
            context: `Milestone date: ${ms.name ?? ""}`,
            metadata: { context: "milestone date" },
          });
        }
      }
    }
  }

  // Scope → term
  const scope = safeArray<string>(data, "scope");
  for (let i = 0; i < scope.length; i++) {
    const item = scope[i];
    if (item && typeof item === "string") {
      entities.push({
        name: item,
        entityType: "term",
        fieldPath: `scope[${i}]`,
        context: "Proposal scope item",
      });
    }
  }

  return entities;
}

/**
 * Harvest entities from a meeting notes extraction.
 */
function harvestMeetingNotes(data: Record<string, unknown>): RawEntity[] {
  const entities: RawEntity[] = [];

  // Meeting date
  const date = safeGet<string>(data, "date");
  if (date) {
    entities.push({
      name: date,
      entityType: "date",
      fieldPath: "date",
      context: "Meeting date",
      metadata: { context: "meeting date" },
    });
  }

  // Attendees → person
  const attendees = safeArray<string>(data, "attendees");
  for (let i = 0; i < attendees.length; i++) {
    const name = attendees[i];
    if (name && typeof name === "string") {
      entities.push({
        name,
        entityType: "person",
        fieldPath: `attendees[${i}]`,
        context: "Meeting attendee",
      });
    }
  }

  // Absentees → person
  const absentees = safeArray<string>(data, "absentees");
  for (let i = 0; i < absentees.length; i++) {
    const name = absentees[i];
    if (name && typeof name === "string") {
      entities.push({
        name,
        entityType: "person",
        fieldPath: `absentees[${i}]`,
        context: "Meeting absentee",
      });
    }
  }

  // Action items → person (assignee), date (dueDate), term (task)
  const actionItems = safeArray<{
    task?: string;
    assignee?: string;
    dueDate?: string;
  }>(data, "actionItems");
  for (let i = 0; i < actionItems.length; i++) {
    const item = actionItems[i];
    if (item?.assignee) {
      entities.push({
        name: item.assignee,
        entityType: "person",
        fieldPath: `actionItems[${i}].assignee`,
        context: `Assigned to: ${item.task ?? "action item"}`,
      });
    }
    if (item?.dueDate) {
      entities.push({
        name: item.dueDate,
        entityType: "date",
        fieldPath: `actionItems[${i}].dueDate`,
        context: `Due date for: ${item.task ?? "action item"}`,
        metadata: { context: "action item due date" },
      });
    }
    if (item?.task) {
      entities.push({
        name: item.task,
        entityType: "term",
        fieldPath: `actionItems[${i}].task`,
        context: "Meeting action item",
      });
    }
  }

  // Discussions → concept (topic)
  const discussions = safeArray<{ topic?: string }>(data, "discussions");
  for (let i = 0; i < discussions.length; i++) {
    const d = discussions[i];
    if (d?.topic) {
      entities.push({
        name: d.topic,
        entityType: "concept",
        fieldPath: `discussions[${i}].topic`,
        context: "Meeting discussion topic",
      });
    }
  }

  // Next meeting date
  const nextMeeting = safeGet<{ date?: string }>(data, "nextMeeting");
  if (nextMeeting?.date) {
    entities.push({
      name: nextMeeting.date,
      entityType: "date",
      fieldPath: "nextMeeting.date",
      context: "Next meeting date",
      metadata: { context: "next meeting" },
    });
  }

  return entities;
}

/**
 * Harvest entities from a report extraction.
 */
function harvestReport(data: Record<string, unknown>): RawEntity[] {
  const entities: RawEntity[] = [];

  // Author → person or organization
  const author = safeGet<string>(data, "author");
  if (author) {
    const isOrg = looksLikeOrganization(author);
    entities.push({
      name: author,
      entityType: isOrg ? "organization" : "person",
      fieldPath: "author",
      context: "Report author",
    });
  }

  // Date
  const date = safeGet<string>(data, "date");
  if (date) {
    entities.push({
      name: date,
      entityType: "date",
      fieldPath: "date",
      context: "Report date",
      metadata: { context: "report date" },
    });
  }

  // Period
  const period = safeGet<{ from?: string; to?: string }>(data, "period");
  if (period) {
    if (period.from) {
      entities.push({
        name: period.from,
        entityType: "date",
        fieldPath: "period.from",
        context: "Report period start",
        metadata: { context: "period start" },
      });
    }
    if (period.to) {
      entities.push({
        name: period.to,
        entityType: "date",
        fieldPath: "period.to",
        context: "Report period end",
        metadata: { context: "period end" },
      });
    }
  }

  // Metrics → amount (numeric) or term (non-numeric)
  const metrics = safeArray<{
    name?: string;
    value?: string | number;
    change?: string;
    trend?: string;
  }>(data, "metrics");
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (m?.name) {
      entities.push({
        name: m.name,
        entityType: "term",
        fieldPath: `metrics[${i}].name`,
        context: "Report metric",
      });
    }
    if (m?.value != null && typeof m.value === "number") {
      entities.push({
        name: formatAmount(m.value),
        entityType: "amount",
        fieldPath: `metrics[${i}].value`,
        context: `Metric value: ${m.name ?? ""}`,
        metadata: {
          value: m.value,
          context: "metric",
          change: m.change,
          trend: m.trend,
        },
      });
    }
  }

  // Risks → concept
  const risks = safeArray<{ description?: string }>(data, "risks");
  for (let i = 0; i < risks.length; i++) {
    const r = risks[i];
    if (r?.description) {
      entities.push({
        name: r.description,
        entityType: "concept",
        fieldPath: `risks[${i}].description`,
        context: "Report risk",
      });
    }
  }

  // Key findings → concept
  const keyFindings = safeArray<string>(data, "keyFindings");
  for (let i = 0; i < keyFindings.length; i++) {
    const finding = keyFindings[i];
    if (finding && typeof finding === "string") {
      entities.push({
        name: finding,
        entityType: "concept",
        fieldPath: `keyFindings[${i}]`,
        context: "Report key finding",
      });
    }
  }

  // Recommendations → concept
  const recommendations = safeArray<string>(data, "recommendations");
  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    if (rec && typeof rec === "string") {
      entities.push({
        name: rec,
        entityType: "concept",
        fieldPath: `recommendations[${i}]`,
        context: "Report recommendation",
      });
    }
  }

  return entities;
}

/**
 * Harvest entities from a generic/other extraction.
 */
function harvestGeneric(data: Record<string, unknown>): RawEntity[] {
  const entities: RawEntity[] = [];

  // Author → person
  const author = safeGet<string>(data, "author");
  if (author) {
    const isOrg = looksLikeOrganization(author);
    entities.push({
      name: author,
      entityType: isOrg ? "organization" : "person",
      fieldPath: "author",
      context: "Document author",
    });
  }

  // Date
  const date = safeGet<string>(data, "date");
  if (date) {
    entities.push({
      name: date,
      entityType: "date",
      fieldPath: "date",
      context: "Document date",
      metadata: { context: "document date" },
    });
  }

  // Entities array → directly mapped
  const genericEntities = safeArray<{
    type?: string;
    value?: string;
    context?: string;
  }>(data, "entities");
  for (let i = 0; i < genericEntities.length; i++) {
    const e = genericEntities[i];
    if (e?.value && e.type) {
      // Map GenericEntity types to EntityType
      const typeMap: Record<string, EntityType> = {
        person: "person",
        organization: "organization",
        date: "date",
        amount: "amount",
        location: "location",
        other: "term", // Map 'other' to 'term'
      };
      const entityType = typeMap[e.type] ?? "term";

      entities.push({
        name: e.value,
        entityType,
        fieldPath: `entities[${i}]`,
        context: e.context ?? `Generic entity (${e.type})`,
      });
    }
  }

  // Dates array
  const dates = safeArray<{ date?: string; context?: string }>(data, "dates");
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    if (d?.date) {
      entities.push({
        name: d.date,
        entityType: "date",
        fieldPath: `dates[${i}].date`,
        context: d.context ?? "Date in document",
        metadata: { context: d.context },
      });
    }
  }

  // Amounts array
  const amounts = safeArray<{
    value?: number;
    currency?: string;
    context?: string;
  }>(data, "amounts");
  for (let i = 0; i < amounts.length; i++) {
    const a = amounts[i];
    if (a?.value != null) {
      entities.push({
        name: formatAmount(a.value, a.currency),
        entityType: "amount",
        fieldPath: `amounts[${i}]`,
        context: a.context ?? "Amount in document",
        metadata: {
          value: a.value,
          currency: a.currency ?? "USD",
          context: a.context ?? "amount",
        },
      });
    }
  }

  return entities;
}

/* ---------- Core Processing ---------- */

/** Map document type to its harvester function */
const HARVESTERS: Record<DocumentType, (data: Record<string, unknown>) => RawEntity[]> = {
  contract: harvestContract,
  invoice: harvestInvoice,
  proposal: harvestProposal,
  meeting_notes: harvestMeetingNotes,
  report: harvestReport,
  other: harvestGeneric,
};

/**
 * Process raw entities: deduplicate against existing canonical entities,
 * create new entities and mentions, update counts and FTS index.
 */
async function processRawEntities(
  rawEntities: RawEntity[],
  workspaceId: string,
  docId: string,
  fieldConfidences?: Record<string, number> | null
): Promise<HarvestResult> {
  const result: HarvestResult = {
    docId,
    workspaceId,
    entitiesCreated: 0,
    entitiesReused: 0,
    mentionsCreated: 0,
    mentionsSkipped: 0,
    errors: [],
  };

  // Build set of entity IDs already mentioned in this doc (for doc_count tracking)
  const existingMentions = await EntityMentionsStore.getByDoc(docId);
  const entityIdsInDoc = new Set(existingMentions.map((m) => m.entityId));

  // Track entity IDs we've seen in this batch (for doc_count tracking within batch)
  const batchEntityIds = new Set<string>();

  for (const raw of rawEntities) {
    try {
      // Skip empty names
      const trimmedName = raw.name?.trim();
      if (!trimmedName) continue;

      const normalized = normalizeName(trimmedName);
      if (!normalized) continue;

      // Determine confidence
      let confidence = raw.confidence ?? 0.75;
      if (fieldConfidences && raw.fieldPath in fieldConfidences) {
        confidence = fieldConfidences[raw.fieldPath];
      }

      // Look up existing canonical entity
      let entity = await WorkspaceEntitiesStore.getByNormalizedName(
        workspaceId,
        normalized,
        raw.entityType
      );

      if (entity) {
        // Reuse existing entity
        result.entitiesReused++;
      } else {
        // Create new canonical entity
        try {
          entity = await WorkspaceEntitiesStore.create({
            workspaceId,
            entityType: raw.entityType,
            name: trimmedName,
            normalizedName: normalized,
            metadata: raw.metadata,
          });
          result.entitiesCreated++;

          // Sync new entity to FTS5 index
          try {
            await FtsSync.syncEntity(entity.id, workspaceId, entity.name, entity.aliases);
          } catch (ftsErr) {
            result.errors.push(`FTS sync failed for entity "${trimmedName}": ${String(ftsErr)}`);
          }
        } catch (createErr) {
          if ((createErr as { name?: string }).name === "EntityLimitExceededError") {
            result.errors.push(
              `Entity limit reached for workspace ${workspaceId}. Skipping new entity "${trimmedName}".`
            );
            continue; // Skip this raw entity entirely
          }
          throw createErr; // Re-throw other errors
        }
      }

      // Create mention
      const mention = await EntityMentionsStore.create({
        workspaceId,
        entityId: entity.id,
        docId,
        context: raw.context,
        fieldPath: raw.fieldPath,
        confidence,
        source: "extraction",
        productSource: "docs",
      });

      if (mention) {
        result.mentionsCreated++;

        // Determine if this is a new doc association for this entity
        const isNewDocAssociation =
          !entityIdsInDoc.has(entity.id) && !batchEntityIds.has(entity.id);

        const docDelta = isNewDocAssociation ? 1 : 0;
        await WorkspaceEntitiesStore.incrementCounts(entity.id, 1, docDelta);

        // Track this entity in the batch
        batchEntityIds.add(entity.id);
      } else {
        // Duplicate mention (INSERT OR IGNORE)
        result.mentionsSkipped++;
      }
    } catch (err) {
      result.errors.push(
        `Failed to process entity "${raw.name}" (${raw.entityType}): ${String(err)}`
      );
    }
  }

  return result;
}

/* ---------- Public Functions ---------- */

/**
 * Harvest entities from an Extraction object.
 * Routes to per-document-type harvester based on documentType.
 */
export async function harvestFromExtraction(
  extraction: Extraction,
  workspaceId: string
): Promise<HarvestResult> {
  const emptyResult: HarvestResult = {
    docId: extraction.docId,
    workspaceId,
    entitiesCreated: 0,
    entitiesReused: 0,
    mentionsCreated: 0,
    mentionsSkipped: 0,
    errors: [],
  };

  try {
    const harvester = HARVESTERS[extraction.documentType];
    if (!harvester) {
      console.warn(
        `[entity_harvester] Unknown document type: ${extraction.documentType}`
      );
      return emptyResult;
    }

    const rawEntities = harvester(extraction.extraction);

    return await processRawEntities(
      rawEntities,
      workspaceId,
      extraction.docId,
      extraction.fieldConfidences
    );
  } catch (err) {
    console.error("[entity_harvester] Failed to harvest from extraction:", err);
    return {
      ...emptyResult,
      errors: [`Harvest failed: ${String(err)}`],
    };
  }
}

/**
 * Harvest entities from a document by loading its extraction.
 * Returns early with zero counts if no extraction exists.
 */
export async function harvestFromDoc(
  docId: string,
  workspaceId: string
): Promise<HarvestResult> {
  const emptyResult: HarvestResult = {
    docId,
    workspaceId,
    entitiesCreated: 0,
    entitiesReused: 0,
    mentionsCreated: 0,
    mentionsSkipped: 0,
    errors: [],
  };

  try {
    const extraction = await ExtractionsStore.getByDocId(docId);
    if (!extraction) {
      return emptyResult;
    }

    return await harvestFromExtraction(extraction, workspaceId);
  } catch (err) {
    console.error("[entity_harvester] Failed to harvest from doc:", err);
    return {
      ...emptyResult,
      errors: [`Harvest from doc failed: ${String(err)}`],
    };
  }
}

/**
 * Harvest entities from all documents in a workspace.
 * Iterates docs that have extractions, aggregates results.
 */
export async function harvestWorkspace(workspaceId: string): Promise<HarvestResult> {
  const aggregated: HarvestResult = {
    docId: "",
    workspaceId,
    entitiesCreated: 0,
    entitiesReused: 0,
    mentionsCreated: 0,
    mentionsSkipped: 0,
    errors: [],
  };

  try {
    const docs = await listDocs(workspaceId);

    for (const doc of docs) {
      const result = await harvestFromDoc(doc.id, workspaceId);
      aggregated.entitiesCreated += result.entitiesCreated;
      aggregated.entitiesReused += result.entitiesReused;
      aggregated.mentionsCreated += result.mentionsCreated;
      aggregated.mentionsSkipped += result.mentionsSkipped;
      if (result.errors.length > 0) {
        aggregated.errors.push(...result.errors);
      }
    }

    return aggregated;
  } catch (err) {
    console.error("[entity_harvester] Failed to harvest workspace:", err);
    return {
      ...aggregated,
      errors: [...aggregated.errors, `Workspace harvest failed: ${String(err)}`],
    };
  }
}

/* ---------- Export aggregated object ---------- */

export const EntityHarvester = {
  harvestFromDoc,
  harvestFromExtraction,
  harvestWorkspace,
  // Exposed for testing
  normalizeName,
};
