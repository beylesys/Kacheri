// KACHERI BACKEND/src/knowledge/memoryIngester.ts
// Memory Graph Ingest Engine — accepts entities and relationships from any product
//
// Slice P2: Memory Graph Ingest Endpoint
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 1, Slice P2

import {
  type EntityType,
  validateEntityType,
  createEntity,
  getEntityByNormalizedName,
  incrementCounts,
} from "../store/workspaceEntities";
import {
  type ProductSource,
  validateProductSource,
  createMention,
} from "../store/entityMentions";
import {
  type RelationshipType,
  validateRelationshipType,
  createRelationship,
} from "../store/entityRelationships";
import { normalizeName } from "./entityHarvester";
import {
  notifyOnEntityIngest,
  notifyOnCrossProductRelationship,
} from "../notifications/crossProductBridge";

/* ---------- Types ---------- */

export interface IngestEntity {
  name: string;
  entityType: string; // validated at runtime to EntityType
  context?: string;
  confidence?: number;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestRelationship {
  fromName: string;
  fromType: string; // validated at runtime to EntityType
  toName: string;
  toType: string; // validated at runtime to EntityType
  relationshipType: string; // validated at runtime to RelationshipType
  label?: string;
  evidence?: string;
}

export interface IngestPayload {
  productSource: string; // validated at runtime to ProductSource
  entities: IngestEntity[];
  relationships?: IngestRelationship[];
}

export interface IngestResult {
  entitiesCreated: number;
  entitiesReused: number;
  mentionsCreated: number;
  relationshipsCreated: number;
  errors: string[];
}

export const MAX_ENTITIES_PER_INGEST = 500;

/* ---------- Validation ---------- */

export interface IngestValidationError {
  field: string;
  message: string;
}

export function validateIngestPayload(
  payload: IngestPayload
): IngestValidationError[] {
  const errors: IngestValidationError[] = [];

  // productSource
  if (!payload.productSource) {
    errors.push({ field: "productSource", message: "productSource is required" });
  } else if (!validateProductSource(payload.productSource)) {
    errors.push({
      field: "productSource",
      message: `Invalid productSource: '${payload.productSource}'. Must be one of: docs, design-studio, research, notes, sheets`,
    });
  }

  // entities array
  if (!Array.isArray(payload.entities)) {
    errors.push({ field: "entities", message: "entities must be an array" });
  } else {
    if (payload.entities.length === 0) {
      errors.push({ field: "entities", message: "entities array must not be empty" });
    }
    if (payload.entities.length > MAX_ENTITIES_PER_INGEST) {
      errors.push({
        field: "entities",
        message: `Maximum ${MAX_ENTITIES_PER_INGEST} entities per ingest call`,
      });
    }

    for (let i = 0; i < payload.entities.length; i++) {
      const e = payload.entities[i];
      if (!e.name || typeof e.name !== "string" || !e.name.trim()) {
        errors.push({ field: `entities[${i}].name`, message: "name is required and must be a non-empty string" });
      }
      if (!e.entityType || !validateEntityType(e.entityType)) {
        errors.push({
          field: `entities[${i}].entityType`,
          message: `Invalid entityType: '${e.entityType}'`,
        });
      }
      if (e.confidence !== undefined && (typeof e.confidence !== "number" || e.confidence < 0 || e.confidence > 1)) {
        errors.push({
          field: `entities[${i}].confidence`,
          message: "confidence must be a number between 0 and 1",
        });
      }
    }
  }

  // relationships (optional)
  if (payload.relationships !== undefined) {
    if (!Array.isArray(payload.relationships)) {
      errors.push({ field: "relationships", message: "relationships must be an array" });
    } else {
      for (let i = 0; i < payload.relationships.length; i++) {
        const r = payload.relationships[i];
        if (!r.fromName || typeof r.fromName !== "string" || !r.fromName.trim()) {
          errors.push({ field: `relationships[${i}].fromName`, message: "fromName is required" });
        }
        if (!r.fromType || !validateEntityType(r.fromType)) {
          errors.push({ field: `relationships[${i}].fromType`, message: `Invalid fromType: '${r.fromType}'` });
        }
        if (!r.toName || typeof r.toName !== "string" || !r.toName.trim()) {
          errors.push({ field: `relationships[${i}].toName`, message: "toName is required" });
        }
        if (!r.toType || !validateEntityType(r.toType)) {
          errors.push({ field: `relationships[${i}].toType`, message: `Invalid toType: '${r.toType}'` });
        }
        if (!r.relationshipType || !validateRelationshipType(r.relationshipType)) {
          errors.push({
            field: `relationships[${i}].relationshipType`,
            message: `Invalid relationshipType: '${r.relationshipType}'`,
          });
        }
      }
    }
  }

  return errors;
}

/* ---------- Ingestion Logic ---------- */

/**
 * Ingest entities and relationships into the Memory Graph from any product.
 *
 * Flow per entity:
 * 1. Normalize name via NFC + trim + lowercase
 * 2. Check for existing entity by normalized name + type (dedup)
 * 3. If exists: reuse entity, increment counts
 * 4. If not: create new entity
 * 5. Create mention with productSource + sourceRef
 *
 * Flow per relationship:
 * 1. Resolve fromName/fromType and toName/toType to entity IDs
 * 2. Create relationship (INSERT OR IGNORE for dedup on pair+type)
 */
export async function ingest(
  workspaceId: string,
  payload: IngestPayload,
  actorId?: string,
): Promise<IngestResult> {
  const result: IngestResult = {
    entitiesCreated: 0,
    entitiesReused: 0,
    mentionsCreated: 0,
    relationshipsCreated: 0,
    errors: [],
  };

  const productSource = payload.productSource as ProductSource;

  // Map of normalizedName:entityType -> entity ID (for relationship resolution)
  const entityIdMap = new Map<string, string>();

  // S14 — Track reused entities and new relationships for cross-product notifications
  const reusedEntityIds = new Set<string>();
  const reusedEntityNames = new Map<string, string>();
  const newRelationshipPairs: Array<{
    fromId: string; fromName: string;
    toId: string; toName: string;
  }> = [];

  // --- Process entities ---
  for (const entityInput of payload.entities) {
    try {
      const normalized = normalizeName(entityInput.name);
      if (!normalized) {
        result.errors.push(`Skipped entity with empty name after normalization: '${entityInput.name}'`);
        continue;
      }

      const entityType = entityInput.entityType as EntityType;
      const mapKey = `${normalized}::${entityType}`;

      // Dedup: check for existing entity
      let entity = await getEntityByNormalizedName(workspaceId, normalized, entityType);

      if (entity) {
        result.entitiesReused++;
        entityIdMap.set(mapKey, entity.id);
        // S14 — Track for cross-product notification
        reusedEntityIds.add(entity.id);
        reusedEntityNames.set(entity.id, entityInput.name.trim());
      } else {
        // Create new entity
        entity = await createEntity({
          workspaceId,
          entityType,
          name: entityInput.name.trim(),
          normalizedName: normalized,
          aliases: [],
          metadata: entityInput.metadata,
        });
        result.entitiesCreated++;
        entityIdMap.set(mapKey, entity.id);
      }

      // Create mention linking entity to the product source
      const mention = await createMention({
        workspaceId,
        entityId: entity.id,
        docId: productSource === "docs" ? entityInput.sourceRef : undefined,
        context: entityInput.context,
        confidence: entityInput.confidence,
        source: "ai_index",
        productSource,
        sourceRef: productSource !== "docs" ? entityInput.sourceRef : undefined,
      });

      if (mention) {
        result.mentionsCreated++;
        // Increment entity counts: +1 mention, +1 doc/source (simplified — source counts as a unique reference)
        await incrementCounts(entity.id, 1, 0);
      }
      // mention === null means INSERT OR IGNORE skipped (duplicate) — that's OK
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Entity '${entityInput.name}': ${msg}`);
    }
  }

  // --- Process relationships ---
  if (payload.relationships) {
    for (const relInput of payload.relationships) {
      try {
        const fromNormalized = normalizeName(relInput.fromName);
        const toNormalized = normalizeName(relInput.toName);
        const fromType = relInput.fromType as EntityType;
        const toType = relInput.toType as EntityType;
        const fromKey = `${fromNormalized}::${fromType}`;
        const toKey = `${toNormalized}::${toType}`;

        // Resolve entity IDs — try map first, then DB lookup
        let fromEntityId = entityIdMap.get(fromKey);
        if (!fromEntityId) {
          const fromEntity = await getEntityByNormalizedName(workspaceId, fromNormalized, fromType);
          if (fromEntity) {
            fromEntityId = fromEntity.id;
            entityIdMap.set(fromKey, fromEntityId);
          }
        }

        let toEntityId = entityIdMap.get(toKey);
        if (!toEntityId) {
          const toEntity = await getEntityByNormalizedName(workspaceId, toNormalized, toType);
          if (toEntity) {
            toEntityId = toEntity.id;
            entityIdMap.set(toKey, toEntityId);
          }
        }

        if (!fromEntityId) {
          result.errors.push(
            `Relationship skipped: entity '${relInput.fromName}' (${relInput.fromType}) not found`
          );
          continue;
        }
        if (!toEntityId) {
          result.errors.push(
            `Relationship skipped: entity '${relInput.toName}' (${relInput.toType}) not found`
          );
          continue;
        }

        const evidence = relInput.evidence
          ? [{ docId: "", context: relInput.evidence }]
          : [];

        const rel = await createRelationship({
          workspaceId,
          fromEntityId,
          toEntityId,
          relationshipType: relInput.relationshipType as RelationshipType,
          label: relInput.label,
          strength: 0.5,
          evidence,
        });

        if (rel) {
          result.relationshipsCreated++;
          // S14 — Track for cross-product relationship notification
          newRelationshipPairs.push({
            fromId: fromEntityId,
            fromName: relInput.fromName,
            toId: toEntityId,
            toName: relInput.toName,
          });
        }
        // rel === null means INSERT OR IGNORE skipped (duplicate pair+type) — OK
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(
          `Relationship '${relInput.fromName}' -> '${relInput.toName}': ${msg}`
        );
      }
    }
  }

  // --- S14: Cross-Product Notification Bridge ---
  // Non-blocking: errors are caught and logged. Never fails the ingest.
  try {
    for (const entityId of reusedEntityIds) {
      const name = reusedEntityNames.get(entityId);
      if (name) {
        notifyOnEntityIngest(workspaceId, entityId, name, productSource, actorId);
      }
    }
    for (const rel of newRelationshipPairs) {
      notifyOnCrossProductRelationship(
        workspaceId, rel.fromId, rel.fromName,
        rel.toId, rel.toName, productSource, actorId,
      );
    }
  } catch (err) {
    console.warn('[memoryIngester] Cross-product notification bridge error (non-fatal):', err);
  }

  return result;
}

/* ---------- Aggregated Export ---------- */

export const MemoryIngester = {
  ingest,
  validateIngestPayload,
  MAX_ENTITIES_PER_INGEST,
};
