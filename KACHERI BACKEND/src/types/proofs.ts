/* src/types/proofs.ts
   Canonical Proof Packet types for auditable actions */
export type ProofKind =
  | 'ai:compose'
  | 'ai:rewriteSelection'
  | 'ai:constrainedRewrite'
  | 'ai:detectFields'
  | 'ai:translate'
  | 'ai:extraction'
  | 'ai:action'
  | 'export:pdf'
  | 'export:docx'
  | 'import:pdf'
  | 'import:docx'
  | 'import'
  | 'import:apply'
  | 'tts:read_aloud'
  | 'stt:dictate'
  | 'compliance:check'
  | 'clause:insert'
  | 'knowledge:search'
  | 'knowledge:index'
  | 'negotiation:analyze'
  | 'negotiation:counterproposal'
  | 'design:generate'
  | 'design:edit'
  | 'design:style'
  | 'design:content'
  | 'design:compose'
  | 'design:export'
  | 'design:image'
  | 'memory:ingest'
  | 'jaal:summarize'
  | 'jaal:extract_links'
  | 'jaal:compare'
  | 'jaal:capture';

export interface ProofActor {
  type: 'ai' | 'system' | 'user';
  provider?: string;
  model?: string;
}

export interface ProofHashes {
  input?: string;   // sha256 hex
  output?: string;  // sha256 hex
}

export interface ProofPacket {
  id: string;                // uuid
  kind: ProofKind;           // e.g., 'ai:compose'
  timestamp: string;         // ISO 8601
  docId?: string;
  actor: ProofActor;
  input: unknown;            // original inputs (prompt, html, etc.)
  output: unknown;           // model text, export file metadata, etc.
  hashes: ProofHashes;
  meta?: Record<string, unknown>;
}
