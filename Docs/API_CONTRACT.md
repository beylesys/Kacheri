# Kacheri API Contract

> AI-Native Document Platform with Verifiable Proof Trails

**Version:** 1.0.0
**Base URL:** `http://localhost:3001` (development)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Common Headers](#common-headers)
4. [Error Responses](#error-responses)
5. [API Endpoints](#api-endpoints)
   - [Auth](#auth-endpoints)
   - [Documents](#document-endpoints)
   - [AI Operations](#ai-endpoints)
   - [Export & Import](#export--import-endpoints)
   - [Images](#image-endpoints)
   - [Provenance & Evidence](#provenance--evidence-endpoints)
   - [File Manager](#file-manager-endpoints)
   - [Workspaces](#workspace-endpoints)
   - [Doc Permissions](#doc-permission-endpoints)
   - [Comments](#comment-endpoints)
   - [Version History](#version-history-endpoints)
   - [Suggestions](#suggestion-endpoints)
   - [Templates](#template-endpoints)
   - [Doc Links](#doc-link-endpoints)
   - [Messages](#message-endpoints)
   - [Notifications](#notification-endpoints)
   - [Audit Log](#audit-log-endpoints)
   - [AI Watch (Monitoring)](#ai-watch-endpoints)
   - [Infrastructure (Artifacts & Jobs)](#infrastructure-endpoints-phase-5---p4)
   - [AI Providers](#ai-provider-endpoints)
   - [Observability](#observability-endpoints-phase-5---p5)
   - [Document Intelligence](#document-intelligence--extraction-endpoints)
   - [Workspace Extraction Standards](#workspace-extraction-standards-endpoints-slice-7)
   - [Compliance Checker](#compliance-checker-endpoints-slice-a5)
   - [Compliance Policy Management](#compliance-policy-management-endpoints-slice-a6)
   - [Clause Library](#clause-library-endpoints-slice-b2)
   - [Clause Versioning](#clause-versioning-endpoints-slice-b3)
   - [Clause Insertion & Usage Tracking](#clause-insertion--usage-tracking-endpoints-slice-b4)
   - [Clause Suggestion](#clause-suggestion-endpoints-slice-b6)
   - [Create Clause from Selection](#create-clause-from-selection-endpoint-slice-b7)
   - [Cross-Document Intelligence (Knowledge Graph)](#cross-document-intelligence-knowledge-graph-endpoints-slice-8)
   - [Cross-Document Intelligence — Search, Indexing & Summary](#cross-document-intelligence--search-indexing--summary-slice-9)
   - [Negotiation Sessions & Rounds](#negotiation-sessions--rounds-endpoints-slice-6)
   - [Negotiation Changes & Analysis](#negotiation-changes--analysis-endpoints-slice-7)
   - [Negotiation Settlement & History](#negotiation-settlement--history-endpoints-slice-8)
   - [Document Attachments](#document-attachment-endpoints-slice-4)
   - **Beyle Design Studio**
   - [Design Studio — Canvas CRUD & Permissions](#design-studio-endpoints-slice-a3)
   - [Design Studio — KCL Serving](#kcl-serving-endpoints-slice-a6)
   - [Design Studio — AI Endpoints](#design-studio-ai-endpoints-slice-b3)
   - [Design Studio — Versions & Exports](#canvas-version--export-endpoints-slice-b4)
   - [Design Studio — Frame Templates](#frame-templates-slice-d9)
   - [Design Studio — AI Image & Assets](#ai-image-generation--canvas-assets-slice-b5)
   - [Design Studio — Canvas Provenance](#canvas-provenance-endpoint-slice-e3)
   - [Design Studio — KCL Asset Proxy](#kcl-asset-proxy-endpoint-slice-e1)
   - [Design Studio — Canvas Embed in Docs](#canvas-frame-embedding--cross-product-slice-p9)
   - [Design Studio — Public Embed / Widget](#public-canvas-embed--embedwidget-mode-slice-e5)
   - [Design Studio — Workspace Embed Whitelist](#workspace-embed-whitelist-slice-e7)
   - [Workspace AI Settings (BYOK + Model Selection)](#workspace-ai-settings-byok--model-selection)
   - **Platform**
   - [Memory Graph](#memory-graph-endpoints-slice-p2)
   - [Platform Config](#platform-config-endpoint-slice-m3)
   - [Personal Access Tokens](#personal-access-token-pat-endpoints-slice-p4)
   - **JAAL Research Browser**
   - [JAAL Sessions](#jaal-session-endpoints-slice-s5)
   - [JAAL Guide (AI Actions)](#jaal-guide-ai-action-endpoints-slice-s5)
   - [JAAL Proofs](#jaal-proof-endpoints-slice-s5)
   - [JAAL Policy](#jaal-policy-endpoints-slice-s5)
   - [JAAL Browse Proxy](#jaal-browse-proxy-endpoint-slice-s5)
   - [Health & Debug](#health--debug-endpoints)
6. [WebSocket Events](#websocket-events)
7. [Data Models](#data-models)

---

## Overview

Kacheri is an AI-native document platform that provides:
- Document creation and management with real-time collaboration
- AI-powered content generation and rewriting
- Verifiable proof trails for all AI-assisted actions
- Multi-format import/export (PDF, DOCX, images, etc.)
- Workspace-based collaboration with role-based access control

### Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | Fastify (Node.js) |
| Database | SQLite |
| Frontend | React 19 + TypeScript |
| Real-time | WebSocket (Yjs + Custom) |
| AI Providers | OpenAI, Anthropic, Ollama, Dev stub |

---

## Authentication

The API supports two authentication methods:

1. **JWT (JSON Web Tokens)** — For interactive users (browser sessions)
2. **Personal Access Tokens (PATs)** — For external clients, scripts, and integrations (e.g. JAAL Research Browser)

Both methods use the `Authorization: Bearer <token>` header. The server distinguishes between them by the token prefix: PATs begin with `bpat_`.

### JWT-Based Authentication

The API uses JWT (JSON Web Tokens) for authentication with two token types:

| Token Type | Lifetime | Purpose |
|------------|----------|---------|
| Access Token | ~1 hour | API authorization |
| Refresh Token | Long-lived | Obtain new access tokens |

### Token Payload Structure

**Access Token:**
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "name": "Display Name",
  "type": "access",
  "iat": 1704067200,
  "exp": 1704070800
}
```

**Refresh Token:**
```json
{
  "sub": "user_id",
  "sid": "session_id",
  "type": "refresh",
  "iat": 1704067200,
  "exp": 1706745600
}
```

### Authentication Flow

```
1. Register/Login → Receive accessToken + refreshToken
2. Include accessToken in Authorization header for API calls
3. When accessToken expires, use refreshToken to get new tokens
4. On logout, refresh token is revoked server-side
```

### Token Storage (Known Limitation)

Tokens are currently stored in `localStorage` on the client. This is a known limitation — `localStorage` is accessible to any JavaScript running on the page, which means a successful XSS attack could exfiltrate tokens. Migration to `httpOnly` cookies is a future hardening item that requires a full auth flow redesign (cookie-based CSRF protection, `SameSite` attribute, etc.) and is out of scope for the current security hardening pass.

---

## Common Headers

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes* | `Bearer <accessToken>` |
| `Content-Type` | Yes | `application/json` (except file uploads) |
| `X-Dev-User` | No | User ID for dev mode bypass |
| `X-Workspace-Id` | No | Scope requests to workspace |
| `X-User-Id` | No | Track action initiator |
| `X-AI-Provider` | No | Override AI provider (openai/anthropic/ollama) |
| `X-AI-Model` | No | Override AI model |
| `X-AI-Seed` | No | Seed for deterministic AI output |

*Not required for public routes (auth endpoints, health check)

---

## Error Responses

### Standard Error Format

```json
{
  "error": "error_code",
  "message": "Human readable description",
  "details": "Additional context (optional)"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Resource created |
| `204` | Success (no content) |
| `400` | Bad request / Invalid input |
| `401` | Authentication required or failed |
| `403` | Permission denied |
| `404` | Resource not found |
| `409` | Conflict (e.g., folder not empty) |
| `422` | Unprocessable entity (validation failed) |
| `500` | Internal server error |
| `503` | Service unavailable (maintenance mode) |

---

## API Endpoints

### Auth Endpoints

#### Get Auth Status

Returns system authentication status. Always accessible.

```http
GET /auth/status
```

**Response:**
```json
{
  "authEnabled": true,
  "maintenanceMode": false,
  "version": "1.0.0"
}
```

---

#### Register

Create a new user account.

```http
POST /auth/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "displayName": "John Doe"
}
```

**Response:** `201 Created`
```json
{
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": null,
    "status": "active"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "expiresAt": 1704070800
}
```

**Errors:**
- `400` - Missing required fields
- `409` - Email already exists

---

#### Login

Authenticate user and receive tokens.

```http
POST /auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": null,
    "status": "active"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "expiresAt": 1704070800
}
```

**Errors:**
- `401` - Invalid credentials

---

#### Logout

Revoke the current session.

```http
POST /auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body (optional):**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:** `200 OK`
```json
{
  "ok": true
}
```

---

#### Refresh Tokens

Exchange refresh token for new access token.

```http
POST /auth/refresh
Content-Type: application/json
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "expiresAt": 1704074400
}
```

**Errors:**
- `401` - Invalid or expired refresh token

---

#### Get Current User

Get authenticated user's profile.

```http
GET /auth/me
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg",
    "status": "active"
  }
}
```

---

### Personal Access Token (PAT) Endpoints (Slice P4)

PATs provide an alternative to JWT authentication for external API clients, scripts, and integrations.

**Token Format:** `bpat_<random-32-characters>`

**Usage:** Include the PAT in the `Authorization` header exactly like a JWT:
```
Authorization: Bearer bpat_abc123...
```

The auth middleware automatically detects the `bpat_` prefix and validates the PAT instead of attempting JWT verification.

**Constraints:**
- Maximum 10 active PATs per user
- Each PAT is scoped to a single workspace
- Token value is shown **only once** at creation time
- Tokens are stored as SHA256 hashes (not recoverable)

**Available Scopes:**

| Scope | Description |
|-------|-------------|
| `docs:read` | Read documents |
| `docs:write` | Create/update/delete documents |
| `memory:write` | Ingest data into the memory graph |
| `ai:invoke` | Invoke AI operations |
| `workspace:read` | Read workspace metadata |

When `scopes` is `null` or omitted, the PAT has unrestricted access within its workspace.

---

#### Create PAT

Create a new personal access token.

```http
POST /auth/tokens
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "CI Pipeline Token",
  "workspaceId": "ws_abc123",
  "scopes": ["docs:read", "docs:write"],
  "expiresInSeconds": 2592000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable name (max 100 chars) |
| `workspaceId` | string | Yes | Workspace this PAT is scoped to |
| `scopes` | string[] | No | Restrict to specific scopes. Null = unrestricted |
| `expiresInSeconds` | number | No | Seconds until expiry (max 31536000 = 1 year). Null = no expiry |

**Response:** `201 Created`
```json
{
  "token": "bpat_abc123...",
  "pat": {
    "id": "pat_xyz789",
    "name": "CI Pipeline Token",
    "workspaceId": "ws_abc123",
    "scopes": ["docs:read", "docs:write"],
    "expiresAt": 1706745600,
    "createdAt": 1704153600
  }
}
```

**IMPORTANT:** The `token` field is only returned in this response. Store it securely — it cannot be retrieved again.

**Errors:**
- `400` — Missing required fields or invalid scopes
- `401` — Not authenticated
- `409` — Maximum PAT limit (10) reached

---

#### List PATs

List all active PATs for the authenticated user.

```http
GET /auth/tokens
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "tokens": [
    {
      "id": "pat_xyz789",
      "name": "CI Pipeline Token",
      "workspaceId": "ws_abc123",
      "scopes": ["docs:read", "docs:write"],
      "expiresAt": 1706745600,
      "lastUsedAt": 1704240000,
      "createdAt": 1704153600
    }
  ]
}
```

Note: Token values are never returned in list responses.

---

#### Revoke PAT

Revoke (permanently invalidate) a personal access token.

```http
DELETE /auth/tokens/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "ok": true
}
```

**Errors:**
- `400` — Invalid token ID format
- `401` — Not authenticated
- `404` — Token not found or already revoked

---

### Document Endpoints

#### List Documents

Get all documents.

```http
GET /docs
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
[
  {
    "id": "doc_xyz789",
    "title": "My Document",
    "updatedAt": "2024-01-01T12:00:00Z"
  }
]
```

---

#### Create Document

Create a new document.

```http
POST /docs
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "New Document"
}
```

**Response:** `201 Created`
```json
{
  "id": "doc_xyz789",
  "title": "New Document",
  "updatedAt": "2024-01-01T12:00:00Z"
}
```

---

#### Get Document

Get document by ID.

```http
GET /docs/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "id": "doc_xyz789",
  "title": "My Document",
  "updatedAt": "2024-01-01T12:00:00Z"
}
```

**Errors:**
- `404` - Document not found

---

#### Update Document Title

Rename a document.

```http
PATCH /docs/:id
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Updated Title"
}
```

**Response:** `200 OK`
```json
{
  "id": "doc_xyz789",
  "title": "Updated Title",
  "updatedAt": "2024-01-01T13:00:00Z"
}
```

---

#### Delete Document

Delete a document.

```http
DELETE /docs/:id
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

---

### AI Endpoints

#### Compose (Generate Content)

Generate new content using AI.

```http
POST /docs/:id/ai/compose
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Write a professional email declining a meeting invitation",
  "language": "en",
  "systemPrompt": "You are a professional business writer",
  "maxTokens": 500,
  "seed": "optional_seed_for_determinism",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | The generation prompt |
| `language` | string | No | Output language (default: "en") |
| `systemPrompt` | string | No | Custom system prompt |
| `maxTokens` | number | No | Max output tokens |
| `seed` | string/number | No | Seed for reproducibility |
| `provider` | string | No | AI provider (openai/anthropic/ollama/dev) |
| `model` | string | No | Specific model to use |

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "proposalText": "Dear [Name],\n\nThank you for the meeting invitation...",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "proof": {
    "id": 123,
    "path": "proofs/doc_xyz789/compose_1704067200.json",
    "timestamp": "2024-01-01T12:00:00Z"
  },
  "proofHash": "sha256:a1b2c3d4e5f6..."
}
```

---

#### Rewrite Selection

Rewrite a specific text selection.

```http
POST /docs/:id/ai/rewriteSelection
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fullText": "The entire document text goes here...",
  "selection": {
    "start": 10,
    "end": 50
  },
  "instructions": "Make this more concise and professional",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "seed": "optional_seed"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fullText` | string | Yes | Complete document text |
| `selection` | object | Yes | Start and end positions |
| `instructions` | string | Yes | Rewrite instructions |
| `provider` | string | No | AI provider |
| `model` | string | No | Model to use |
| `seed` | string/number | No | Seed for reproducibility |

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "jobId": "rw_1704067200_abc123",
  "selection": {
    "start": 10,
    "end": 50
  },
  "rewritten": "The rewritten text...",
  "beforeHash": "sha256:original_hash...",
  "afterHash": "sha256:new_hash...",
  "newFullText": "Updated full document with rewritten section...",
  "proofId": 124,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "seed": null
}
```

---

#### Constrained Rewrite

Rewrite text while preserving structure and format.

```http
POST /docs/:id/ai/constrainedRewrite
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fullText": "The entire document text...",
  "selection": {
    "start": 0,
    "end": 100
  },
  "instructions": "Rewrite in a formal tone while maintaining the same structure",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fullText` | string | Yes | Complete document text |
| `selection` | object/null | No | Selection range (null = full document) |
| `instructions` | string | Yes | Rewrite instructions |
| `provider` | string | No | AI provider |
| `model` | string | No | Model to use |
| `seed` | string/number | No | Seed for reproducibility |

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "jobId": "crw_1704067200_def456",
  "selection": {
    "start": 0,
    "end": 100
  },
  "rewritten": "The constrained rewritten text...",
  "beforeHash": "sha256:original...",
  "afterHash": "sha256:new...",
  "newFullText": "Full document with rewritten portion...",
  "proofId": 125,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "seed": null,
  "meta": {
    "proofId": 125,
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929",
    "seed": null
  }
}
```

**Errors:**
- `422` - Validation failed (structure couldn't be preserved)

---

#### Translate

Translate text using AI with full proof recording.

```http
POST /docs/:id/ai/translate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "Hello, how are you today?",
  "targetLanguage": "es",
  "sourceLanguage": "en",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to translate |
| `targetLanguage` | string | Yes | Target language code (en, es, fr, de, ja, zh, etc.) |
| `sourceLanguage` | string | No | Source language code (auto-detect if omitted) |
| `provider` | string | No | AI provider (openai/anthropic/ollama/dev) |
| `model` | string | No | Specific model to use |
| `seed` | string/number | No | Seed for reproducibility |

**Supported Languages:**

| Code | Language |
|------|----------|
| `auto` | Auto-detect (source only) |
| `en` | English |
| `es` | Spanish |
| `fr` | French |
| `de` | German |
| `it` | Italian |
| `pt` | Portuguese |
| `ja` | Japanese |
| `zh` | Chinese |
| `ko` | Korean |
| `ar` | Arabic |
| `hi` | Hindi |
| `ru` | Russian |

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "translatedText": "Hola, ¿cómo estás hoy?",
  "sourceLanguage": "en",
  "targetLanguage": "es",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "proof": {
    "id": "proof_abc123",
    "path": "proofs/doc_xyz789/ai_translate_20250129T120000Z.json",
    "timestamp": "2025-01-29T12:00:00.000Z"
  },
  "proofHash": "sha256:a1b2c3d4e5f6..."
}
```

**Errors:**
- `400` - Missing text or targetLanguage

---

#### Detect Fields (AI-Powered)

Detect editable fields in text using AI. Identifies dates, names, monetary amounts, and other important values that users might want to edit.

```http
POST /docs/:id/ai/detectFields
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "The contract dated January 15, 2025 between John Smith and Acme Corp for $50,000...",
  "fieldTypes": ["date", "name", "amount"],
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to analyze for fields |
| `fieldTypes` | string[] | No | Field types to detect (default: all) |
| `provider` | string | No | AI provider (openai/anthropic/ollama/dev) |
| `model` | string | No | Specific model to use |

**Supported Field Types:**

| Type | Description | Example |
|------|-------------|---------|
| `date` | Dates, deadlines, time references | "January 15, 2025", "next Monday" |
| `name` | Person/organization names, titles | "John Smith", "Acme Corp" |
| `amount` | Monetary values, quantities, percentages | "$50,000", "25%", "100 units" |
| `custom` | Other important editable values | Reference numbers, IDs, addresses |

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "fields": [
    {
      "type": "date",
      "value": "January 15, 2025",
      "start": 21,
      "end": 37,
      "confidence": 0.95
    },
    {
      "type": "name",
      "value": "John Smith",
      "start": 46,
      "end": 56,
      "confidence": 0.92
    },
    {
      "type": "name",
      "value": "Acme Corp",
      "start": 61,
      "end": 70,
      "confidence": 0.90
    },
    {
      "type": "amount",
      "value": "$50,000",
      "start": 75,
      "end": 82,
      "confidence": 0.98
    }
  ],
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "proof": {
    "id": "prf_abc123",
    "path": "proofs/doc_xyz789/detectFields_1704067200.json",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

| Response Field | Description |
|----------------|-------------|
| `fields` | Array of detected fields |
| `fields[].type` | Field category (date/name/amount/custom) |
| `fields[].value` | The detected text value |
| `fields[].start` | Start character position (0-indexed) |
| `fields[].end` | End character position |
| `fields[].confidence` | Detection confidence (0-1) |

**WebSocket Events:**
- `ai_job:started` - Detection started
- `ai_job:finished` - Detection complete with field count
- `proof_added` - Proof packet recorded

---

#### Generic AI Action

Execute predefined AI actions (summarize, extract tasks, etc.).

```http
POST /docs/:id/ai/:action
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Supported Actions:**
- `summarize` - Generate a summary
- `extract_tasks` - Extract action items
- `rewrite_for_clarity` - Improve clarity

**Request Body:**
```json
{
  "selectionText": "The text to process..."
}
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "action": "summarize",
  "proposalText": "Summary: This text discusses...",
  "proposalKind": "replace-selection",
  "proofPath": "proofs/doc_xyz789/summarize_1704067200.json",
  "outputsHash": "sha256:hash...",
  "elapsedMs": 1234,
  "notes": ["Additional info"],
  "provenanceId": 126,
  "actor": "usr_abc123"
}
```

| Response Field | Description |
|----------------|-------------|
| `proposalKind` | `"replace-selection"` or `"insert-below-selection"` |
| `elapsedMs` | Processing time in milliseconds |

---

### Document Intelligence / Extraction Endpoints

Document Intelligence extracts structured data from documents using AI.

#### Trigger Extraction

Extract structured data from document text.

```http
POST /docs/:id/extract
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "Full document text for extraction...",
  "forceDocType": "contract",
  "reextract": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Document text to extract from |
| `forceDocType` | string | No | Override auto-detected type (contract/invoice/proposal/meeting_notes/report/other) |
| `reextract` | boolean | No | Force re-extraction even if exists |

**Response:** `200 OK`
```json
{
  "extractionId": "ext_abc123",
  "docId": "doc_xyz789",
  "documentType": "contract",
  "confidence": 0.92,
  "extraction": {
    "title": "Services Agreement",
    "parties": [
      { "name": "Acme Corp", "role": "party_a" },
      { "name": "Beyle Inc", "role": "party_b" }
    ],
    "effectiveDate": "2026-01-01",
    "paymentTerms": {
      "amount": 150000,
      "currency": "USD",
      "frequency": "annual",
      "netDays": 30
    }
  },
  "fieldConfidences": {
    "title": 0.98,
    "parties": 0.95,
    "effectiveDate": 0.88,
    "paymentTerms": 0.85
  },
  "anomalies": [
    {
      "code": "MISSING_TERMINATION_CLAUSE",
      "severity": "warning",
      "message": "No termination clause found in this contract",
      "suggestion": "Consider adding a termination clause"
    }
  ],
  "proofId": 123,
  "proofHash": "sha256:abc123...",
  "extractedAt": "2026-02-05T10:30:00Z"
}
```

**Errors:**
- `400` - Missing or empty text
- `404` - Document not found
- `409` - Extraction already exists (use `reextract: true` to override)
- `500` - Extraction failed (`extraction_failed` error code)
- `504` - Extraction timed out (`extraction_timeout` error code). The document may be too large or the AI service is slow.

---

#### Get Extraction

Get existing extraction for a document.

```http
GET /docs/:id/extraction
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "extractionId": "ext_abc123",
  "docId": "doc_xyz789",
  "documentType": "contract",
  "confidence": 0.92,
  "extraction": { ... },
  "fieldConfidences": { ... },
  "anomalies": [ ... ],
  "proofId": 123,
  "extractedAt": "2026-02-05T10:30:00Z",
  "updatedAt": "2026-02-05T10:30:00Z",
  "corrections": [
    {
      "id": "cor_xyz",
      "fieldPath": "effectiveDate",
      "oldValue": "2026-01-01",
      "newValue": "2026-02-01",
      "correctedBy": "usr_abc",
      "correctedAt": "2026-02-05T11:00:00Z"
    }
  ]
}
```

**Errors:**
- `404` - Document or extraction not found

---

#### Update Extraction (Manual Corrections)

Apply manual corrections to extracted fields.

```http
PATCH /docs/:id/extraction
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "documentType": "contract",
  "corrections": {
    "effectiveDate": "2026-02-01",
    "paymentTerms.netDays": 45
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `documentType` | string | No | Override document type |
| `corrections` | object | No | Field path to new value mapping |

**Response:** `200 OK`
```json
{
  "extractionId": "ext_abc123",
  "docId": "doc_xyz789",
  "documentType": "contract",
  "extraction": { ... },
  "correctedFields": ["effectiveDate", "paymentTerms.netDays"],
  "correctedAt": "2026-02-05T11:00:00Z",
  "correctedBy": "usr_abc"
}
```

**Errors:**
- `404` - Document or extraction not found

---

#### Export Extraction

Export extraction data as JSON or CSV.

```http
GET /docs/:id/extraction/export?format=json
Authorization: Bearer <accessToken>
```

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `format` | string | `json` | Export format: `json` or `csv` |

**Response:** File download with appropriate Content-Type header.

- JSON: `application/json`
- CSV: `text/csv`

**Errors:**
- `404` - Document or extraction not found

---

#### Create Extraction Action

Create an action (reminder or flag for review) based on extracted data.

```http
POST /docs/:id/extraction/actions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "reminder",
  "field": "expirationDate",
  "config": {
    "reminderDate": "2026-12-15T09:00:00Z",
    "message": "Contract expires in 2 weeks"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Action type: `reminder` or `flag_review` |
| `field` | string | No | Extraction field this action relates to |
| `config.reminderDate` | string | Yes* | ISO date for reminder (*required for `reminder` type) |
| `config.message` | string | No | Custom message for the action |

**Response:** `201 Created`
```json
{
  "actionId": "act_xyz123",
  "type": "reminder",
  "status": "scheduled",
  "scheduledFor": "2026-12-15T09:00:00Z",
  "field": "expirationDate",
  "config": {
    "reminderDate": "2026-12-15T09:00:00Z",
    "message": "Contract expires in 2 weeks"
  },
  "createdAt": "2026-02-05T10:30:00Z"
}
```

For `flag_review` type, a comment is created on the document:
```json
{
  "actionId": "act_xyz456",
  "type": "flag_review",
  "status": "completed",
  "field": "liabilityLimit",
  "config": {
    "message": "Liability limit needs legal review"
  },
  "commentId": 42,
  "createdAt": "2026-02-05T10:30:00Z"
}
```

**Errors:**
- `400` - Invalid type or missing required fields
- `404` - Document or extraction not found

---

#### List Extraction Actions

Get all actions for an extraction.

```http
GET /docs/:id/extraction/actions
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "extractionId": "ext_abc123",
  "docId": "doc_xyz789",
  "actions": [
    {
      "actionId": "act_xyz123",
      "type": "reminder",
      "status": "scheduled",
      "field": "expirationDate",
      "config": { ... },
      "scheduledFor": "2026-12-15T09:00:00Z",
      "completedAt": null,
      "createdBy": "usr_abc",
      "createdAt": "2026-02-05T10:30:00Z"
    },
    {
      "actionId": "act_xyz456",
      "type": "flag_review",
      "status": "completed",
      "field": "liabilityLimit",
      "config": { ... },
      "scheduledFor": null,
      "completedAt": "2026-02-05T10:30:00Z",
      "createdBy": "usr_abc",
      "createdAt": "2026-02-05T10:30:00Z"
    }
  ],
  "total": 2
}
```

**Errors:**
- `404` - Document or extraction not found

---

#### Delete Extraction Action

Cancel a pending/scheduled action or delete a completed action.

```http
DELETE /docs/:id/extraction/actions/:actionId
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`

For pending/scheduled actions (cancels the action):
```json
{
  "actionId": "act_xyz123",
  "status": "cancelled",
  "message": "Action cancelled"
}
```

For completed/cancelled actions (deletes the record):
```json
{
  "actionId": "act_xyz123",
  "status": "deleted",
  "message": "Action deleted"
}
```

**Errors:**
- `404` - Document, extraction, or action not found
- `500` - Failed to cancel/delete action

---

### Workspace Extraction Standards Endpoints (Slice 7)

Workspace-level custom anomaly detection rules. Only workspace admins can create, update, or delete standards.

---

#### List Extraction Standards

Get all extraction standards for a workspace.

```http
GET /workspaces/:workspaceId/extraction-standards
Authorization: Bearer <accessToken>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentType` | string | No | Filter by document type |
| `enabled` | string | No | Filter by enabled status ("true" or "false") |

**Response:** `200 OK`
```json
{
  "workspaceId": "ws_abc123",
  "standards": [
    {
      "id": "std_xyz789",
      "workspaceId": "ws_abc123",
      "documentType": "contract",
      "ruleType": "required_field",
      "config": {
        "fieldPath": "terminationClause"
      },
      "severity": "warning",
      "enabled": true,
      "createdBy": "user_123",
      "createdAt": "2026-02-05T10:00:00Z"
    }
  ],
  "total": 1
}
```

---

#### Create Extraction Standard

Create a new custom anomaly detection rule. **Admin only.**

```http
POST /workspaces/:workspaceId/extraction-standards
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "documentType": "contract",
  "ruleType": "required_field",
  "config": {
    "fieldPath": "liabilityLimit"
  },
  "severity": "error",
  "enabled": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `documentType` | string | Yes | Document type this rule applies to |
| `ruleType` | string | Yes | Rule type: `required_field`, `value_range`, `comparison`, `custom` |
| `config` | object | Yes | Rule configuration (varies by ruleType) |
| `severity` | string | No | Anomaly severity: `info`, `warning`, `error`. Default: `warning` |
| `enabled` | boolean | No | Whether rule is active. Default: `true` |

**Rule Config by Type:**
- `required_field`: `{ "fieldPath": "path.to.field" }`
- `value_range`: `{ "fieldPath": "path.to.field", "min": 0, "max": 90 }`
- `comparison`: `{ "field1": "startDate", "operator": "lt", "field2": "endDate" }`
- `custom`: `{ "expression": "..." }` (for future use)

**Response:** `201 Created`
```json
{
  "standard": {
    "id": "std_xyz789",
    "workspaceId": "ws_abc123",
    "documentType": "contract",
    "ruleType": "required_field",
    "config": { "fieldPath": "liabilityLimit" },
    "severity": "error",
    "enabled": true,
    "createdBy": "user_123",
    "createdAt": "2026-02-05T10:00:00Z"
  },
  "message": "Extraction standard created successfully"
}
```

**Errors:**
- `400` - Invalid document type, rule type, severity, or config
- `403` - Only workspace admins can create standards

---

#### Update Extraction Standard

Update an existing extraction standard. **Admin only.**

```http
PATCH /workspaces/:workspaceId/extraction-standards/:standardId
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:** (all fields optional)
```json
{
  "severity": "warning",
  "enabled": false
}
```

**Response:** `200 OK`
```json
{
  "standard": {
    "id": "std_xyz789",
    "workspaceId": "ws_abc123",
    "documentType": "contract",
    "ruleType": "required_field",
    "config": { "fieldPath": "liabilityLimit" },
    "severity": "warning",
    "enabled": false,
    "createdBy": "user_123",
    "createdAt": "2026-02-05T10:00:00Z"
  },
  "message": "Extraction standard updated successfully"
}
```

**Errors:**
- `400` - Invalid field values
- `403` - Only workspace admins can update standards
- `404` - Standard not found

---

#### Delete Extraction Standard

Delete an extraction standard. **Admin only.**

```http
DELETE /workspaces/:workspaceId/extraction-standards/:standardId
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "standardId": "std_xyz789",
  "message": "Extraction standard deleted successfully"
}
```

**Errors:**
- `403` - Only workspace admins can delete standards
- `404` - Standard not found

---

### Compliance Checker Endpoints (Slice A5)

Real-time policy enforcement that checks document content against workspace-defined compliance policies. Supports 6 rule types: `text_match`, `regex_pattern`, `required_section`, `forbidden_term`, `numeric_constraint`, `ai_check`.

---

#### Trigger Compliance Check

Run all enabled workspace policies against a document. Creates a proof record and broadcasts results via WebSocket.

```http
POST /docs/:id/compliance/check
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "html": "<p>Document HTML content from Tiptap editor...</p>",
  "metadata": {},
  "triggeredBy": "manual"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `html` | string | Yes | Document HTML content (Tiptap output) |
| `metadata` | object | No | Optional metadata for `numeric_constraint` field paths |
| `triggeredBy` | string | No | Trigger source: `manual` (default), `auto_save`, or `pre_export`. When `auto_save`, debounce and auto-check policy filtering are applied. |

**Auto-Save Debounce Behavior (Slice A7):**

When `triggeredBy` is `"auto_save"`:
- If no policies have `autoCheck: true`, returns `200` with `{ "skipped": true, "reason": "no_auto_check_policies" }`
- If last check was less than 30 seconds ago, returns `200` with `{ "skipped": true, "reason": "debounced" }`
- Only evaluates policies that have `autoCheck: true` (not all enabled policies)

```json
{
  "skipped": true,
  "reason": "debounced",
  "docId": "doc-001",
  "message": "Compliance check debounced (last check was less than 30s ago)"
}
```

**Response:** `200 OK`
```json
{
  "checkId": "abc123xyz789",
  "docId": "doc-001",
  "status": "failed",
  "totalPolicies": 5,
  "passed": 3,
  "warnings": 1,
  "violations": 1,
  "results": [
    {
      "policyId": "pol_001",
      "policyName": "No Unlimited Liability",
      "ruleType": "forbidden_term",
      "severity": "error",
      "status": "failed",
      "message": "Forbidden terms found: unlimited liability",
      "suggestion": "Remove or replace the forbidden terms"
    },
    {
      "policyId": "pol_002",
      "policyName": "Require Termination Clause",
      "ruleType": "required_section",
      "severity": "warning",
      "status": "passed",
      "message": "Required section 'Termination' found with 45 words"
    }
  ],
  "proofId": "42",
  "proofHash": "sha256:abc123...",
  "checkedAt": "2026-02-07T10:30:00.000Z"
}
```

**When no policies are enabled:**
```json
{
  "checkId": null,
  "docId": "doc-001",
  "status": "passed",
  "totalPolicies": 0,
  "passed": 0,
  "warnings": 0,
  "violations": 0,
  "results": [],
  "message": "No enabled compliance policies for this workspace"
}
```

**Errors:**
- `400` - `html_required`: HTML content missing or empty
- `400` - `workspace_required`: `X-Workspace-Id` header missing
- `403` - Requires editor role or higher
- `404` - Document not found
- `500` - `compliance_check_failed`: Engine error (includes `checkId` for debugging)

**Rate Limit:** 10 requests per hour per user (reuses `AI_RATE_LIMITS.compose`)

---

#### Get Latest Compliance Check

Return the most recent compliance check result for a document.

```http
GET /docs/:id/compliance
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "checkId": "abc123xyz789",
  "docId": "doc-001",
  "status": "passed",
  "totalPolicies": 5,
  "passed": 5,
  "warnings": 0,
  "violations": 0,
  "results": [],
  "proofId": "42",
  "triggeredBy": "manual",
  "checkedBy": "user_123",
  "createdAt": "2026-02-07T10:30:00.000Z",
  "completedAt": "2026-02-07T10:30:02.000Z"
}
```

**Errors:**
- `403` - Requires viewer role or higher
- `404` - Document or compliance check not found

---

#### Get Compliance Check History

Return paginated history of compliance checks for a document.

```http
GET /docs/:id/compliance/history?limit=20&offset=0
Authorization: Bearer <accessToken>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 20 | Results per page (1-100) |
| `offset` | number | No | 0 | Number of results to skip |

**Response:** `200 OK`
```json
{
  "docId": "doc-001",
  "checks": [
    {
      "checkId": "abc123xyz789",
      "status": "passed",
      "totalPolicies": 5,
      "passed": 5,
      "warnings": 0,
      "violations": 0,
      "triggeredBy": "manual",
      "checkedBy": "user_123",
      "createdAt": "2026-02-07T10:30:00.000Z",
      "completedAt": "2026-02-07T10:30:02.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

**Errors:**
- `403` - Requires viewer role or higher
- `404` - Document not found

---

### Compliance Policy Management Endpoints (Slice A6)

Workspace-scoped CRUD for compliance policies. Admins can create, update, and delete policies; all workspace members can list policies and browse built-in templates.

---

#### List Compliance Policies

List all compliance policies for a workspace, with optional category and enabled filters.

```http
GET /workspaces/:wid/compliance-policies?category=legal&enabled=true
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `category` | string | No | — | Filter by category: `general`, `legal`, `financial`, `privacy`, `custom` |
| `enabled` | string | No | — | Filter by enabled state: `"true"` or `"false"` |

**Response:** `200 OK`
```json
{
  "workspaceId": "ws_001",
  "policies": [
    {
      "id": "abc123xyz789",
      "workspaceId": "ws_001",
      "name": "No Unlimited Liability",
      "description": "Flags unlimited liability language",
      "category": "legal",
      "ruleType": "forbidden_term",
      "ruleConfig": {
        "terms": ["unlimited liability", "no liability cap"],
        "caseSensitive": false
      },
      "severity": "error",
      "documentTypes": ["all"],
      "enabled": true,
      "autoCheck": true,
      "createdBy": "user_123",
      "createdAt": "2026-02-07T10:00:00.000Z",
      "updatedAt": "2026-02-07T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

**Errors:**
- `400` - `invalid_category`: Invalid category value

---

#### Create Compliance Policy

Create a new compliance policy for a workspace. Admin only.

```http
POST /workspaces/:wid/compliance-policies
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "No Unlimited Liability",
  "description": "Flags unlimited liability language",
  "category": "legal",
  "ruleType": "forbidden_term",
  "ruleConfig": {
    "terms": ["unlimited liability", "no liability cap"],
    "caseSensitive": false
  },
  "severity": "error",
  "documentTypes": ["all"],
  "enabled": true,
  "autoCheck": true
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Human-readable policy name |
| `description` | string | No | null | What this policy enforces |
| `category` | string | No | `"general"` | `general`, `legal`, `financial`, `privacy`, `custom` |
| `ruleType` | string | Yes | — | `text_match`, `regex_pattern`, `required_section`, `forbidden_term`, `numeric_constraint`, `ai_check` |
| `ruleConfig` | object | Yes | — | Rule-specific configuration (validated per ruleType) |
| `severity` | string | No | `"warning"` | `info`, `warning`, `error` |
| `documentTypes` | string[] | No | `["all"]` | Which document types this applies to |
| `enabled` | boolean | No | `true` | Whether the policy is active |
| `autoCheck` | boolean | No | `true` | Whether to check on document save |

**Rule Config Schemas:**

| Rule Type | Required Config Fields |
|-----------|----------------------|
| `text_match` | `pattern` (string), optional `matchType` (`contains`\|`exact`\|`startsWith`), optional `caseSensitive` (boolean) |
| `regex_pattern` | `pattern` (string, valid regex), optional `flags` (string), optional `mustMatch` (boolean) |
| `required_section` | `heading` (string), optional `minWords` (number >= 0) |
| `forbidden_term` | `terms` (string[], non-empty), optional `caseSensitive` (boolean) |
| `numeric_constraint` | `fieldPath` (string), `operator` (`lt`\|`lte`\|`gt`\|`gte`\|`eq`), `value` (number) |
| `ai_check` | `instruction` (string), `failIf` (`"yes"`\|`"no"`) |

**Response:** `201 Created`
```json
{
  "policy": { "id": "abc123xyz789", "...": "..." },
  "message": "Compliance policy created successfully"
}
```

**Errors:**
- `400` - `missing_required_fields`: name, ruleType, or ruleConfig missing
- `400` - `invalid_rule_type`: Invalid ruleType value
- `400` - `invalid_category`: Invalid category value
- `400` - `invalid_severity`: Invalid severity value
- `400` - `invalid_config`: ruleConfig fails validation for the given ruleType
- `403` - `admin_required`: Requires workspace admin role
- `500` - `create_failed`: Database error

---

#### Update Compliance Policy

Update an existing compliance policy. Admin only. Partial updates supported.

```http
PATCH /workspaces/:wid/compliance-policies/:pid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Policy Name",
  "enabled": false,
  "severity": "error"
}
```

**Response:** `200 OK`
```json
{
  "policy": { "id": "abc123xyz789", "...": "..." },
  "message": "Compliance policy updated successfully"
}
```

**Errors:**
- `400` - `invalid_name`: Empty name provided
- `400` - `invalid_rule_type` / `invalid_category` / `invalid_severity`: Invalid enum values
- `400` - `invalid_config`: ruleConfig fails validation
- `403` - `admin_required`: Requires workspace admin role
- `404` - `policy_not_found`: Policy not found or not in this workspace
- `500` - `update_failed`: Database error

---

#### Delete Compliance Policy

Delete a compliance policy. Admin only.

```http
DELETE /workspaces/:wid/compliance-policies/:pid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "policyId": "abc123xyz789",
  "message": "Compliance policy deleted successfully"
}
```

**Errors:**
- `403` - `admin_required`: Requires workspace admin role
- `404` - `policy_not_found`: Policy not found or not in this workspace
- `500` - `delete_failed`: Database error

---

#### List Built-in Policy Templates

Return the 13 built-in policy templates, optionally filtered by category. Templates are read-only suggestions that users can clone into workspace policies.

```http
GET /workspaces/:wid/compliance-policies/templates?category=legal
Authorization: Bearer <accessToken>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `category` | string | No | — | Filter by category: `general`, `legal`, `financial`, `privacy`, `custom` |

**Response:** `200 OK`
```json
{
  "templates": [
    {
      "id": "legal-no-unlimited-liability",
      "name": "No Unlimited Liability",
      "description": "Flags documents that contain phrases implying unlimited liability exposure",
      "category": "legal",
      "ruleType": "forbidden_term",
      "defaultConfig": {
        "terms": ["unlimited liability", "no liability cap", "uncapped liability"],
        "caseSensitive": false
      },
      "severity": "error",
      "documentTypes": ["all"]
    }
  ],
  "total": 3
}
```

**Errors:**
- `400` - `invalid_category`: Invalid category value

---

### Clause Library Endpoints (Slice B2)

Workspace-scoped CRUD for reusable content clauses. Editors can create, update, and archive clauses; all workspace members can list and view clauses.

---

#### List Clauses

List all clauses for a workspace with optional search, category, and tag filters plus pagination.

```http
GET /workspaces/:wid/clauses?search=liability&category=legal&tag=contract&limit=50&offset=0
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `search` | string | No | — | Search title and content text (LIKE match) |
| `category` | string | No | — | Filter by category: `general`, `legal`, `financial`, `boilerplate`, `custom` |
| `tag` | string | No | — | Filter by tag (case-insensitive match) |
| `limit` | string | No | `50` | Max results per page (1–200) |
| `offset` | string | No | `0` | Number of results to skip |

**Response:** `200 OK`
```json
{
  "workspaceId": "ws_001",
  "clauses": [
    {
      "id": "abc123xyz789",
      "workspaceId": "ws_001",
      "title": "Standard Liability Cap",
      "description": "Limits liability to contract value",
      "contentHtml": "<p>The total liability shall not exceed...</p>",
      "contentText": "The total liability shall not exceed...",
      "category": "legal",
      "tags": ["contract", "liability"],
      "language": "en",
      "version": 2,
      "usageCount": 15,
      "isArchived": false,
      "createdBy": "user_123",
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T12:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Errors:**
- `400` - `invalid_category`: Invalid category value

---

#### Create Clause

Create a new clause with an initial version record. Editor+ required.

```http
POST /workspaces/:wid/clauses
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Standard Liability Cap",
  "description": "Limits liability to contract value",
  "contentHtml": "<p>The total liability shall not exceed...</p>",
  "contentText": "The total liability shall not exceed...",
  "category": "legal",
  "tags": ["contract", "liability"],
  "language": "en"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | Yes | — | Clause title |
| `description` | string | No | null | What this clause contains |
| `contentHtml` | string | Yes | — | Tiptap HTML content for insertion |
| `contentText` | string | Yes | — | Plain text for search and AI comparison |
| `category` | string | No | `"general"` | `general`, `legal`, `financial`, `boilerplate`, `custom` |
| `tags` | string[] | No | `[]` | Tags for filtering |
| `language` | string | No | `"en"` | Content language |

**Response:** `201 Created`
```json
{
  "clause": { "id": "abc123xyz789", "version": 1, "...": "..." },
  "message": "Clause created successfully"
}
```

**Notes:**
- An initial version record (version 1) is automatically created alongside the clause.

**Errors:**
- `400` - `missing_required_fields`: title, contentHtml, or contentText missing
- `400` - `invalid_category`: Invalid category value
- `400` - `invalid_tags`: tags is not an array of strings
- `403` - `editor_required`: Requires editor role or higher
- `500` - `create_failed`: Database error

---

#### Get Clause

Get a single clause by ID with full content.

```http
GET /workspaces/:wid/clauses/:cid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "clause": {
    "id": "abc123xyz789",
    "workspaceId": "ws_001",
    "title": "Standard Liability Cap",
    "...": "..."
  }
}
```

**Errors:**
- `404` - `clause_not_found`: Clause not found or not in this workspace

---

#### Update Clause

Update an existing clause. If `contentHtml` or `contentText` changes, a new version is created and the version number is bumped. Editor+ required.

```http
PATCH /workspaces/:wid/clauses/:cid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:** (all fields optional)
```json
{
  "title": "Updated Liability Cap",
  "contentHtml": "<p>Updated content...</p>",
  "contentText": "Updated content...",
  "changeNote": "Increased liability cap from $1M to $2M"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Updated title |
| `description` | string\|null | No | Updated description |
| `contentHtml` | string | No | Updated HTML content (triggers version bump) |
| `contentText` | string | No | Updated plain text (triggers version bump) |
| `category` | string | No | Updated category |
| `tags` | string[] | No | Updated tags |
| `language` | string | No | Updated language |
| `changeNote` | string | No | Annotation for the version record (only used when content changes) |

**Response:** `200 OK`
```json
{
  "clause": { "id": "abc123xyz789", "version": 3, "...": "..." },
  "versionCreated": true,
  "newVersion": 3,
  "message": "Clause updated successfully (version 3)"
}
```

**Errors:**
- `400` - `invalid_title`: Empty title
- `400` - `invalid_category`: Invalid category value
- `400` - `invalid_tags`: tags is not an array of strings
- `403` - `editor_required`: Requires editor role or higher
- `404` - `clause_not_found`: Clause not found or not in this workspace
- `500` - `update_failed`: Database error

---

#### Archive Clause

Archive (soft delete) a clause. The clause is not permanently deleted; it is marked as archived and excluded from default listings. Editor+ required.

```http
DELETE /workspaces/:wid/clauses/:cid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "clause": { "id": "abc123xyz789", "isArchived": true, "...": "..." },
  "message": "Clause archived successfully"
}
```

**Errors:**
- `403` - `editor_required`: Requires editor role or higher
- `404` - `clause_not_found`: Clause not found or not in this workspace
- `500` - `archive_failed`: Database error

---

### Clause Versioning Endpoints (Slice B3)

Read-only access to clause version history. Versions are created automatically when clause content is updated via PATCH. All workspace members can list and view versions.

---

#### List Clause Versions

List all versions for a clause, ordered by version number descending (newest first).

```http
GET /workspaces/:wid/clauses/:cid/versions
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "clauseId": "abc123xyz789",
  "versions": [
    {
      "id": "ver_002abc",
      "clauseId": "abc123xyz789",
      "version": 2,
      "contentHtml": "<p>Updated liability cap content...</p>",
      "contentText": "Updated liability cap content...",
      "changeNote": "Increased liability cap from $1M to $2M",
      "createdBy": "user_123",
      "createdAt": "2026-02-08T14:00:00.000Z"
    },
    {
      "id": "ver_001abc",
      "clauseId": "abc123xyz789",
      "version": 1,
      "contentHtml": "<p>The total liability shall not exceed...</p>",
      "contentText": "The total liability shall not exceed...",
      "changeNote": "Initial version",
      "createdBy": "user_123",
      "createdAt": "2026-02-08T10:00:00.000Z"
    }
  ],
  "total": 2
}
```

**Errors:**
- `404` - `clause_not_found`: Clause not found or not in this workspace

---

#### Get Clause Version

Get a specific version by version number, including full content.

```http
GET /workspaces/:wid/clauses/:cid/versions/:vid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `wid` | string | Workspace ID |
| `cid` | string | Clause ID |
| `vid` | string | Version number (positive integer) |

**Response:** `200 OK`
```json
{
  "version": {
    "id": "ver_001abc",
    "clauseId": "abc123xyz789",
    "version": 1,
    "contentHtml": "<p>The total liability shall not exceed...</p>",
    "contentText": "The total liability shall not exceed...",
    "changeNote": "Initial version",
    "createdBy": "user_123",
    "createdAt": "2026-02-08T10:00:00.000Z"
  }
}
```

**Errors:**
- `400` - `invalid_version`: Version must be a positive integer
- `404` - `clause_not_found`: Clause not found or not in this workspace
- `404` - `version_not_found`: Version number not found for this clause

---

### Clause Insertion & Usage Tracking Endpoints (Slice B4)

Insert clauses into documents with full provenance tracking. Logs usage in `clause_usage_log`, increments the clause's `usage_count`, creates a proof packet (`clause:insert`), and records provenance. Editor+ permission required.

---

#### Insert Clause into Document

Insert a clause from the workspace library into a document. Creates a provenance record and proof packet for audit trail.

```http
POST /docs/:id/clauses/insert
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "clauseId": "abc123xyz789",
  "insertionMethod": "manual"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clauseId` | string | Yes | ID of the clause to insert |
| `insertionMethod` | string | No | How the clause was inserted. One of: `manual` (default), `ai_suggest`, `template` |

**Response:** `200 OK`
```json
{
  "clauseId": "abc123xyz789",
  "clauseTitle": "Liability Cap",
  "version": 2,
  "contentHtml": "<p>The total liability shall not exceed...</p>",
  "contentText": "The total liability shall not exceed...",
  "docId": "doc_xyz789",
  "proofId": "123",
  "proofHash": "sha256:abc123...",
  "usageCount": 5,
  "insertionMethod": "manual",
  "message": "Clause inserted successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clauseId` | string | ID of the inserted clause |
| `clauseTitle` | string | Title of the clause |
| `version` | number | Current version of the clause |
| `contentHtml` | string | HTML content for insertion into editor |
| `contentText` | string | Plain text content |
| `docId` | string | Document the clause was inserted into |
| `proofId` | string | ID of the proof record |
| `proofHash` | string | SHA-256 hash of the proof packet |
| `usageCount` | number | Updated total usage count for this clause |
| `insertionMethod` | string | The insertion method used |
| `message` | string | Success message |

**Errors:**
- `400` - `clause_id_required`: clauseId is missing or empty
- `400` - `clause_archived`: Clause is archived and cannot be inserted
- `403` - Editor+ permission required
- `404` - `doc_not_found`: Document not found
- `404` - `clause_not_found`: Clause not found or not in this workspace
- `500` - `insert_failed`: Internal error during insertion

**Side Effects:**
- Creates a `clause:insert` proof packet with clause metadata
- Records provenance entry for the document
- Logs usage in `clause_usage_log` table
- Increments the clause's `usage_count`

---

### Clause Suggestion Endpoints (Slice B6)

AI-powered clause suggestion for text selections. Uses a two-stage pipeline: fast keyword pre-filter followed by AI similarity scoring via `composeText()`. Rate limited. Editor+ permission required.

---

#### Suggest Similar Clauses

Find clauses in the workspace library that are similar to a selected text. Returns ranked suggestions with similarity scores and match reasons.

```http
POST /docs/:id/clauses/suggest
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "The total liability of either party shall not exceed the fees paid..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Selected text to find similar clauses for. Must be at least 20 characters. |

**Response:** `200 OK`
```json
{
  "suggestions": [
    {
      "clause": {
        "id": "abc123xyz789",
        "workspaceId": "ws_001",
        "title": "Liability Cap",
        "description": "Standard limitation of liability clause",
        "contentHtml": "<p>The total liability shall not exceed...</p>",
        "contentText": "The total liability shall not exceed...",
        "category": "legal",
        "tags": ["liability", "cap"],
        "language": "en",
        "version": 2,
        "usageCount": 5,
        "isArchived": false,
        "createdBy": "user:admin",
        "createdAt": 1707300000,
        "updatedAt": 1707300000
      },
      "similarity": 85,
      "keywordScore": 0.42,
      "matchReason": "Both clauses address limitation of liability with similar scope"
    }
  ],
  "totalCandidates": 23,
  "aiCompared": 5,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `suggestions` | array | Ranked list of similar clauses (highest similarity first) |
| `suggestions[].clause` | object | Full clause object |
| `suggestions[].similarity` | number | AI-rated similarity score (0-100) |
| `suggestions[].keywordScore` | number | Keyword overlap score (0-1) from pre-filter |
| `suggestions[].matchReason` | string | Brief explanation of why the clause matches |
| `totalCandidates` | number | Total active clauses in the workspace |
| `aiCompared` | number | How many clauses were sent to AI scoring (max 5) |
| `provider` | string\|null | AI provider used for scoring (null if AI unavailable) |
| `model` | string\|null | AI model used for scoring (null if AI unavailable) |

**Rate Limit:** 10 requests/hour per user (reuses `AI_RATE_LIMITS.compose`)

**Errors:**
- `400` - `text_required`: Text is missing, not a string, or less than 20 characters
- `400` - `workspace_required`: X-Workspace-Id header is missing
- `403` - Editor+ permission required
- `404` - `doc_not_found`: Document not found
- `429` - Rate limit exceeded
- `500` - `suggest_failed`: Internal error during similarity detection

**Notes:**
- Returns empty `suggestions` array (not an error) when no similar clauses are found
- AI scoring may fall back to keyword-only scores if the AI provider is unavailable
- When `aiCompared` is 0 and `provider` is null, results are keyword-only (AI was unavailable)
- Minimum similarity threshold is 20; clauses below this are filtered out
- Maximum 5 clauses are sent to AI scoring (top keyword matches)

---

### Create Clause from Selection Endpoint (Slice B7)

Create a clause from selected document text with AI-assisted title and description generation. When the user doesn't provide a title or description, AI auto-generates them from the content. Category is auto-detected via keyword heuristics when not provided. Rate limited due to AI usage. Editor+ permission required.

---

#### Create Clause from Selection

Create a new clause from selected text in a document. AI generates title and description if not provided by the user. Category is auto-detected from content keywords when not provided.

```http
POST /workspaces/:wid/clauses/from-selection
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "contentHtml": "<p>The total liability of either party under this Agreement shall not exceed the total fees paid or payable during the 12-month period immediately preceding the event giving rise to the claim.</p>",
  "contentText": "The total liability of either party under this Agreement shall not exceed the total fees paid or payable during the 12-month period immediately preceding the event giving rise to the claim.",
  "title": "Liability Cap Clause",
  "description": "Limits total liability to fees paid in the preceding 12 months",
  "category": "legal",
  "tags": ["liability", "cap", "limitation"],
  "language": "en"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contentHtml` | string | Yes | HTML content of the selected text (Tiptap format) |
| `contentText` | string | Yes | Plain text content of the selected text (for search/AI) |
| `title` | string | No | Clause title. If omitted, AI generates a title from content. |
| `description` | string | No | Clause description. If omitted, AI generates a description from content. |
| `category` | string | No | One of: `general`, `legal`, `financial`, `boilerplate`, `custom`. If omitted, auto-detected from content keywords. |
| `tags` | string[] | No | Array of tag strings for filtering |
| `language` | string | No | Language code (default: `en`) |

**Response:** `201 Created`
```json
{
  "clause": {
    "id": "abc123xyz789",
    "workspaceId": "ws_001",
    "title": "Liability Cap Clause",
    "description": "Limits total liability to fees paid in the preceding 12 months",
    "contentHtml": "<p>The total liability of either party...</p>",
    "contentText": "The total liability of either party...",
    "category": "legal",
    "tags": ["liability", "cap", "limitation"],
    "language": "en",
    "version": 1,
    "usageCount": 0,
    "isArchived": false,
    "createdBy": "user:admin",
    "createdAt": "2026-02-08T12:00:00.000Z",
    "updatedAt": "2026-02-08T12:00:00.000Z"
  },
  "aiGenerated": {
    "title": false,
    "description": false,
    "category": false
  },
  "message": "Clause created from selection successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clause` | object | The created clause object |
| `aiGenerated.title` | boolean | `true` if the title was AI-generated |
| `aiGenerated.description` | boolean | `true` if the description was AI-generated |
| `aiGenerated.category` | boolean | `true` if the category was auto-detected (not user-provided) |
| `message` | string | Success message |

**AI Generation Behavior:**
- **Title:** When not provided, AI generates a short title (max 10 words) from the content text. Falls back to first 60 characters of content if AI fails.
- **Description:** When not provided, AI generates a 1-2 sentence description. Falls back to `null` if AI fails.
- **Category:** When not provided, keyword heuristic detects category from content text:
  - `legal`: liability, indemnification, termination, governing law, jurisdiction, warranty, breach, etc.
  - `financial`: payment, pricing, invoice, fee, compensation, reimbursement, etc.
  - `boilerplate`: confidential, force majeure, severability, entire agreement, amendment, etc.
  - `general`: default when no category detected

**Side Effects:**
- Creates the clause record in the database
- Creates an initial version record (version 1, change note: "Initial version (from selection)")

**Rate Limit:** 10 requests/hour per user (reuses `AI_RATE_LIMITS.compose`)

**Errors:**
- `400` - `missing_required_fields`: contentHtml or contentText is missing or empty
- `400` - `invalid_category`: Invalid category value provided
- `400` - `invalid_tags`: Tags is not an array or contains non-strings
- `400` - `invalid_title`: Title provided but is empty
- `403` - `editor_required`: User doesn't have editor+ role
- `429` - Rate limit exceeded
- `500` - `create_failed`: Internal error during clause creation

---

### Cross-Document Intelligence (Knowledge Graph) Endpoints (Slice 8)

Workspace-scoped endpoints for browsing, managing, and querying the knowledge graph of entities extracted from documents. Entities are automatically harvested from Document Intelligence extraction data. Admin role required for write operations (update, delete, merge).

---

#### List Entities

List all entities for a workspace with optional type filter, search, sorting, and pagination.

```http
GET /workspaces/:wid/knowledge/entities?type=person&search=acme&sort=doc_count&order=desc&limit=50&offset=0
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | string | No | — | Filter by entity type: `person`, `organization`, `date`, `amount`, `location`, `product`, `term`, `concept`, `web_page`, `research_source`, `design_asset`, `event`, `citation` |
| `search` | string | No | — | Search entities by name or aliases (LIKE match) |
| `sort` | string | No | `doc_count` | Sort field: `doc_count`, `name`, `created_at`, `mention_count` |
| `order` | string | No | `desc` | Sort order: `asc` or `desc` |
| `limit` | number | No | 50 | Results per page (1-200) |
| `offset` | number | No | 0 | Pagination offset |
| `productSource` | string | No | — | Filter entities by product source: `docs`, `design-studio`, `research`, `notes`, `sheets`. Returns only entities that have mentions from the specified product. |

**Response:** `200 OK`
```json
{
  "entities": [
    {
      "id": "ent_abc123",
      "entityType": "organization",
      "name": "Acme Corp",
      "aliases": ["Acme Corporation", "ACME"],
      "mentionCount": 15,
      "docCount": 7,
      "firstSeenAt": "2026-01-15T10:00:00Z",
      "lastSeenAt": "2026-02-07T14:30:00Z"
    }
  ],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

**Errors:**
- `400` - `invalid_entity_type`: Invalid entity type value
- `400` - `invalid_sort`: Invalid sort field
- `400` - `invalid_order`: Invalid order value
- `400` - `invalid_product_source`: Invalid productSource value
- `403` - `workspace_access_required`: Not a workspace member

---

#### Get Entity Detail

Get full entity details including mentions (with document context) and relationships (with related entity info).

```http
GET /workspaces/:wid/knowledge/entities/:eid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "entity": {
    "id": "ent_abc123",
    "entityType": "organization",
    "name": "Acme Corp",
    "normalizedName": "acme corp",
    "aliases": ["Acme Corporation", "ACME"],
    "metadata": { "type": "corporation", "industry": "technology" },
    "mentionCount": 15,
    "docCount": 7,
    "firstSeenAt": "2026-01-15T10:00:00Z",
    "lastSeenAt": "2026-02-07T14:30:00Z"
  },
  "mentions": [
    {
      "docId": "doc_xyz789",
      "docTitle": "Services Agreement",
      "context": "...between Acme Corp and Beyle Inc...",
      "fieldPath": "parties[0].name",
      "confidence": 0.95,
      "productSource": "docs",
      "sourceRef": null
    }
  ],
  "relationships": [
    {
      "id": "rel_123",
      "relatedEntity": { "id": "ent_def456", "name": "Beyle Inc", "entityType": "organization" },
      "relationshipType": "contractual",
      "label": "contracted with",
      "strength": 0.88,
      "evidenceCount": 3
    }
  ]
}
```

**Errors:**
- `403` - `workspace_access_required`: Not a workspace member
- `404` - `entity_not_found`: Entity not found in workspace

---

#### Update Entity

Update entity name, aliases, or metadata. Admin only.

```http
PATCH /workspaces/:wid/knowledge/entities/:eid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Acme Corporation",
  "aliases": ["Acme Corp", "ACME"],
  "metadata": { "type": "corporation", "industry": "technology" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | New canonical name |
| `aliases` | string[] | No | Updated alias list |
| `metadata` | object | No | Type-specific metadata |

**Response:** `200 OK` — Returns the updated entity object.

**Errors:**
- `400` - `invalid_name`: Empty or non-string name
- `400` - `invalid_aliases`: Aliases is not an array
- `403` - `admin_required`: Requires workspace admin role
- `404` - `entity_not_found`: Entity not found in workspace
- `500` - `update_failed`: Database error

---

#### Delete Entity

Delete an entity and all its mentions/relationships (CASCADE). Admin only.

```http
DELETE /workspaces/:wid/knowledge/entities/:eid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `204 No Content`

**Errors:**
- `403` - `admin_required`: Requires workspace admin role
- `404` - `entity_not_found`: Entity not found in workspace
- `500` - `delete_failed`: Database error

---

#### Merge Entities

Merge duplicate entities into one canonical entity. Reassigns all mentions and aliases. Admin only.

```http
POST /workspaces/:wid/knowledge/entities/merge
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "sourceEntityIds": ["ent_dup1", "ent_dup2"],
  "targetEntityId": "ent_canonical",
  "mergedName": "Acme Corporation"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sourceEntityIds` | string[] | Yes | Entity IDs to merge from (will be deleted) |
| `targetEntityId` | string | Yes | Entity ID to merge into (will be kept) |
| `mergedName` | string | Yes | Canonical name for the merged entity |

**Response:** `200 OK`
```json
{
  "mergedEntity": { "id": "ent_canonical", "name": "Acme Corporation", "..." : "..." },
  "mergedMentionCount": 3,
  "deletedEntityIds": ["ent_dup1", "ent_dup2"]
}
```

**Errors:**
- `400` - `invalid_source_ids`: sourceEntityIds missing or empty
- `400` - `invalid_target_id`: targetEntityId missing
- `400` - `invalid_merged_name`: mergedName missing or empty
- `400` - `invalid_merge`: Cannot merge entity into itself
- `403` - `admin_required`: Requires workspace admin role
- `404` - `target_entity_not_found` / `source_entity_not_found`: Entity not found
- `429` - `limit_exceeded`: Entity limit reached for this workspace (10,000 entities max). Returned if the merge operation would create a new entity and the workspace limit is reached.
- `500` - `merge_failed`: Database error

---

#### List Relationships

List entity relationships for a workspace with optional filters.

```http
GET /workspaces/:wid/knowledge/relationships?entityId=ent_abc123&type=contractual&minStrength=0.5&limit=50
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entityId` | string | No | — | Filter to relationships involving this entity |
| `type` | string | No | — | Filter by type: `co_occurrence`, `contractual`, `financial`, `organizational`, `temporal`, `custom` |
| `minStrength` | number | No | — | Minimum strength score (0.0-1.0) |
| `limit` | number | No | 50 | Results per page (1-200) |
| `offset` | number | No | 0 | Pagination offset |

**Response:** `200 OK`
```json
{
  "relationships": [
    {
      "id": "rel_123",
      "fromEntity": { "id": "ent_abc", "name": "Acme Corp", "entityType": "organization" },
      "toEntity": { "id": "ent_def", "name": "Beyle Inc", "entityType": "organization" },
      "relationshipType": "contractual",
      "label": "contracted with",
      "strength": 0.88,
      "evidenceCount": 3
    }
  ],
  "total": 24
}
```

**Errors:**
- `400` - `invalid_relationship_type`: Invalid type value
- `400` - `invalid_min_strength`: minStrength out of 0-1 range
- `403` - `workspace_access_required`: Not a workspace member

---

#### Document Entities

List all entities mentioned in a specific document.

```http
GET /docs/:id/entities
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "entities": [
    {
      "entityId": "ent_abc",
      "entityType": "organization",
      "name": "Acme Corp",
      "context": "...between Acme Corp and Beyle Inc...",
      "confidence": 0.95,
      "fieldPath": "parties[0].name"
    }
  ],
  "total": 12
}
```

**Errors:**
- `403` - Access denied (insufficient doc permissions)
- `404` - `doc_not_found`: Document not found

---

#### Related Documents

Find documents related to a specific document via shared entities. Uses entity overlap ranking with optional AI re-ranking for top candidates.

```http
GET /docs/:id/related?limit=10
Authorization: Bearer <accessToken>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 10 | Max related documents to return (1-50) |

**Response:** `200 OK`
```json
{
  "relatedDocs": [
    {
      "docId": "doc_abc",
      "title": "Invoice #1234 — Acme Corp",
      "relevance": 0.82,
      "sharedEntities": [
        { "name": "Acme Corp", "entityType": "organization" },
        { "name": "$150,000", "entityType": "amount" }
      ],
      "sharedEntityCount": 2
    }
  ],
  "entityCount": 12,
  "totalRelated": 5
}
```

**Errors:**
- `403` - Access denied (insufficient doc permissions)
- `404` - `doc_not_found`: Document not found

---

### Cross-Document Intelligence — Search, Indexing & Summary (Slice 9)

Endpoints for semantic search, keyword search, workspace re-indexing, index status, and dashboard summary. Semantic search is rate limited (uses AI calls) and creates proof records.

---

#### Semantic Search

AI-powered semantic search across workspace documents. Extracts terms from query, searches FTS5 for candidates, then uses AI to synthesize an answer with cited results. Rate limited.

```http
POST /workspaces/:wid/knowledge/search
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "query": "What are our payment terms with Acme Corp?",
  "queryType": "semantic_search",
  "limit": 10
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language search query |
| `queryType` | string | No | `semantic_search` | Query type (currently only `semantic_search`) |
| `limit` | number | No | 10 | Max results (1-20) |

**Response:** `200 OK`
```json
{
  "queryId": "kq_abc123",
  "query": "What are our payment terms with Acme Corp?",
  "answer": "Based on 3 documents, your standard payment terms with Acme Corp are Net-30, with the most recent contract specifying $150,000/year payable monthly.",
  "results": [
    {
      "docId": "doc_xyz789",
      "docTitle": "Services Agreement — Acme Corp",
      "relevance": 0.95,
      "snippets": [
        {
          "text": "Payment shall be made within thirty (30) days of invoice receipt...",
          "fieldPath": "paymentTerms"
        }
      ],
      "matchedEntities": ["Acme Corp", "$150,000"]
    }
  ],
  "resultCount": 3,
  "proofId": "proof_kq_123",
  "durationMs": 2340
}
```

**Errors:**
- `400` - `query_required`: Query text is missing or empty
- `403` - `workspace_access_required`: Not a workspace member
- `429` - Rate limit exceeded (semantic search uses AI calls)

---

#### Keyword Search (FTS5)

Fast full-text keyword search via SQLite FTS5. No AI calls. Returns matching entities and documents.

```http
GET /workspaces/:wid/knowledge/search?q=acme&limit=20
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | — | Keyword search query |
| `limit` | number | No | 20 | Max results per category (1-50) |

**Response:** `200 OK`
```json
{
  "entities": [
    { "id": "ent_abc", "name": "Acme Corp", "entityType": null, "docCount": null }
  ],
  "documents": [
    { "docId": "doc_xyz", "title": "Services Agreement — Acme Corp", "snippet": "...between <mark>Acme</mark> Corp and..." }
  ]
}
```

**Errors:**
- `400` - `query_required`: Query parameter 'q' is missing or empty
- `403` - `workspace_access_required`: Not a workspace member

---

#### Trigger Workspace Re-index

Trigger a full workspace re-index: harvest entities, normalize, detect relationships, rebuild FTS5. Admin only. Returns 202 Accepted immediately; indexing runs asynchronously.

```http
POST /workspaces/:wid/knowledge/index
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "mode": "full",
  "forceReindex": false
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `mode` | string | No | `full` | Index mode: `full` or `incremental` |
| `forceReindex` | boolean | No | false | Force re-processing of already indexed docs |

**Response:** `202 Accepted`
```json
{
  "jobId": "kidx_abc123def456",
  "status": "queued",
  "estimatedDocs": 45
}
```

**Errors:**
- `403` - `admin_required`: Requires workspace admin role

---

#### Index Status

Show current knowledge graph index status for a workspace.

```http
GET /workspaces/:wid/knowledge/status
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "entityCount": 142,
  "mentionCount": 487,
  "relationshipCount": 68,
  "indexedDocCount": 45,
  "totalDocCount": 48,
  "lastIndexedAt": "2026-02-08T10:00:00Z",
  "indexingInProgress": false
}
```

**Errors:**
- `403` - `workspace_access_required`: Not a workspace member

---

#### Knowledge Summary

Dashboard summary with stats, top entities, entity type breakdown, and recent queries.

```http
GET /workspaces/:wid/knowledge/summary
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "stats": {
    "entityCount": 142,
    "relationshipCount": 68,
    "indexedDocs": 45,
    "totalDocs": 48,
    "queryCount": 23
  },
  "topEntities": [
    { "id": "ent_abc", "name": "Acme Corp", "entityType": "organization", "docCount": 7 },
    { "id": "ent_def", "name": "John Smith", "entityType": "person", "docCount": 5 }
  ],
  "entityTypeBreakdown": {
    "organization": 28,
    "person": 45,
    "amount": 32,
    "date": 22,
    "location": 8,
    "term": 7
  },
  "recentQueries": [
    { "id": "kq_abc", "query": "Payment terms with Acme", "resultCount": 3, "createdAt": "2026-02-08T09:30:00Z" }
  ]
}
```

**Errors:**
- `403` - `workspace_access_required`: Not a workspace member

---

#### Cleanup Stale Entities

Recalculate entity counts and remove entities with zero mentions. Admin only. Useful after bulk document deletions or re-indexing. Also rebuilds entity FTS5 index if stale entities were removed.

```http
POST /workspaces/:wid/knowledge/cleanup
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "entitiesRecalculated": 142,
  "staleEntitiesDeleted": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `entitiesRecalculated` | number | Number of entities whose mention/doc counts were recalculated |
| `staleEntitiesDeleted` | number | Number of entities with zero mentions that were deleted |

**Errors:**
- `403` - `admin_required`: Requires workspace admin role

---

#### Entity & Relationship Limits (Slice 19)

Workspaces enforce hard limits to prevent unbounded growth:

| Resource | Limit | Env Override |
|----------|-------|--------------|
| Entities per workspace | 10,000 | `KACHERI_ENTITY_LIMIT` |
| Relationships per workspace | 5,000 | `KACHERI_RELATIONSHIP_LIMIT` |

When a limit is reached:
- **Automatic harvesting:** New entities are silently skipped; existing entities continue to receive mentions. Errors are logged in the harvest result.
- **API write operations** (merge, relationship creation): Return `429 Too Many Requests`:

```json
{
  "error": "limit_exceeded",
  "message": "Entity limit reached: workspace ws_abc has 10000 entities (max 10000)"
}
```

---

### Export & Import Endpoints

#### Export to PDF

Export document as PDF.

```http
POST /docs/:id/export/pdf
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "html": "<h1>Document Title</h1><p>Content...</p>"
}
```

**Response:** `200 OK`
Content-Type: `application/pdf`
Body: Binary PDF data

---

#### Export to DOCX

Export document as Microsoft Word document.

```http
POST /docs/:id/export/docx
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "html": "<h1>Document Title</h1><p>Content...</p>",
  "filenameHint": "my-document"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `html` | string | Yes | HTML content to convert |
| `filenameHint` | string | No | Safe filename suggestion |

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "ok": true,
  "file": {
    "filename": "my-document.docx",
    "bytes": 15234,
    "path": "exports/doc_xyz789/my-document.docx",
    "hash": "sha256:file_hash..."
  },
  "proof": {
    "id": 127,
    "path": "proofs/doc_xyz789/docx_1704067200.json",
    "timestamp": "2024-01-01T12:00:00Z"
  },
  "complianceWarning": {
    "status": "failed",
    "violations": 2,
    "warnings": 1,
    "lastCheckedAt": "2026-02-07T10:30:00.000Z"
  }
}
```

**Pre-Export Compliance Warning (Slice A7):**

The `complianceWarning` field is included when:
- `X-Workspace-Id` header is present, and
- There is a latest compliance check with violations/warnings, OR no check has been run yet

| `complianceWarning.status` | Meaning |
|---|---|
| `"failed"` | Latest check has violations |
| `"passed"` | Latest check passed (field omitted — no warning needed) |
| `"unchecked"` | No compliance check has been run for this document |

The DOCX export **always succeeds** regardless of compliance status. The warning is informational only.

---

#### Page Numbering in Exports (Section 2.1)

Both PDF and DOCX exports read page numbering settings from the document's layout settings (persisted via `PATCH /docs/:id/layout`). The relevant settings are in the `footer` object:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `showPageNumbers` | boolean | `false` | Enable page numbers in export |
| `pageNumberFormat` | string | `"decimal"` | Format: `"decimal"`, `"lowerRoman"`, `"upperRoman"`, `"lowerAlpha"`, `"upperAlpha"` |
| `pageNumberPosition` | string | `"footer-center"` | Placement: `"header-left"`, `"header-center"`, `"header-right"`, `"footer-left"`, `"footer-center"`, `"footer-right"` |
| `pageNumberStartAt` | number | `1` | Starting page number |
| `sectionResetPageNumbers` | boolean | `false` | Restart numbering at each section break |

**PDF Export Support:**

| Setting | Supported | Notes |
|---------|-----------|-------|
| `pageNumberPosition` | Yes | Header/footer placement with left/center/right alignment |
| `pageNumberFormat` | No | Puppeteer limitation — always renders decimal |
| `pageNumberStartAt` | No | Puppeteer limitation — always starts at 1 |
| `sectionResetPageNumbers` | No | Puppeteer limitation — no section concept |

**DOCX Export Support:**

| Setting | Supported | Notes |
|---------|-----------|-------|
| `pageNumberPosition` | Yes | Maps to Word header/footer with alignment |
| `pageNumberFormat` | Yes | Uses Word field code format switches (`\* Roman`, `\* alphabetic`, etc.) and `<w:pgNumType w:fmt="..."/>` |
| `pageNumberStartAt` | Yes | Uses `<w:pgNumType w:start="N"/>` in section properties |
| `sectionResetPageNumbers` | Yes | Creates Word section breaks (`<w:sectPr>`) with `<w:pgNumType w:start="1"/>` at each section boundary |

DOCX format support is implemented via OOXML post-processing: the DOCX buffer is unzipped, XML is patched with Word-native field codes and section properties, then rezipped. This runs automatically when non-default settings are detected.

---

#### Export to PDF — Compliance Header (Slice A7)

The `POST /docs/:id/export/pdf` endpoint includes an `X-Compliance-Status` response header:

| Header Value | Meaning |
|---|---|
| `passed` | Latest compliance check passed |
| `failed` | Latest compliance check has violations |
| `unchecked` | No compliance check has been run |
| `unknown` | No workspace context or lookup failed |

The PDF export **always succeeds** regardless of compliance status. The header is informational only.

---

#### List Exports

Get all exports for a document.

```http
GET /docs/:id/exports
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
[
  {
    "kind": "pdf",
    "ts": "2024-01-01T12:00:00Z",
    "pdfHash": "sha256:hash...",
    "size": 25600,
    "verified": true,
    "fileName": "document_1704067200.pdf",
    "proof": {
      "artifactId": "doc_xyz789",
      "action": "export:pdf",
      "actor": "usr_abc123",
      "timestamp": "2024-01-01T12:00:00Z",
      "input": {},
      "output": {},
      "runtime": { "elapsedMs": 500 }
    }
  },
  {
    "kind": "docx",
    "ts": "2024-01-01T13:00:00Z",
    "pdfHash": null,
    "size": 15234,
    "verified": true,
    "fileName": "my-document.docx",
    "proof": { ... }
  }
]
```

---

#### Download Export

Download a specific export file.

```http
GET /docs/:id/exports/pdf/:filename
GET /docs/:id/exports/docx/:filename
Authorization: Bearer <accessToken>
```

**Response:** Binary file data with appropriate Content-Type

---

#### Import Document

Import a document from file.

```http
POST /docs/import
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `kind` | string | File type hint (docx, pdf, etc.) |
| `ocr` | number | Enable OCR (1 = enabled) |

**Supported File Types:**

| Category | Extensions |
|----------|------------|
| Documents | `.docx`, `.doc`, `.odt`, `.pdf`, `.html`, `.md`, `.txt`, `.rtf` |
| Presentations | `.pptx`, `.ppt`, `.odp` |
| Spreadsheets | `.xlsx`, `.xls`, `.ods` |
| Images | `.jpg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.webp` |

**Request Body (FormData):**
```
file: [binary file data]
```

**Response:** `200 OK`
```json
{
  "docId": "doc_new123",
  "title": "Imported Document",
  "kind": "docx",
  "source": {
    "path": "uploads/original.docx",
    "sha256": "sha256:source_hash...",
    "bytes": 45678
  },
  "converted": {
    "path": "converted/doc_new123.html",
    "sha256": "sha256:converted_hash..."
  },
  "html": "<h1>Imported Content</h1><p>...</p>",
  "meta": {
    "tool": "mammoth",
    "warnings": []
  }
}
```

**Conversion Tools (fallback chain):**
1. **DOCX:** Mammoth → XML fallback → LibreOffice → OCR
2. **PDF:** pdfjs-dist (with font metadata) → pdf-parse fallback → OCR (Tesseract)
3. **Images:** Tesseract OCR
4. **Other:** LibreOffice conversion

---

#### Get Import Source (PDF)

Retrieve the original uploaded source file (typically PDF) for side-by-side viewing.

```http
GET /docs/:id/import/source
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
Content-Type: `application/pdf`
Body: Binary PDF data

**Errors:**
- `404` - No source file found for this document

---

#### Get Import Metadata

Get metadata about the most recent import for a document. Used by the frontend to determine whether to show the PDF import modal or regular diff modal.

```http
GET /docs/:id/import/meta
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "kind": "import:pdf",
  "sourceUrl": "/api/docs/doc_xyz789/import/source",
  "meta": {
    "tool": "pdfjs-dist",
    "enhanced": true,
    "headingsDetected": 5
  },
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `kind` | Import type (e.g., `import:pdf`, `import:docx`) |
| `sourceUrl` | URL to fetch the original source file |
| `meta` | Conversion metadata (tool used, warnings, etc.) |
| `ts` | Unix timestamp of the import |

**Errors:**
- `404` - No import proof found for this document

---

### Image Endpoints

Document images can be uploaded, served, and deleted. Each operation is recorded with a proof for auditability.

#### Upload Image

Upload an image to a document.

```http
POST /docs/:id/images
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
X-Workspace-Id: <workspaceId>
```

**Request Body (FormData):**
```
image: [binary image data]
```

**Supported MIME Types:**
- `image/png`
- `image/jpeg`
- `image/gif`
- `image/webp`
- `image/svg+xml`

**Response:** `201 Created`
```json
{
  "url": "/docs/doc_xyz789/images/1704067200000_abc123.png",
  "filename": "1704067200000_abc123.png",
  "hash": "sha256:image_hash...",
  "bytes": 45678,
  "mimeType": "image/png"
}
```

| Field | Description |
|-------|-------------|
| `url` | Relative URL to fetch the image |
| `filename` | Generated filename (timestamp + nanoid) |
| `hash` | SHA256 hash for integrity verification |
| `bytes` | File size in bytes |
| `mimeType` | Detected MIME type |

**Errors:**
- `400` - No file uploaded or invalid image type

---

#### Get Image

Serve an uploaded image.

```http
GET /docs/:id/images/:filename
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
Content-Type: `image/png` (or appropriate MIME type)
Cache-Control: `public, max-age=31536000, immutable`
Body: Binary image data

**Errors:**
- `400` - Invalid filename or extension
- `404` - Image not found

---

#### Delete Image

Delete an uploaded image.

```http
DELETE /docs/:id/images/:filename
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `204 No Content`

**Errors:**
- `400` - Invalid filename
- `404` - Image not found

---

#### List Images

List all images for a document.

```http
GET /docs/:id/images
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "images": [
    {
      "filename": "1704067200000_abc123.png",
      "url": "/docs/doc_xyz789/images/1704067200000_abc123.png"
    },
    {
      "filename": "1704068000000_def456.jpg",
      "url": "/docs/doc_xyz789/images/1704068000000_def456.jpg"
    }
  ]
}
```

---

### Provenance & Evidence Endpoints

#### Get Document Provenance

Get action history for a document.

```http
GET /docs/:id/provenance
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | Filter by action type |
| `limit` | number | Max results (default: 50) |
| `before` | number | Timestamp upper bound |
| `from` | number | Timestamp lower bound |
| `to` | number | Timestamp upper bound |

**Response:** `200 OK`
```json
[
  {
    "id": 123,
    "doc_id": "doc_xyz789",
    "action": "ai:compose",
    "actor": "usr_abc123",
    "ts": 1704067200,
    "details": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250929",
      "proofHash": "sha256:hash...",
      "proofId": 123
    }
  },
  {
    "id": 122,
    "doc_id": "doc_xyz789",
    "action": "create",
    "actor": "usr_abc123",
    "ts": 1704060000,
    "details": null
  }
]
```

**Action Types:**
- `create` - Document created
- `rename` - Document renamed
- `delete` - Document deleted
- `ai:compose` - AI content generation
- `ai:rewriteSelection` - AI selection rewrite
- `ai:constrainedRewrite` - AI constrained rewrite
- `ai:translate` - AI-powered text translation
- `ai:apply` - User accepted AI suggestion
- `ai:action` - Generic AI action
- `export:pdf` - PDF export
- `export:docx` - DOCX export
- `import:apply` - Applied imported content
- `tts:read_aloud` - Text-to-speech read aloud (auditory verification)
- `stt:dictate` - Speech-to-text dictation (voice input)

---

#### Append Provenance Entry

Record a new provenance entry.

```http
POST /docs/:id/provenance
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "action": "ai:apply",
  "actor": "usr_abc123",
  "preview": "Applied AI suggestion...",
  "details": {
    "proofHash": "sha256:hash...",
    "source": "compose"
  }
}
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "id": 128,
  "ts": 1704067200
}
```

---

#### Global Provenance Query

Query provenance across all documents.

```http
GET /provenance
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `artifactId` | string | Filter by document ID |
| `action` | string | Filter by action type |
| `limit` | number | Max results (default: 100) |

**Response:** `200 OK`
```json
[
  {
    "id": 128,
    "doc_id": "doc_xyz789",
    "action": "ai:compose",
    "actor": "usr_abc123",
    "ts": 1704067200,
    "details": { ... }
  }
]
```

---

### File Manager Endpoints

#### List File Tree

Get folder and document hierarchy.

```http
GET /files/tree
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `parentId` | string | Parent node ID (null for root) |

**Response:** `200 OK`
```json
{
  "parentId": null,
  "nodes": [
    {
      "id": "node_123",
      "parentId": null,
      "kind": "folder",
      "name": "Project Documents",
      "docId": null,
      "hasChildren": true
    },
    {
      "id": "node_456",
      "parentId": null,
      "kind": "doc",
      "name": "Meeting Notes",
      "docId": "doc_xyz789",
      "hasChildren": false
    }
  ]
}
```

---

#### Create Folder

Create a new folder.

```http
POST /files/folder
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "New Folder",
  "parentId": "node_123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Folder name |
| `parentId` | string/null | No | Parent folder ID |

**Response:** `201 Created`
```json
{
  "id": "node_789",
  "parentId": "node_123",
  "kind": "folder",
  "name": "New Folder",
  "docId": null,
  "hasChildren": false
}
```

---

#### Attach Document to Tree

Link a document to the file tree.

```http
POST /files/doc
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "docId": "doc_xyz789",
  "name": "My Document",
  "parentId": "node_123"
}
```

**Response:** `201 Created`
```json
{
  "id": "node_890",
  "parentId": "node_123",
  "kind": "doc",
  "name": "My Document",
  "docId": "doc_xyz789",
  "hasChildren": false
}
```

---

#### Rename Node

Rename a file or folder.

```http
PATCH /files/:id
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "New Name"
}
```

**Response:** `200 OK`
```json
{
  "id": "node_123",
  "parentId": null,
  "kind": "folder",
  "name": "New Name",
  "docId": null,
  "hasChildren": true
}
```

---

#### Move Node

Move a node to a different parent.

```http
PATCH /files/:id
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "parentId": "node_456"
}
```

**Response:** `200 OK`
```json
{
  "id": "node_123",
  "parentId": "node_456",
  "kind": "folder",
  "name": "Folder Name",
  "docId": null,
  "hasChildren": true
}
```

---

#### Delete Node

Delete a file or folder.

```http
DELETE /files/:id
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `409` - Folder not empty (must delete children first)

---

### Workspace Endpoints

#### List Workspaces

Get all workspaces for current user.

```http
GET /workspaces
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
[
  {
    "id": "ws_abc123",
    "name": "My Workspace",
    "description": "Personal workspace",
    "createdBy": "usr_abc123",
    "createdAt": 1704067200,
    "updatedAt": 1704067200,
    "role": "owner"
  }
]
```

---

#### Get Default Workspace

Get or create the user's default workspace.

```http
GET /workspaces/default
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "id": "ws_default123",
  "name": "Default Workspace",
  "description": null,
  "createdBy": "usr_abc123",
  "createdAt": 1704067200,
  "updatedAt": 1704067200,
  "role": "owner"
}
```

---

#### Create Workspace

Create a new workspace.

```http
POST /workspaces
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Project Alpha",
  "description": "Workspace for Project Alpha team"
}
```

**Response:** `201 Created`
```json
{
  "id": "ws_new456",
  "name": "Project Alpha",
  "description": "Workspace for Project Alpha team",
  "createdBy": "usr_abc123",
  "createdAt": 1704067200,
  "updatedAt": 1704067200,
  "role": "owner"
}
```

---

#### Get Workspace

Get workspace details.

```http
GET /workspaces/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "id": "ws_abc123",
  "name": "My Workspace",
  "description": "Personal workspace",
  "createdBy": "usr_abc123",
  "createdAt": 1704067200,
  "updatedAt": 1704067200,
  "role": "owner"
}
```

---

#### Update Workspace

Update workspace details.

```http
PATCH /workspaces/:id
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```

**Response:** `200 OK`

---

#### Delete Workspace

Delete a workspace (owner only).

```http
DELETE /workspaces/:id
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `403` - Not workspace owner

---

#### List Workspace Members

Get all members of a workspace.

```http
GET /workspaces/:id/members
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
[
  {
    "workspaceId": "ws_abc123",
    "userId": "usr_abc123",
    "role": "owner",
    "joinedAt": 1704067200
  },
  {
    "workspaceId": "ws_abc123",
    "userId": "usr_def456",
    "role": "editor",
    "joinedAt": 1704153600
  }
]
```

---

#### Add Workspace Member

Add a member to a workspace.

```http
POST /workspaces/:id/members
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "usr_def456",
  "role": "editor"
}
```

**Roles:**

| Role | Level | Permissions |
|------|-------|-------------|
| `viewer` | 25 | read |
| `editor` | 50 | read, write, export |
| `admin` | 75 | read, write, export, manage_members, settings |
| `owner` | 100 | all permissions including delete, transfer |

**Response:** `201 Created`
```json
{
  "workspaceId": "ws_abc123",
  "userId": "usr_def456",
  "role": "editor",
  "joinedAt": 1704153600
}
```

---

#### Update Member Role

Change a member's role.

```http
PATCH /workspaces/:id/members/:userId
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "role": "admin"
}
```

**Response:** `200 OK`
```json
{
  "workspaceId": "ws_abc123",
  "userId": "usr_def456",
  "role": "admin",
  "joinedAt": 1704153600
}
```

---

#### Remove Workspace Member

Remove a member from a workspace.

```http
DELETE /workspaces/:id/members/:userId
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

---

### Doc Permission Endpoints

Document-level access control that extends workspace RBAC to individual documents.

#### Doc Permission Roles

| Role | Level | Permissions |
|------|-------|-------------|
| `owner` | 100 | All permissions + transfer ownership |
| `editor` | 75 | read, write, comment, export, AI ops |
| `commenter` | 50 | read, comment |
| `viewer` | 25 | read only |

**Permission Resolution Order:**
1. Explicit doc permission (takes precedence)
2. Workspace role (mapped to doc role)
3. Doc creator (implicit owner)

**Workspace to Doc Role Mapping:**
- workspace `owner` → doc `owner`
- workspace `admin` → doc `editor`
- workspace `editor` → doc `editor`
- workspace `viewer` → doc `viewer`

---

#### List Doc Permissions

Get all permissions for a document.

```http
GET /docs/:id/permissions
Authorization: Bearer <accessToken>
```

**Response (as owner):** `200 OK`
```json
{
  "permissions": [
    {
      "docId": "doc_xyz789",
      "userId": "user_abc123",
      "role": "owner",
      "grantedBy": "system",
      "grantedAt": "2024-01-01T12:00:00.000Z"
    },
    {
      "docId": "doc_xyz789",
      "userId": "user_def456",
      "role": "editor",
      "grantedBy": "user_abc123",
      "grantedAt": "2024-01-01T13:00:00.000Z"
    }
  ],
  "workspaceAccess": "viewer"
}
```

**Note:** `workspaceAccess` is only included in owner responses. It may be `null` (use workspace role), `"none"`, `"viewer"`, `"commenter"`, or `"editor"`.

**Response (as non-owner):** Only returns the user's own permission
```json
{
  "permissions": [
    {
      "docId": "doc_xyz789",
      "userId": "user_def456",
      "role": "editor",
      "grantedBy": "user_abc123",
      "grantedAt": "2024-01-01T13:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `403` - Access denied (no access to document)
- `404` - Document not found

---

#### Grant Doc Permission

Grant access to a user on a document.

```http
POST /docs/:id/permissions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "user_xyz789",
  "role": "editor"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | User ID to grant access to |
| `role` | string | Yes | Role: `owner`, `editor`, `commenter`, `viewer` |

**Response:** `201 Created`
```json
{
  "docId": "doc_xyz789",
  "userId": "user_xyz789",
  "role": "editor",
  "grantedBy": "user_abc123",
  "grantedAt": "2024-01-01T14:00:00.000Z"
}
```

**Errors:**
- `400` - Missing required fields or invalid role
- `403` - Only owners can grant owner role / Requires editor+ to grant permissions
- `404` - Document not found
- `409` - User already has permission (use PATCH to update)

---

#### Update Doc Permission

Update a user's role on a document.

```http
PATCH /docs/:id/permissions/:userId
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "role": "commenter"
}
```

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "userId": "user_xyz789",
  "role": "commenter",
  "grantedBy": "user_abc123",
  "grantedAt": "2024-01-01T14:00:00.000Z"
}
```

**Errors:**
- `400` - Invalid role
- `403` - Only owners can update permissions / Cannot demote owner
- `404` - Document not found / User doesn't have explicit permission

---

#### Revoke Doc Permission

Revoke a user's permission on a document.

```http
DELETE /docs/:id/permissions/:userId
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `403` - Only owners can revoke permissions / Cannot remove document owner
- `404` - Document not found / User doesn't have explicit permission

**Note:** Self-removal is allowed (user can leave a document).

---

#### Update Workspace Access

Set the default access level for all workspace members on a document.

```http
PATCH /docs/:id/workspace-access
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "workspaceAccess": "viewer"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workspaceAccess` | string\|null | Yes | `none`, `viewer`, `commenter`, `editor`, or `null` |

**Workspace Access Values:**

| Value | Description |
|-------|-------------|
| `null` | No setting - fall back to workspace role mapping |
| `none` | Workspace members have no default access (must have explicit permission) |
| `viewer` | Workspace members can view the document |
| `commenter` | Workspace members can view and comment |
| `editor` | Workspace members can view, comment, and edit |

**Permission Resolution Order:**
1. Explicit doc permission (takes precedence)
2. Doc's workspace_access setting (if user is workspace member)
3. Workspace role mapping (fallback)
4. Doc creator (implicit owner)

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "workspaceAccess": "viewer",
  "updatedAt": "2024-01-01T14:00:00.000Z"
}
```

**Errors:**
- `400` - Invalid workspaceAccess value
- `403` - Only document owners can update workspace access
- `404` - Document not found

---

### Comment Endpoints

Document comments with threading, mentions, and resolution. Comments can be anchored to text selections or be document-level.

#### Comment Permission Model

| Action | Required Role |
|--------|---------------|
| Read comments | viewer+ |
| Create comment | commenter+ |
| Edit own comment | commenter+ |
| Delete own comment | commenter+ |
| Delete any comment | editor+ |
| Resolve thread | commenter+ |
| Reopen thread | commenter+ |
| Bulk resolve threads | commenter+ |

---

#### List Comments

Get all comments for a document.

```http
GET /docs/:id/comments
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeDeleted` | string | Include soft-deleted comments ("true"/"false", default: false) |
| `includeResolved` | string | Include resolved threads ("true"/"false", default: true) |
| `threadId` | string | Filter by specific thread ID |
| `authorId` | string | Filter by comment author user ID |
| `mentionsUser` | string | Filter comments that @mention a specific user ID |
| `unresolvedOnly` | string | Show only unresolved threads ("true"/"false", default: false). When true, overrides `includeResolved` to false. |
| `from` | string | Filter comments created on or after this epoch millisecond timestamp |
| `to` | string | Filter comments created on or before this epoch millisecond timestamp |
| `search` | string | Search in comment content (case-insensitive substring match) |
| `limit` | string | Maximum comments to return (default: 100, max: 200) |
| `offset` | string | Number of comments to skip for pagination (default: 0) |
| `sortBy` | string | Sort order: `created_at_asc` (default) or `created_at_desc` |

**Response:** `200 OK`
```json
{
  "comments": [
    {
      "id": 1,
      "docId": "doc_xyz789",
      "threadId": "abc123def456",
      "parentId": null,
      "authorId": "user_abc123",
      "content": "This paragraph needs revision.",
      "anchorFrom": 150,
      "anchorTo": 200,
      "anchorText": "selected text here",
      "resolvedAt": null,
      "resolvedBy": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z",
      "mentions": ["user_def456"]
    },
    {
      "id": 2,
      "docId": "doc_xyz789",
      "threadId": "abc123def456",
      "parentId": 1,
      "authorId": "user_def456",
      "content": "I agree, let me fix it.",
      "anchorFrom": null,
      "anchorTo": null,
      "anchorText": null,
      "resolvedAt": null,
      "resolvedBy": null,
      "createdAt": "2024-01-01T12:30:00.000Z",
      "updatedAt": "2024-01-01T12:30:00.000Z",
      "mentions": []
    }
  ],
  "total": 2
}
```

**Errors:**
- `400` - Invalid `from`, `to`, `limit`, or `offset` parameter
- `403` - Access denied (no viewer+ access)
- `404` - Document not found

---

#### Create Comment

Create a new comment on a document.

```http
POST /docs/:id/comments
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "This paragraph needs revision.",
  "parentId": null,
  "anchorFrom": 150,
  "anchorTo": 200,
  "anchorText": "selected text here",
  "mentions": ["user_def456"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Comment text |
| `parentId` | number | No | Parent comment ID for replies (null for root comments) |
| `anchorFrom` | number | No | Start position of anchored text (null for doc-level) |
| `anchorTo` | number | No | End position of anchored text |
| `anchorText` | string | No | Original anchored text (for display if moved) |
| `mentions` | string[] | No | User IDs to mention |

**Response:** `201 Created`
```json
{
  "id": 1,
  "docId": "doc_xyz789",
  "threadId": "abc123def456",
  "parentId": null,
  "authorId": "user_abc123",
  "content": "This paragraph needs revision.",
  "anchorFrom": 150,
  "anchorTo": 200,
  "anchorText": "selected text here",
  "resolvedAt": null,
  "resolvedBy": null,
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:00:00.000Z",
  "mentions": ["user_def456"]
}
```

**Threading Behavior:**
- Root comments (no `parentId`) generate a new unique `threadId`
- Replies inherit the `threadId` from their parent comment

**Errors:**
- `400` - Content is required / Parent comment not found
- `403` - Requires commenter role or higher
- `404` - Document not found

---

#### Get Comment

Get a single comment by ID.

```http
GET /comments/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "docId": "doc_xyz789",
  "threadId": "abc123def456",
  "parentId": null,
  "authorId": "user_abc123",
  "content": "This paragraph needs revision.",
  "anchorFrom": 150,
  "anchorTo": 200,
  "anchorText": "selected text here",
  "resolvedAt": null,
  "resolvedBy": null,
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:00:00.000Z",
  "mentions": ["user_def456"]
}
```

**Errors:**
- `400` - Invalid comment ID
- `403` - Access denied (no viewer+ access to document)
- `404` - Comment not found

---

#### Update Comment

Update a comment's content. Only the author can edit their own comments.

```http
PATCH /comments/:id
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "Updated comment text."
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "docId": "doc_xyz789",
  "threadId": "abc123def456",
  "parentId": null,
  "authorId": "user_abc123",
  "content": "Updated comment text.",
  "anchorFrom": 150,
  "anchorTo": 200,
  "anchorText": "selected text here",
  "resolvedAt": null,
  "resolvedBy": null,
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:30:00.000Z",
  "mentions": ["user_def456"]
}
```

**Errors:**
- `400` - Content is required / Invalid comment ID
- `403` - Can only edit your own comments
- `404` - Comment not found

---

#### Delete Comment

Soft delete a comment. Authors can delete their own comments; editors+ can delete any comment.

```http
DELETE /comments/:id
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `400` - Invalid comment ID
- `403` - Can only delete your own comments, or requires editor role
- `404` - Comment not found

---

#### Resolve Thread

Mark a comment thread as resolved. Can be called on any comment in the thread.

```http
POST /comments/:id/resolve
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "threadId": "abc123def456"
}
```

**Behavior:**
- Sets `resolvedAt` and `resolvedBy` on the root comment of the thread
- All replies inherit the resolution status from the root

**Errors:**
- `400` - Comment has no thread / Failed to resolve
- `403` - Requires commenter role or higher
- `404` - Comment not found

---

#### Reopen Thread

Reopen a resolved comment thread.

```http
POST /comments/:id/reopen
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "threadId": "abc123def456"
}
```

**Behavior:**
- Clears `resolvedAt` and `resolvedBy` on the root comment

**Errors:**
- `400` - Comment has no thread / Failed to reopen
- `403` - Requires commenter role or higher
- `404` - Comment not found

---

#### Bulk Resolve Threads

Resolve multiple comment threads at once, or all unresolved threads for a document.

```http
POST /docs/:id/comments/bulk-resolve
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "threadIds": ["abc123def456", "ghi789jkl012"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `threadIds` | string[] | No | Thread IDs to resolve. If empty or omitted, resolves all unresolved threads in the document. |

**Response:** `200 OK`
```json
{
  "resolved": 2,
  "threadIds": ["abc123def456", "ghi789jkl012"]
}
```

**Behavior:**
- Resolves each specified thread by setting `resolvedAt` and `resolvedBy` on the root comment
- Already-resolved threads are skipped (not counted in `resolved`)
- If `threadIds` is empty or omitted, resolves all unresolved threads in the document
- Returns the count of newly resolved threads and the list of thread IDs that were resolved
- Generates `comment:bulk_resolve` audit log entry
- Broadcasts `bulk_resolved` WebSocket event

**Errors:**
- `400` - Invalid request body (threadIds must be an array of strings)
- `403` - Requires commenter role or higher
- `404` - Document not found

---

### Version History Endpoints

Document version history with named snapshots, restore capability, and text diff.

#### Version Permission Model

| Action | Required Role |
|--------|---------------|
| List versions | viewer+ |
| Get version snapshot | viewer+ |
| Compute diff | viewer+ |
| Create version | editor+ |
| Rename version | editor+ |
| Delete version | editor+ |
| Restore version | editor+ |

---

#### List Versions

Get all versions for a document.

```http
GET /docs/:id/versions
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 100, max: 200) |
| `offset` | number | Offset for pagination (default: 0) |

**Response:** `200 OK`
```json
{
  "versions": [
    {
      "id": 3,
      "docId": "doc_xyz789",
      "versionNumber": 3,
      "name": "Final draft",
      "snapshotHash": "sha256:abc123...",
      "createdBy": "user_abc123",
      "createdAt": "2024-01-01T14:00:00.000Z",
      "proofId": null,
      "metadata": {
        "wordCount": 1500,
        "charCount": 8500,
        "notes": "Ready for review"
      }
    },
    {
      "id": 2,
      "docId": "doc_xyz789",
      "versionNumber": 2,
      "name": null,
      "snapshotHash": "sha256:def456...",
      "createdBy": "user_abc123",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "proofId": null,
      "metadata": null
    }
  ],
  "total": 3
}
```

**Errors:**
- `403` - Access denied (no viewer+ access)
- `404` - Document not found

---

#### Create Version

Create a new version snapshot of the document.

```http
POST /docs/:id/versions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Final draft",
  "snapshotHtml": "<h1>Document Title</h1><p>Content...</p>",
  "snapshotText": "Document Title\n\nContent...",
  "metadata": {
    "wordCount": 1500,
    "charCount": 8500,
    "notes": "Ready for review"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Human-readable version name |
| `snapshotHtml` | string | Yes | HTML content snapshot |
| `snapshotText` | string | Yes | Plain text content for diff |
| `metadata` | object | No | Optional metadata (wordCount, charCount, notes) |

**Response:** `201 Created`
```json
{
  "id": 4,
  "docId": "doc_xyz789",
  "versionNumber": 4,
  "name": "Final draft",
  "snapshotHash": "sha256:ghi789...",
  "createdBy": "user_abc123",
  "createdAt": "2024-01-01T15:00:00.000Z",
  "proofId": null,
  "metadata": {
    "wordCount": 1500,
    "charCount": 8500,
    "notes": "Ready for review"
  }
}
```

**Errors:**
- `400` - snapshotHtml/snapshotText is required
- `403` - Requires editor role or higher
- `404` - Document not found

---

#### Get Version

Get full version with snapshot content.

```http
GET /docs/:id/versions/:versionId
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "id": 3,
  "docId": "doc_xyz789",
  "versionNumber": 3,
  "name": "Final draft",
  "snapshotHash": "sha256:abc123...",
  "createdBy": "user_abc123",
  "createdAt": "2024-01-01T14:00:00.000Z",
  "proofId": null,
  "metadata": {
    "wordCount": 1500,
    "charCount": 8500,
    "notes": "Ready for review"
  },
  "snapshotHtml": "<h1>Document Title</h1><p>Content...</p>",
  "snapshotText": "Document Title\n\nContent..."
}
```

**Errors:**
- `400` - Invalid version ID
- `403` - Access denied (no viewer+ access)
- `404` - Document/Version not found

---

#### Rename Version

Update a version's name.

```http
PATCH /docs/:id/versions/:versionId
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated name"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string/null | Yes | New name (null to remove name) |

**Response:** `200 OK`
```json
{
  "id": 3,
  "docId": "doc_xyz789",
  "versionNumber": 3,
  "name": "Updated name",
  "snapshotHash": "sha256:abc123...",
  "createdBy": "user_abc123",
  "createdAt": "2024-01-01T14:00:00.000Z",
  "proofId": null,
  "metadata": null
}
```

**Errors:**
- `400` - Invalid version ID
- `403` - Requires editor role or higher
- `404` - Document/Version not found

---

#### Delete Version

Delete a version.

```http
DELETE /docs/:id/versions/:versionId
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `400` - Invalid version ID
- `403` - Requires editor role or higher
- `404` - Document/Version not found

---

#### Get Version Diff

Compute a line-based text diff between two versions.

```http
GET /docs/:id/versions/:versionId/diff?compareWith=2
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `compareWith` | number | Yes | Version number to compare against |

**Response:** `200 OK`
```json
{
  "fromVersion": 2,
  "toVersion": 3,
  "additions": 15,
  "deletions": 8,
  "hunks": [
    {
      "type": "remove",
      "lineStart": 5,
      "content": ["Old line 5", "Old line 6"]
    },
    {
      "type": "add",
      "lineStart": 5,
      "content": ["New line 5", "New line 6", "New line 7"]
    },
    {
      "type": "context",
      "lineStart": 10,
      "content": ["Unchanged line 10"]
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `fromVersion` | Source version number (older) |
| `toVersion` | Target version number (newer) |
| `additions` | Number of lines added |
| `deletions` | Number of lines removed |
| `hunks` | Array of diff hunks |
| `hunks[].type` | `add`, `remove`, or `context` |
| `hunks[].lineStart` | Starting line number |
| `hunks[].content` | Array of line contents |

**Errors:**
- `400` - Invalid version ID / compareWith required
- `403` - Access denied (no viewer+ access)
- `404` - Document/Version not found

---

#### Restore Version

Restore document to a prior version. Creates a backup of current state first.

```http
POST /docs/:id/restore-version
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "versionId": 2,
  "currentHtml": "<h1>Current Content</h1><p>...</p>",
  "currentText": "Current Content\n\n..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `versionId` | number | Yes | Version ID to restore |
| `currentHtml` | string | Yes | Current document HTML (for backup) |
| `currentText` | string | Yes | Current document text (for backup) |

**Response:** `200 OK`
```json
{
  "ok": true,
  "restoredFromVersion": 2,
  "newVersionCreated": 4,
  "snapshotHtml": "<h1>Restored Content</h1><p>...</p>",
  "snapshotText": "Restored Content\n\n..."
}
```

| Field | Description |
|-------|-------------|
| `restoredFromVersion` | Version number that was restored |
| `newVersionCreated` | Version number of the backup created |
| `snapshotHtml` | HTML content to apply to editor |
| `snapshotText` | Plain text content |

**Behavior:**
1. Creates a backup version of current state named "Before restore to vN"
2. Returns the target version's snapshot content
3. Frontend applies the snapshot to the editor

**Errors:**
- `400` - versionId/currentHtml/currentText required
- `403` - Requires editor role or higher
- `404` - Document/Version not found

---

### Suggestion Endpoints

Document suggestions for track changes mode with accept/reject functionality.

#### Suggestion Permission Model

| Action | Required Role |
|--------|---------------|
| List suggestions | viewer+ |
| Get suggestion | viewer+ |
| Create suggestion | commenter+ |
| Update own suggestion | commenter+ |
| Delete own suggestion | commenter+ |
| Delete any suggestion | editor+ |
| Accept suggestion | editor+ |
| Reject suggestion | editor+ |
| Accept all pending | editor+ |
| Reject all pending | editor+ |

---

#### List Suggestions

Get all suggestions for a document.

```http
GET /docs/:id/suggestions
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `pending`, `accepted`, `rejected` |
| `authorId` | string | Filter by author user ID |
| `changeType` | string | Filter by change type: `insert`, `delete`, `replace` |
| `from` | number | Filter suggestions created at or after this epoch ms |
| `to` | number | Filter suggestions created at or before this epoch ms |
| `limit` | number | Max results (default: 100, max: 100) |
| `offset` | number | Offset for pagination (default: 0) |

**Response:** `200 OK`
```json
{
  "suggestions": [
    {
      "id": 1,
      "docId": "doc_xyz789",
      "authorId": "user_abc123",
      "status": "pending",
      "changeType": "replace",
      "fromPos": 150,
      "toPos": 180,
      "originalText": "old text here",
      "proposedText": "new text here",
      "comment": "This reads better",
      "resolvedBy": null,
      "resolvedAt": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pendingCount": 5,
  "total": 12
}
```

**Errors:**
- `403` - Access denied (no viewer+ access)
- `404` - Document not found

---

#### Create Suggestion

Create a new suggestion on a document.

```http
POST /docs/:id/suggestions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "changeType": "replace",
  "fromPos": 150,
  "toPos": 180,
  "originalText": "old text here",
  "proposedText": "new text here",
  "comment": "This reads better"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `changeType` | string | Yes | One of: `insert`, `delete`, `replace` |
| `fromPos` | number | Yes | Start position in plain text (0-indexed) |
| `toPos` | number | Yes | End position in plain text (>= fromPos) |
| `originalText` | string | Conditional | Required for `delete` and `replace` |
| `proposedText` | string | Conditional | Required for `insert` and `replace` |
| `comment` | string | No | Author's explanation for the suggestion |

**Change Type Requirements:**
- `insert`: `proposedText` required, `originalText` optional
- `delete`: `originalText` required, `proposedText` optional
- `replace`: Both `originalText` and `proposedText` required

**Response:** `201 Created`
```json
{
  "id": 1,
  "docId": "doc_xyz789",
  "authorId": "user_abc123",
  "status": "pending",
  "changeType": "replace",
  "fromPos": 150,
  "toPos": 180,
  "originalText": "old text here",
  "proposedText": "new text here",
  "comment": "This reads better",
  "resolvedBy": null,
  "resolvedAt": null,
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

**Errors:**
- `400` - Missing/invalid fields (changeType, fromPos, toPos, or conditional content)
- `403` - Requires commenter role or higher
- `404` - Document not found

---

#### Get Suggestion

Get a single suggestion by ID.

```http
GET /suggestions/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "docId": "doc_xyz789",
  "authorId": "user_abc123",
  "status": "pending",
  "changeType": "replace",
  "fromPos": 150,
  "toPos": 180,
  "originalText": "old text here",
  "proposedText": "new text here",
  "comment": "This reads better",
  "resolvedBy": null,
  "resolvedAt": null,
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

**Errors:**
- `400` - Invalid suggestion ID
- `403` - Access denied (no viewer+ access to document)
- `404` - Suggestion not found

---

#### Update Suggestion

Update a suggestion's comment. Only the author can edit, and only while pending.

```http
PATCH /suggestions/:id
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "comment": "Updated explanation"
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "docId": "doc_xyz789",
  "authorId": "user_abc123",
  "status": "pending",
  "changeType": "replace",
  "fromPos": 150,
  "toPos": 180,
  "originalText": "old text here",
  "proposedText": "new text here",
  "comment": "Updated explanation",
  "resolvedBy": null,
  "resolvedAt": null,
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:30:00.000Z"
}
```

**Errors:**
- `400` - Can only edit pending suggestions / Invalid suggestion ID
- `403` - Can only edit your own suggestions
- `404` - Suggestion not found

---

#### Delete Suggestion

Delete a suggestion. Authors can delete their own suggestions; editors+ can delete any.

```http
DELETE /suggestions/:id
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `400` - Invalid suggestion ID
- `403` - Can only delete your own suggestions, or requires editor role
- `404` - Suggestion not found

---

#### Accept Suggestion

Accept a pending suggestion (applies the change).

```http
POST /suggestions/:id/accept
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "suggestion": {
    "id": 1,
    "docId": "doc_xyz789",
    "authorId": "user_abc123",
    "status": "accepted",
    "changeType": "replace",
    "fromPos": 150,
    "toPos": 180,
    "originalText": "old text here",
    "proposedText": "new text here",
    "comment": "This reads better",
    "resolvedBy": "user_editor456",
    "resolvedAt": "2024-01-01T13:00:00.000Z",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T13:00:00.000Z"
  }
}
```

**Errors:**
- `400` - Can only accept pending suggestions / Invalid suggestion ID
- `403` - Requires editor role or higher
- `404` - Suggestion not found

---

#### Reject Suggestion

Reject a pending suggestion (discards the change).

```http
POST /suggestions/:id/reject
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "suggestion": {
    "id": 1,
    "docId": "doc_xyz789",
    "authorId": "user_abc123",
    "status": "rejected",
    "changeType": "replace",
    "fromPos": 150,
    "toPos": 180,
    "originalText": "old text here",
    "proposedText": "new text here",
    "comment": "This reads better",
    "resolvedBy": "user_editor456",
    "resolvedAt": "2024-01-01T13:00:00.000Z",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T13:00:00.000Z"
  }
}
```

**Errors:**
- `400` - Can only reject pending suggestions / Invalid suggestion ID
- `403` - Requires editor role or higher
- `404` - Suggestion not found

---

#### Accept All Pending Suggestions

Accept all pending suggestions for a document at once.

```http
POST /docs/:id/suggestions/accept-all
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "count": 5
}
```

| Field | Description |
|-------|-------------|
| `count` | Number of suggestions accepted |

**Errors:**
- `403` - Requires editor role or higher
- `404` - Document not found

---

#### Reject All Pending Suggestions

Reject all pending suggestions for a document at once.

```http
POST /docs/:id/suggestions/reject-all
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "count": 3
}
```

| Field | Description |
|-------|-------------|
| `count` | Number of suggestions rejected |

**Errors:**
- `403` - Requires editor role or higher
- `404` - Document not found

---

### Template Endpoints

Document templates allow users to create new documents from predefined content structures.

#### List Templates

Get all available document templates.

```http
GET /templates
```

**Response:** `200 OK`
```json
{
  "templates": [
    {
      "id": "blank",
      "name": "Blank Document",
      "description": "Start with an empty document",
      "icon": "file",
      "category": "basic"
    },
    {
      "id": "prd",
      "name": "Product Requirements Document",
      "description": "Document product requirements and specifications",
      "icon": "clipboard-list",
      "category": "product"
    },
    {
      "id": "one-pager",
      "name": "One-Pager",
      "description": "Executive summary format with key points",
      "icon": "file-text",
      "category": "business"
    },
    {
      "id": "meeting-notes",
      "name": "Meeting Notes",
      "description": "Capture meeting details and action items",
      "icon": "users",
      "category": "meetings"
    },
    {
      "id": "project-brief",
      "name": "Project Brief",
      "description": "Project overview, scope, and deliverables",
      "icon": "briefcase",
      "category": "project"
    },
    {
      "id": "weekly-report",
      "name": "Weekly Report",
      "description": "Status updates, accomplishments, and blockers",
      "icon": "calendar",
      "category": "reporting"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Template identifier |
| `name` | string | Display name |
| `description` | string | Short description |
| `icon` | string | Icon identifier (file, clipboard-list, file-text, users, briefcase, calendar) |
| `category` | string | Category grouping |

---

#### Get Template

Get a single template with full content.

```http
GET /templates/:id
```

**Response:** `200 OK`
```json
{
  "template": {
    "id": "prd",
    "name": "Product Requirements Document",
    "description": "Document product requirements and specifications",
    "icon": "clipboard-list",
    "category": "product",
    "content": {
      "type": "doc",
      "content": [
        { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Product Requirements Document" }] },
        { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Overview" }] },
        { "type": "paragraph", "content": [{ "type": "text", "text": "..." }] }
      ]
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | object | Tiptap JSON document structure |

**Errors:**
- `404` - Template not found

---

#### Create Document from Template

Create a new document pre-filled with template content.

```http
POST /docs/from-template
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "templateId": "prd",
  "title": "Q1 Product Requirements"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `templateId` | string | Yes | Template ID to use |
| `title` | string | No | Custom document title (defaults to template name) |

**Response:** `201 Created`
```json
{
  "doc": {
    "id": "abc123xyz",
    "title": "Q1 Product Requirements",
    "workspaceId": "ws_default",
    "createdBy": "user_abc123",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  },
  "templateContent": {
    "type": "doc",
    "content": [...]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `doc` | object | Created document metadata |
| `templateContent` | object | Tiptap JSON content to apply in editor |

**Errors:**
- `400` - templateId required
- `403` - Requires editor role or higher
- `404` - Template not found

---

### Doc Link Endpoints

Cross-document linking allows documents to reference other documents. Links are stored by document ID (rename-safe) and support backlink queries.

#### List Outgoing Links

Get all links from a document to other documents.

```http
GET /docs/:id/links
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "links": [
    {
      "id": 123,
      "fromDocId": "abc123",
      "toDocId": "xyz789",
      "toDocTitle": "Target Document Title",
      "workspaceId": "ws_default",
      "linkText": "see also",
      "position": 1234,
      "createdBy": "user_abc123",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Link ID |
| `fromDocId` | string | Source document ID |
| `toDocId` | string | Target document ID |
| `toDocTitle` | string | Target document title (from JOIN) |
| `workspaceId` | string\|null | Workspace scope |
| `linkText` | string\|null | Display text at link creation |
| `position` | number\|null | Character position in source document |
| `createdBy` | string | User who created the link |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

**Errors:**
- `403` - Access denied
- `404` - Document not found

---

#### List Backlinks

Get all documents that link to this document.

```http
GET /docs/:id/backlinks
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "backlinks": [
    {
      "id": 456,
      "fromDocId": "other123",
      "fromDocTitle": "Linking Document Title",
      "toDocId": "abc123",
      "workspaceId": "ws_default",
      "linkText": "reference",
      "position": 500,
      "createdBy": "user_xyz789",
      "createdAt": "2025-01-15T09:00:00.000Z",
      "updatedAt": "2025-01-15T09:00:00.000Z"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `fromDocId` | string | Document containing the link |
| `fromDocTitle` | string | Source document title (from JOIN) |
| `toDocId` | string | Target document ID (the current doc) |

**Errors:**
- `403` - Access denied
- `404` - Document not found

---

#### Create Link

Create a new link from this document to another.

```http
POST /docs/:id/links
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "toDocId": "target-doc-uuid",
  "linkText": "see also",
  "position": 1234
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toDocId` | string | Yes | Target document ID |
| `linkText` | string | No | Display text for the link |
| `position` | number | No | Character position in source document |

**Response:** `201 Created`
```json
{
  "id": 789,
  "fromDocId": "source-doc-uuid",
  "toDocId": "target-doc-uuid",
  "toDocTitle": "Target Document",
  "workspaceId": "ws_default",
  "linkText": "see also",
  "position": 1234,
  "createdBy": "user_abc123",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Errors:**
- `400` - toDocId is required
- `400` - Target document not found
- `400` - Cannot link a document to itself
- `403` - Requires editor role or higher
- `404` - Document not found

---

#### Delete Link

Remove a link from a document.

```http
DELETE /docs/:id/links/:linkId
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `400` - Invalid link ID
- `403` - Requires editor role or higher
- `403` - Link does not belong to this document
- `404` - Document not found
- `404` - Link not found

---

#### Sync Links

Bulk synchronize all links in a document. This is typically called when the document is saved. It removes links that no longer exist in the document and adds new ones.

```http
PUT /docs/:id/links/sync
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "links": [
    { "toDocId": "uuid1", "linkText": "text1", "position": 100 },
    { "toDocId": "uuid2", "linkText": "text2", "position": 500 }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `links` | array | Yes | Array of link objects |
| `links[].toDocId` | string | Yes | Target document ID |
| `links[].linkText` | string | No | Display text |
| `links[].position` | number | No | Character position |

**Response:** `200 OK`
```json
{
  "added": 2,
  "removed": 1,
  "total": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `added` | number | Number of new links created |
| `removed` | number | Number of links removed |
| `total` | number | Total links after sync |

**Errors:**
- `400` - links must be an array
- `403` - Requires editor role or higher
- `404` - Document not found

---

### Message Endpoints

Workspace-scoped persistent chat messaging.

#### List Messages

Get messages for a workspace with pagination.

```http
GET /workspaces/:workspaceId/messages
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 50, max: 100) |
| `before` | number | Message ID for pagination (older messages) |
| `after` | number | Message ID for pagination (newer messages) |

**Response:** `200 OK`
```json
{
  "messages": [
    {
      "id": 1,
      "workspaceId": "ws_123",
      "authorId": "user_456",
      "content": "Hello everyone!",
      "replyToId": null,
      "editedAt": null,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "hasMore": true
}
```

---

#### Create Message

Post a new message to a workspace.

```http
POST /workspaces/:workspaceId/messages
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "Hello everyone!",
  "replyToId": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Message content |
| `replyToId` | number | No | ID of message being replied to |

**Response:** `201 Created`
```json
{
  "id": 2,
  "workspaceId": "ws_123",
  "authorId": "user_456",
  "content": "Hello everyone!",
  "replyToId": null,
  "editedAt": null,
  "createdAt": "2024-01-15T10:31:00.000Z"
}
```

**Errors:**
- `400` - content is required
- `400` - Parent message not found (for replies)
- `403` - Not a workspace member

---

#### Update Message

Edit your own message.

```http
PATCH /messages/:id
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "Updated message content"
}
```

**Response:** `200 OK`
```json
{
  "id": 2,
  "workspaceId": "ws_123",
  "authorId": "user_456",
  "content": "Updated message content",
  "replyToId": null,
  "editedAt": "2024-01-15T10:35:00.000Z",
  "createdAt": "2024-01-15T10:31:00.000Z"
}
```

**Errors:**
- `400` - content is required
- `403` - Can only edit your own messages
- `404` - Message not found

---

#### Delete Message

Soft delete your own message.

```http
DELETE /messages/:id
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `403` - Can only delete your own messages
- `404` - Message not found

---

### Notification Endpoints

User notifications for mentions, comments, shares, etc.

#### List Notifications

Get notifications for the authenticated user.

```http
GET /notifications
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 50, max: 100) |
| `before` | number | Notification ID for pagination |
| `unreadOnly` | boolean | Only return unread notifications |
| `workspaceId` | string | Filter by workspace |

**Response:** `200 OK`
```json
{
  "notifications": [
    {
      "id": 1,
      "userId": "user_456",
      "workspaceId": "ws_123",
      "type": "mention",
      "title": "You were mentioned in a comment",
      "body": "Hey @user, check this out...",
      "linkType": "comment",
      "linkId": "42",
      "actorId": "user_789",
      "readAt": null,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "unreadCount": 5,
  "hasMore": true
}
```

**Notification Types:**

| Type | Description |
|------|-------------|
| `mention` | User was @mentioned in a comment |
| `comment_reply` | Someone replied to user's comment thread |
| `doc_shared` | A document was shared with user |
| `suggestion_pending` | A suggestion needs review |
| `reminder` | An extraction reminder has triggered (links to document) |

---

#### Get Unread Count

Get the number of unread notifications.

```http
GET /notifications/count
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspaceId` | string | Filter by workspace |

**Response:** `200 OK`
```json
{
  "unreadCount": 5
}
```

---

#### Mark Notification as Read

Mark a single notification as read.

```http
POST /notifications/:id/read
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

**Errors:**
- `400` - Notification already read or not found
- `403` - Cannot mark others' notifications as read
- `404` - Notification not found

---

#### Mark All Notifications as Read

Mark all notifications as read.

```http
POST /notifications/read-all
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "workspaceId": "ws_123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workspaceId` | string | No | Limit to specific workspace |

**Response:** `200 OK`
```json
{
  "count": 5
}
```

---

#### Delete Notification

Delete a notification.

```http
DELETE /notifications/:id
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `403` - Cannot delete others' notifications
- `404` - Notification not found

---

### Notification Preference Endpoints (Slice 11)

User-level notification channel preferences per workspace. Users can configure which notification types are delivered via which channels (in-app, webhook, Slack).

#### List Notification Preferences

Get the current user's notification preferences for a workspace.

```http
GET /workspaces/:id/notification-preferences
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "preferences": [
    {
      "id": 1,
      "userId": "user_abc123",
      "workspaceId": "ws_xyz789",
      "channel": "in_app",
      "notificationType": "all",
      "enabled": true,
      "config": null,
      "createdAt": "2026-02-19T00:00:00.000Z",
      "updatedAt": "2026-02-19T00:00:00.000Z"
    },
    {
      "id": 2,
      "userId": "user_abc123",
      "workspaceId": "ws_xyz789",
      "channel": "webhook",
      "notificationType": "all",
      "enabled": true,
      "config": { "url": "https://example.com/kacheri-webhook" },
      "createdAt": "2026-02-19T00:00:00.000Z",
      "updatedAt": "2026-02-19T00:00:00.000Z"
    },
    {
      "id": 3,
      "userId": "user_abc123",
      "workspaceId": "ws_xyz789",
      "channel": "slack",
      "notificationType": "mention",
      "enabled": true,
      "config": { "webhookUrl": "https://hooks.slack.com/services/T00/B00/xxx" },
      "createdAt": "2026-02-19T00:00:00.000Z",
      "updatedAt": "2026-02-19T00:00:00.000Z"
    }
  ]
}
```

**Channels:** `in_app`, `webhook`, `slack`, `email`

**Notification Types:** `mention`, `comment_reply`, `doc_shared`, `suggestion_pending`, `reminder`, `all`

**Config Shapes:**
- `in_app`: `null` (always delivered)
- `webhook`: `{ "url": "https://..." }` (must be HTTPS)
- `slack`: `{ "webhookUrl": "https://hooks.slack.com/services/..." }`
- `email`: `{ "email": "user@example.com" }` (valid email address; requires SMTP server config via env vars)

---

#### Update Notification Preferences

Create or update the current user's notification preferences for a workspace. Uses upsert on the `(user_id, workspace_id, channel, notification_type)` unique constraint.

```http
PUT /workspaces/:id/notification-preferences
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "preferences": [
    { "channel": "webhook", "notificationType": "all", "enabled": true, "config": { "url": "https://example.com/hook" } },
    { "channel": "slack", "notificationType": "mention", "enabled": true, "config": { "webhookUrl": "https://hooks.slack.com/services/T00/B00/xxx" } },
    { "channel": "slack", "notificationType": "comment_reply", "enabled": false },
    { "channel": "email", "notificationType": "all", "enabled": true, "config": { "email": "user@example.com" } }
  ]
}
```

**Response:** `200 OK`
```json
{
  "preferences": [ ... ],
  "updated": 3
}
```

**Errors:**
- `400` - Invalid channel, notification type, or config format
- `400` - Webhook URL must use HTTPS
- `400` - Slack webhook URL must match `https://hooks.slack.com/services/...`
- `400` - Email channel requires a valid email address in `config.email`
- `403` - Not a workspace member

**Side effects:** Audit log entry (`notification:preference:update`)

---

#### Update Cross-Product Notification Preferences (Convenience) — Slice S14

Toggle cross-product notification types on/off for the current user. This is a convenience wrapper that sets `in_app` channel preferences for the three cross-product notification types.

```http
PATCH /workspaces/:id/notification-preferences
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "crossProductEntityConflict": true,
  "crossProductEntityUpdate": true,
  "crossProductNewConnection": false
}
```

All fields are optional booleans. At least one must be provided.

**Cross-Product Notification Types:**
- `cross_product:entity_update` — Entity was referenced by a new product (default: ON)
- `cross_product:entity_conflict` — Entity appears across 3+ products (default: ON)
- `cross_product:new_connection` — New relationship bridges entities from different products (default: OFF)

**Response:** `200 OK`
```json
{
  "preferences": [...],
  "updated": 2
}
```

**Errors:**
- `400` - No valid fields provided, or non-boolean value
- `403` - Not a workspace member

**Side effects:** Audit log entry (`notification:preference:update`)

**Link Type:** Cross-product notifications use `linkType: "entity"` with `linkId` set to the entity ID, enabling navigation to the Knowledge Explorer.

**Rate Limiting:** Max 10 notifications per entity per hour. Enforced server-side via in-memory sliding window.

---

#### Permission Model — Notification Preferences

| Action | Required Role |
|--------|--------------|
| List own preferences | `member+` on workspace |
| Update own preferences | `member+` on workspace |
| Toggle cross-product preferences (PATCH) | `member+` on workspace |

---

### Document Reviewer Endpoints (Slice 12)

Assign reviewers to documents, track review status, and receive notifications when assigned.

#### Assign Reviewer

Assign a user as a reviewer on a document.

```http
POST /docs/:id/reviewers
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "user_xyz789"
}
```

**Response:** `201 Created`
```json
{
  "reviewer": {
    "id": 1,
    "docId": "doc_abc123",
    "workspaceId": "ws_001",
    "userId": "user_xyz789",
    "assignedBy": "user_abc123",
    "status": "pending",
    "assignedAt": 1708300800000,
    "completedAt": null,
    "notes": null
  }
}
```

**Errors:**
- `400` - Missing or invalid userId
- `403` - Requires editor+ role on document
- `409` - User is already assigned as reviewer on this document

**Side effects:** `review_assigned` notification to reviewer, audit log (`reviewer:assign`), WebSocket `reviewer` event

---

#### List Reviewers

Get all reviewers assigned to a document.

```http
GET /docs/:id/reviewers
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "reviewers": [
    {
      "id": 1,
      "docId": "doc_abc123",
      "workspaceId": "ws_001",
      "userId": "user_xyz789",
      "assignedBy": "user_abc123",
      "status": "pending",
      "assignedAt": 1708300800000,
      "completedAt": null,
      "notes": null
    }
  ],
  "count": 1
}
```

**Errors:**
- `403` - Requires viewer+ role on document

---

#### Update Reviewer Status

Update a reviewer's status (start review or mark complete).

```http
PATCH /docs/:id/reviewers/:userId
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "in_review",
  "notes": "Starting review of section 3"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | `in_review` or `completed` |
| `notes` | string | No | Optional reviewer notes |

**Response:** `200 OK`
```json
{
  "reviewer": {
    "id": 1,
    "docId": "doc_abc123",
    "workspaceId": "ws_001",
    "userId": "user_xyz789",
    "assignedBy": "user_abc123",
    "status": "in_review",
    "assignedAt": 1708300800000,
    "completedAt": null,
    "notes": "Starting review of section 3"
  }
}
```

**Errors:**
- `400` - Invalid status value
- `403` - Only the reviewer themselves or editor+ can update status
- `404` - Reviewer assignment not found

**Side effects:** Audit log (`reviewer:status_change`), WebSocket `reviewer` event

---

#### Remove Reviewer

Remove a reviewer assignment from a document.

```http
DELETE /docs/:id/reviewers/:userId
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "deleted": true
}
```

**Errors:**
- `403` - Requires editor+ on doc (or reviewer can remove themselves)
- `404` - Reviewer assignment not found

**Side effects:** Audit log (`reviewer:unassign`), WebSocket `reviewer` event

---

#### Permission Model — Document Reviewers

| Action | Required Role |
|--------|--------------|
| Assign reviewer | `editor+` on document |
| List reviewers | `viewer+` on document |
| Update reviewer status | Reviewer themselves OR `editor+` on document |
| Remove reviewer | `editor+` on document (or reviewer can remove self) |

---

### Audit Log Endpoints

Workspace-scoped audit trail for tracking activity and changes.

#### List Workspace Audit Log

Get audit trail entries for a workspace.

```http
GET /workspaces/:id/audit
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 50, max: 200) |
| `before` | number | Timestamp for pagination (Unix ms) |
| `action` | string | Filter by action type |
| `targetType` | string | Filter by target type |

**Response:** `200 OK`
```json
{
  "entries": [
    {
      "id": 123,
      "action": "member:add",
      "actorId": "user_abc123",
      "targetType": "user",
      "targetId": "user_xyz789",
      "details": { "role": "editor" },
      "ts": 1704067200000
    },
    {
      "id": 122,
      "action": "doc:create",
      "actorId": "user_abc123",
      "targetType": "doc",
      "targetId": "doc_xyz789",
      "details": { "title": "New Document" },
      "ts": 1704060000000
    }
  ],
  "hasMore": true
}
```

**Action Types:**

| Action | Description |
|--------|-------------|
| `member:add` | Member added to workspace |
| `member:remove` | Member removed from workspace |
| `role:change` | Member role changed |
| `doc:create` | Document created |
| `doc:delete` | Document moved to trash |
| `doc:restore` | Document restored from trash |
| `doc:permanent_delete` | Document permanently deleted |
| `folder:create` | Folder created |
| `folder:delete` | Folder moved to trash |
| `file:restore` | File/folder restored from trash |
| `file:permanent_delete` | File/folder permanently deleted |
| `doc:permission:grant` | Permission granted on document |
| `doc:permission:update` | Permission role changed on document |
| `doc:permission:revoke` | Permission revoked on document |

**Target Types:**

| Type | Description |
|------|-------------|
| `user` | User entity |
| `doc` | Document |
| `folder` | Folder |
| `file` | File node |
| `workspace` | Workspace |

**Errors:**
- `403` - Not a member of this workspace

---

#### Export Workspace Audit Log

Export audit log for compliance/archival. Requires admin role.

```http
GET /workspaces/:id/audit/export
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | Export format: `json` (default) or `csv` |

**Response (JSON):** `200 OK`
```json
{
  "workspaceId": "ws_abc123",
  "exportedAt": "2024-01-01T12:00:00.000Z",
  "totalCount": 150,
  "entries": [
    {
      "id": 123,
      "workspaceId": "ws_abc123",
      "actorId": "user_abc123",
      "action": "member:add",
      "targetType": "user",
      "targetId": "user_xyz789",
      "details": { "role": "editor" },
      "ts": 1704067200000
    }
  ]
}
```

**Response (CSV):** `200 OK`
Content-Type: `text/csv`
```csv
id,action,actorId,targetType,targetId,details,ts
123,member:add,user_abc123,user,user_xyz789,"{""role"":""editor""}",1704067200000
```

**Errors:**
- `403` - Requires admin role to export audit log

---

#### Get Workspace Audit Stats

Get audit statistics for a workspace.

```http
GET /workspaces/:id/audit/stats
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "totalCount": 150,
  "last24h": 12,
  "byAction": {
    "member:add": 5,
    "doc:create": 25,
    "doc:delete": 3,
    "folder:create": 10
  }
}
```

**Errors:**
- `403` - Not a member of this workspace

---

### AI Watch Endpoints

Global monitoring for AI activity across all documents.

#### Get AI Activity Summary

```http
GET /ai/watch/summary
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "total": 145,
  "byAction": {
    "compose": 50,
    "rewriteSelection": 40,
    "pdf": 30,
    "docx": 25
  },
  "avgElapsedMs": 2340,
  "last24h": 42,
  "verificationRate": 0.98
}
```

---

#### Get AI Events

Get recent AI events with pagination.

```http
GET /ai/watch/events
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 50) |
| `before` | number | Timestamp upper bound |

**Response:** `200 OK`
```json
{
  "events": [
    {
      "id": 128,
      "ts": 1704067200,
      "docId": "doc_xyz789",
      "path": null,
      "action": "compose",
      "elapsedMs": 1234,
      "preview": "Generated email content...",
      "inputSize": 256
    }
  ]
}
```

---

#### Get Exports Summary

Summary of export verifications.

```http
GET /ai/watch/exports-summary
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "totalExports": 55,
  "verified": 54,
  "failed": 1,
  "byType": {
    "pdf": 30,
    "docx": 25
  }
}
```

---

#### Get Compose Summary

Summary of compose action verifications.

```http
GET /ai/watch/compose-summary
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "totalComposes": 50,
  "verified": 50,
  "byProvider": {
    "anthropic": 30,
    "openai": 20
  }
}
```

---

#### Re-verify All Proofs

Trigger re-verification of all proof integrity.

```http
POST /ai/watch/reverify
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body (optional):**
```json
{
  "docId": "doc_xyz789"
}
```

**Response:** `200 OK`
```json
{
  "total": 145,
  "verified": 144,
  "failed": 1,
  "failures": [
    {
      "id": 125,
      "error": "Hash mismatch"
    }
  ]
}
```

---

### Document Trust Indicator Endpoints

These endpoints provide per-document trust and verification status (Phase 5 - P1).

---

#### Get Document Proof Health (P1.1)

Get comprehensive proof verification status for a document.

```http
GET /docs/:id/proof-health
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "status": "healthy",
  "score": 95,
  "exports": {
    "total": 5,
    "pass": 5,
    "fail": 0,
    "miss": 0
  },
  "compose": {
    "total": 10,
    "pass": 10,
    "drift": 0,
    "miss": 0
  },
  "lastVerified": "2025-12-30T02:00:00.000Z",
  "lastActivity": "2025-12-30T01:30:00.000Z"
}
```

**Status Values:**
| Status | Score Range | Description |
|--------|-------------|-------------|
| `healthy` | 80-100 | All exports pass, no compose drift |
| `stale` | 50-79 | Exports pass but >7 days since verification |
| `unverified` | 1-49 | Missing proofs or unverified exports |
| `failed` | 0 | Any export fails or compose drift detected |

---

#### Batch Get Proof Health (P1.1)

Get proof health for multiple documents in one request.

```http
POST /docs/proof-health/batch
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "docIds": ["doc_abc123", "doc_def456", "doc_ghi789"]
}
```

**Response:** `200 OK`
```json
{
  "results": [
    {
      "docId": "doc_abc123",
      "status": "healthy",
      "score": 100,
      "exports": { "total": 2, "pass": 2, "fail": 0, "miss": 0 },
      "compose": { "total": 5, "pass": 5, "drift": 0, "miss": 0 },
      "lastVerified": "2025-12-30T02:00:00.000Z",
      "lastActivity": "2025-12-29T15:00:00.000Z"
    }
  ]
}
```

---

#### Verify Single Export (P1.3)

Re-verify a specific export against its stored hash.

```http
POST /docs/:id/exports/:proofId/verify
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "verified": true,
  "hash": "sha256:abc123..."
}
```

**Errors:**
- `404` - Export not found
- `400` - `{ "verified": false, "error": "Hash mismatch" }`

---

#### Get Compose Determinism (P1.4)

Get determinism verification status for compose actions on a document.

```http
GET /docs/:id/compose-determinism
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "total": 15,
  "checked": 10,
  "pass": 10,
  "drift": 0,
  "lastChecked": "2025-12-30T02:00:00.000Z",
  "rate": 1.0
}
```

**Fields:**
| Field | Description |
|-------|-------------|
| `total` | Total compose actions for this document |
| `checked` | Number that have been determinism-checked |
| `pass` | Reruns produced identical output |
| `drift` | Reruns produced different output |
| `rate` | pass / (pass + drift), 1.0 if none checked |

---

#### Get AI Ranges for Heatmap (P1.2)

Get AI-touched text ranges for visual highlighting.

```http
GET /docs/:id/ai-ranges
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "docId": "doc_xyz789",
  "ranges": [
    {
      "id": 128,
      "kind": "ai:rewriteSelection",
      "start": 150,
      "end": 280,
      "ts": 1704067200000,
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250929"
    },
    {
      "id": 125,
      "kind": "ai:compose",
      "start": 0,
      "end": 0,
      "ts": 1704060000000,
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  ]
}
```

**Note:** For `ai:compose` actions without position data, `start` and `end` are both `0`, indicating the action covered the full document.

---

### Verification Report Endpoints

These endpoints manage verification report history from nightly verification runs (Phase 5 - P0.3).

---

#### List Verification Reports

Get paginated list of verification reports.

```http
GET /ai/watch/reports
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 20, max: 100) |
| `before` | string | Cursor for pagination (report ID) |
| `status` | string | Filter by status: `pass`, `fail`, or `partial` |

**Response:** `200 OK`
```json
{
  "reports": [
    {
      "id": "vr_abc123def456",
      "createdAt": "2025-12-30T02:00:00.000Z",
      "status": "pass",
      "exportsPASS": 45,
      "exportsFail": 0,
      "exportsMiss": 2,
      "composePass": 120,
      "composeDrift": 0,
      "composeMiss": 0,
      "triggeredBy": "github_actions"
    }
  ],
  "hasMore": true
}
```

---

#### Get Latest Report

Get the most recent verification report.

```http
GET /ai/watch/reports/latest
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "id": "vr_abc123def456",
  "createdAt": "2025-12-30T02:00:00.000Z",
  "status": "pass",
  "exportsPASS": 45,
  "exportsFail": 0,
  "exportsMiss": 2,
  "composePass": 120,
  "composeDrift": 0,
  "composeMiss": 0,
  "triggeredBy": "github_actions"
}
```

**Errors:**
- `404` - No verification reports found

---

#### Get Report Counts

Get counts of reports by status.

```http
GET /ai/watch/reports/counts
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "total": 90,
  "pass": 85,
  "fail": 3,
  "partial": 2
}
```

---

#### Get Single Report

Get a verification report by ID.

```http
GET /ai/watch/reports/:id
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `full` | boolean | Include full JSON report (default: false) |

**Response:** `200 OK`
```json
{
  "id": "vr_abc123def456",
  "createdAt": "2025-12-30T02:00:00.000Z",
  "status": "pass",
  "exportsPASS": 45,
  "exportsFail": 0,
  "exportsMiss": 2,
  "composePass": 120,
  "composeDrift": 0,
  "composeMiss": 0,
  "triggeredBy": "github_actions",
  "reportJson": { ... }
}
```

**Errors:**
- `404` - Report not found

---

#### Create Report

Create a new verification report (internal use by nightly_verify.ts).

```http
POST /ai/watch/reports
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "pass",
  "exportsPass": 45,
  "exportsFail": 0,
  "exportsMiss": 2,
  "composePass": 120,
  "composeDrift": 0,
  "composeMiss": 0,
  "reportJson": { ... },
  "triggeredBy": "manual"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | `pass`, `fail`, or `partial` |
| `exportsPass` | number | No | Export verifications passed |
| `exportsFail` | number | No | Export verifications failed |
| `exportsMiss` | number | No | Export files missing |
| `composePass` | number | No | Compose verifications passed |
| `composeDrift` | number | No | Compose drift detected |
| `composeMiss` | number | No | Compose proofs missing |
| `reportJson` | object | Yes | Full report data |
| `triggeredBy` | string | No | `cron`, `github_actions`, or `manual` |

**Response:** `201 Created`
```json
{
  "id": "vr_xyz789abc123",
  "createdAt": "2025-12-30T02:00:00.000Z",
  "status": "pass",
  ...
}
```

---

#### Delete Report

Delete a verification report.

```http
DELETE /ai/watch/reports/:id
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `404` - Report not found

---

#### Cleanup Old Reports

Apply retention policy to delete old reports.

```http
POST /ai/watch/reports/cleanup
Content-Type: application/json
```

**Request Body:**
```json
{
  "days": 90
}
```

**Response:** `200 OK`
```json
{
  "deleted": 15,
  "retentionDays": 90
}
```

---

### Workspace Intelligence Endpoints (Phase 5 - P2)

These endpoints provide workspace-scoped AI analytics and safety metrics.

---

#### AI Provider Analytics

Get usage and latency statistics by AI provider and model.

```http
GET /ai/watch/providers
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "providers": [
    {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250929",
      "totalCalls": 1250,
      "avgLatencyMs": 2340,
      "p50LatencyMs": 1890,
      "p95LatencyMs": 4200,
      "p99LatencyMs": 6100,
      "errorRate": 0,
      "lastUsed": "2025-12-30T10:30:00.000Z"
    }
  ],
  "summary": {
    "totalCalls": 2500,
    "avgLatencyMs": 2100,
    "uniqueProviders": 2,
    "uniqueModels": 4
  }
}
```

---

#### AI Usage Hotspots

Identify documents with high AI activity or issues.

```http
GET /ai/watch/hotspots
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | Time period: `24h`, `7d`, or `30d` (default: `24h`) |
| `limit` | number | Max results (default: 10, max: 50) |

**Response:** `200 OK`
```json
{
  "period": "24h",
  "hotspots": [
    {
      "docId": "abc123",
      "docTitle": "Important Contract",
      "workspaceId": "ws_001",
      "workspaceName": "Legal Team",
      "aiActionCount": 75,
      "verificationFailures": 0,
      "driftEvents": 1,
      "riskLevel": "high",
      "lastActivity": "2025-12-30T10:30:00.000Z"
    }
  ],
  "thresholds": {
    "high": { "actions": 50, "failures": 3, "drift": 2 },
    "medium": { "actions": 20, "failures": 1, "drift": 1 }
  }
}
```

**Risk Level Calculation:**
- `high`: 50+ AI actions OR 3+ verification failures OR 2+ drift events
- `medium`: 20+ AI actions OR 1+ failure OR 1 drift event
- `low`: Below medium thresholds

---

#### Workspace AI Safety

Get comprehensive AI safety metrics for a workspace.

```http
GET /workspaces/:id/ai-safety
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "workspaceId": "ws_001",
  "workspaceName": "Legal Team",
  "summary": {
    "totalDocs": 45,
    "docsWithAI": 32,
    "totalAIActions": 1250,
    "verificationRate": 98,
    "determinismRate": 95
  },
  "health": {
    "healthy": 28,
    "stale": 8,
    "unverified": 6,
    "failed": 3
  },
  "recentActivity": [
    {
      "docId": "abc123",
      "docTitle": "Contract Draft",
      "action": "compose",
      "ts": "2025-12-30T10:30:00.000Z",
      "status": "pass"
    }
  ],
  "topProviders": [
    {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250929",
      "callCount": 850
    }
  ]
}
```

**Health Categories:**
- `healthy`: Recent proofs, no failures
- `stale`: Last proof older than 7 days
- `unverified`: No proof records
- `failed`: Verification failures or drift detected

**Errors:**
- `404` - Workspace not found

---

### Infrastructure Endpoints (Phase 5 - P4)

These endpoints manage artifacts, storage, and background job processing.

---

#### List Artifacts

Get artifacts with optional filters.

```http
GET /artifacts
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `docId` | string | Filter by document ID |
| `kind` | string | Filter by artifact kind (pdf, docx, ai:compose, etc.) |
| `storageProvider` | string | Filter by storage provider (local, s3, gcs) |
| `verificationStatus` | string | Filter by status (pending, pass, fail, miss) |
| `limit` | number | Max results (default: 100) |
| `offset` | number | Pagination offset (default: 0) |

**Response:** `200 OK`
```json
{
  "artifacts": [
    {
      "id": 1,
      "docId": "abc123",
      "kind": "pdf",
      "hash": "sha256:a1b2c3...",
      "path": "storage/exports/doc-abc123/2025-12-30.pdf",
      "storageProvider": "local",
      "storageKey": "exports/doc-abc123/2025-12-30.pdf",
      "verifiedAt": 1735560000000,
      "verificationStatus": "pass",
      "meta": {},
      "ts": 1735559000000
    }
  ],
  "count": 1,
  "filter": {
    "docId": "abc123"
  }
}
```

---

#### Get Artifact Statistics

Get aggregate statistics about artifacts.

```http
GET /artifacts/stats
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "total": 150,
  "byVerificationStatus": {
    "pending": 5,
    "pass": 140,
    "fail": 3,
    "miss": 2
  },
  "byStorageProvider": {
    "local": 145,
    "s3": 5,
    "gcs": 0
  },
  "pendingVerification": 5,
  "failedVerification": 3
}
```

---

#### Get Pending Artifacts

Get artifacts awaiting verification.

```http
GET /artifacts/pending
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 50) |

**Response:** `200 OK`
```json
{
  "artifacts": [...],
  "count": 5
}
```

---

#### Get Failed Artifacts

Get artifacts that failed verification.

```http
GET /artifacts/failed
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 50) |

**Response:** `200 OK`
```json
{
  "artifacts": [...],
  "count": 3
}
```

---

#### Get Single Artifact

Get artifact by ID.

```http
GET /artifacts/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "artifact": {
    "id": 1,
    "docId": "abc123",
    "kind": "pdf",
    "hash": "sha256:a1b2c3...",
    "path": "storage/exports/doc-abc123/2025-12-30.pdf",
    "storageProvider": "local",
    "storageKey": "exports/doc-abc123/2025-12-30.pdf",
    "verifiedAt": 1735560000000,
    "verificationStatus": "pass",
    "meta": {},
    "ts": 1735559000000
  }
}
```

**Errors:**
- `400` - Invalid artifact ID
- `404` - Artifact not found

---

#### Delete Artifact

Delete an artifact record.

```http
DELETE /artifacts/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "deleted": true,
  "id": 1
}
```

**Errors:**
- `400` - Invalid artifact ID
- `404` - Artifact not found

---

#### Trigger Artifact Verification

Queue an artifact for verification.

```http
POST /artifacts/:id/verify
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "status": "queued",
  "message": "Artifact queued for verification"
}
```

**Errors:**
- `400` - Invalid artifact ID
- `404` - Artifact not found

---

#### Get Document Artifacts

Get all artifacts for a specific document.

```http
GET /docs/:docId/artifacts
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "docId": "abc123",
  "artifacts": [...],
  "count": 5
}
```

---

#### List Jobs

Get jobs with optional filters.

```http
GET /jobs
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by job type (verify:export, knowledge:index, etc.) |
| `status` | string | Filter by status (pending, processing, completed, failed, cancelled) |
| `docId` | string | Filter by document ID |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset (default: 0) |

**Response:** `200 OK`
```json
{
  "jobs": [
    {
      "id": "job_abc123",
      "type": "verify:export",
      "docId": "doc123",
      "userId": "user:local",
      "payload": { "artifactId": 1, "hash": "sha256:..." },
      "status": "completed",
      "priority": 0,
      "attempts": 1,
      "maxAttempts": 3,
      "createdAt": 1735559000000,
      "startedAt": 1735559001000,
      "completedAt": 1735559005000,
      "error": null,
      "result": { "status": "pass" }
    }
  ],
  "count": 1,
  "limit": 50,
  "offset": 0
}
```

---

#### Get Job Statistics

Get queue statistics.

```http
GET /jobs/stats
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "stats": {
    "pending": 5,
    "processing": 2,
    "completed": 150,
    "failed": 3,
    "cancelled": 1
  },
  "total": 161
}
```

---

#### Get Single Job

Get job by ID.

```http
GET /jobs/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "job": {
    "id": "job_abc123",
    "type": "verify:export",
    "docId": "doc123",
    "userId": "user:local",
    "payload": { "artifactId": 1, "hash": "sha256:..." },
    "status": "completed",
    "priority": 0,
    "attempts": 1,
    "maxAttempts": 3,
    "createdAt": 1735559000000,
    "startedAt": 1735559001000,
    "completedAt": 1735559005000,
    "error": null,
    "result": { "status": "pass" }
  }
}
```

**Errors:**
- `404` - Job not found

---

#### Create Job

Create a new background job.

```http
POST /jobs
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "verify:export",
  "docId": "abc123",
  "payload": {
    "artifactId": 1
  },
  "options": {
    "priority": 10,
    "maxAttempts": 3,
    "delay": 5000
  }
}
```

**Job Types:**
- `verify:export` - Verify export artifact hash
- `verify:compose` - Verify compose action determinism
- `reminder:extraction` - Process extraction action reminder
- `knowledge:index` - Index workspace knowledge graph
- `notification:deliver` - Deliver notification to external channels (webhook, Slack)

**Response:** `201 Created`
```json
{
  "job": {
    "id": "job_xyz789",
    "type": "verify:export",
    "docId": "abc123",
    "status": "pending",
    ...
  }
}
```

**Errors:**
- `400` - Job type or payload required

---

#### Cancel Job

Cancel a pending job.

```http
DELETE /jobs/:id
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "cancelled": true,
  "id": "job_abc123"
}
```

**Errors:**
- `400` - Job cannot be cancelled (not pending)
- `404` - Job not found

---

#### Retry Job

Retry a failed job.

```http
POST /jobs/:id/retry
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "retried": true,
  "id": "job_abc123"
}
```

**Errors:**
- `400` - Job cannot be retried (not failed)
- `404` - Job not found

---

#### Get Document Jobs

Get all jobs for a specific document.

```http
GET /docs/:docId/jobs
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "docId": "abc123",
  "jobs": [...],
  "count": 10
}
```

---

#### Cleanup Old Jobs

Delete old completed/failed/cancelled jobs.

```http
POST /jobs/cleanup
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "olderThanDays": 7
}
```

**Response:** `200 OK`
```json
{
  "deleted": 50,
  "olderThanDays": 7
}
```

---

### AI Provider Endpoints

#### Get Available Providers

Get list of available AI providers and models.

```http
GET /ai/providers
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "providers": [
    {
      "provider": "anthropic",
      "models": [
        "claude-sonnet-4-5-20250929",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229"
      ],
      "defaultModel": "claude-sonnet-4-5-20250929"
    },
    {
      "provider": "openai",
      "models": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo"
      ],
      "defaultModel": "gpt-4o-mini"
    },
    {
      "provider": "ollama",
      "models": [
        "llama2",
        "mistral",
        "codellama"
      ],
      "defaultModel": null
    },
    {
      "provider": "dev",
      "models": ["stub"],
      "defaultModel": "stub"
    }
  ],
  "defaults": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929"
  }
}
```

---

### Platform Config Endpoint (Slice M3)

Public endpoint returning platform configuration: enabled products, version, and feature flags.

---

#### Get Platform Config

```http
GET /config
```

**Authentication:** None required (public endpoint)

**Response:**

```json
{
  "products": ["docs", "design-studio"],
  "version": "0.1.0",
  "features": {
    "docs": { "enabled": true },
    "designStudio": { "enabled": true },
    "memoryGraph": { "enabled": true }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `products` | `string[]` | List of enabled product identifiers |
| `version` | `string` | Platform version from package.json |
| `features.docs.enabled` | `boolean` | Whether Kacheri Docs product is enabled |
| `features.designStudio.enabled` | `boolean` | Whether Beyle Design Studio product is enabled |
| `features.memoryGraph.enabled` | `boolean` | Whether cross-product Memory Graph is enabled |

**Notes:**
- Products are controlled by `ENABLED_PRODUCTS` env var (default: `docs,design-studio`)
- Memory Graph is controlled by `MEMORY_GRAPH_ENABLED` env var (default: `true`)
- Disabled products return 404 from their routes (not just hidden in UI)
- Frontend uses this endpoint to discover available features at runtime

---

### Observability Endpoints (Phase 5 - P5)

#### Health Check

Get comprehensive health status including all dependency checks.

```http
GET /health
```

**Response:** `200 OK` (healthy), `503 Service Unavailable` (unhealthy)
```json
{
  "status": "healthy",
  "timestamp": "2025-12-30T12:00:00.000Z",
  "version": "0.1.0",
  "uptime": 3600,
  "topology": {
    "mode": "cloud",
    "database": "postgresql"
  },
  "checks": {
    "database": {
      "status": "up",
      "latency": 5
    },
    "storage": {
      "status": "up",
      "latency": 10
    }
  }
}
```

**Response Fields (S16: topology added):**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Overall status: `healthy`, `degraded`, or `unhealthy` |
| `timestamp` | `string` | ISO 8601 timestamp |
| `version` | `string` | Service version from package.json |
| `uptime` | `number` | Service uptime in seconds |
| `topology.mode` | `string` | Deployment: `"cloud"` (PostgreSQL) or `"local"` (SQLite) |
| `topology.database` | `string` | Active driver: `"postgresql"` or `"sqlite"` |
| `checks.database.status` | `string` | `"up"` or `"down"` |
| `checks.database.latency` | `number` | Query latency ms (present when up) |
| `checks.storage.status` | `string` | `"up"` or `"down"` |
| `checks.storage.latency` | `number` | Check latency ms (present when up) |

**Status Values:**
- `healthy` - All dependencies are available
- `degraded` - Some dependencies are unavailable but service is functional
- `unhealthy` - Critical dependencies are unavailable

**Topology Notes (S16):**
- `topology.mode = "cloud"` when `DATABASE_URL` starts with `postgres://`
- `topology.mode = "local"` when using SQLite (default dev mode)

---

#### Kubernetes Readiness Probe

Check if the service is ready to accept traffic.

```http
GET /health/ready
```

**Response:** `200 OK` (ready), `503 Service Unavailable` (not ready)
```json
{
  "ready": true
}
```

---

#### Kubernetes Liveness Probe

Check if the service is alive and running.

```http
GET /health/live
```

**Response:** `200 OK` (alive), `503 Service Unavailable` (dead)
```json
{
  "alive": true
}
```

---

#### Prometheus Metrics

Get application metrics in Prometheus format.

```http
GET /metrics
```

**Response:** `200 OK`
```
# HELP kacheri_http_requests_total Total number of HTTP requests
# TYPE kacheri_http_requests_total counter
kacheri_http_requests_total{method="GET",route="/docs",status_code="200"} 42

# HELP kacheri_http_request_duration_seconds HTTP request duration in seconds
# TYPE kacheri_http_request_duration_seconds histogram
kacheri_http_request_duration_seconds_bucket{method="GET",route="/docs",le="0.01"} 10
...

# HELP kacheri_documents_total Total number of documents
# TYPE kacheri_documents_total gauge
kacheri_documents_total 150

# HELP kacheri_proofs_total Total number of proofs
# TYPE kacheri_proofs_total gauge
kacheri_proofs_total 500
```

**Available Metrics:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `kacheri_http_requests_total` | Counter | method, route, status_code | Total HTTP requests |
| `kacheri_http_request_duration_seconds` | Histogram | method, route | HTTP request latency |
| `kacheri_ai_requests_total` | Counter | action, provider, status | AI operation requests |
| `kacheri_ai_request_duration_seconds` | Histogram | action, provider | AI operation latency |
| `kacheri_export_requests_total` | Counter | kind, status | Export requests |
| `kacheri_verification_runs_total` | Counter | status | Verification runs |
| `kacheri_active_websocket_connections` | Gauge | - | Active WebSocket connections |
| `kacheri_documents_total` | Gauge | - | Total documents |
| `kacheri_proofs_total` | Gauge | - | Total proofs |
| `kacheri_jobs_total` | Gauge | status | Jobs by status |

See `monitoring/docs/METRICS.md` for complete metrics documentation.

---

### Negotiation Sessions & Rounds Endpoints (Slice 6)

Manage redline/negotiation workflows: create sessions for a document, import counterparty documents as rounds, track changes detected by the redline comparator, and manage session lifecycle (draft → active → reviewing → settled/abandoned).

---

#### Create Negotiation Session

Create a new negotiation session for a document.

```http
POST /docs/:id/negotiations
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Acme Corp — SaaS Agreement Negotiation",
  "counterpartyName": "Acme Corp",
  "counterpartyLabel": "Acme Legal Team"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Human-readable session title |
| `counterpartyName` | string | Yes | Name of the counterparty organization |
| `counterpartyLabel` | string | No | Optional label for the counterparty (e.g., "Acme Legal Team") |

**Response:** `201 Created`
```json
{
  "id": "neg_abc123",
  "docId": "doc-001",
  "workspaceId": "ws-001",
  "title": "Acme Corp — SaaS Agreement Negotiation",
  "counterpartyName": "Acme Corp",
  "counterpartyLabel": "Acme Legal Team",
  "status": "draft",
  "currentRound": 0,
  "totalChanges": 0,
  "pendingChanges": 0,
  "acceptedChanges": 0,
  "rejectedChanges": 0,
  "startedBy": "user:local",
  "settledAt": null,
  "createdAt": "2026-02-09T10:00:00.000Z",
  "updatedAt": "2026-02-09T10:00:00.000Z"
}
```

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `title_required` | Title missing or empty |
| 400 | `counterparty_name_required` | Counterparty name missing or empty |
| 400 | `workspace_required` | Missing `x-workspace-id` header |
| 403 | Forbidden | User lacks editor+ access to the document |
| 404 | `doc_not_found` | Document does not exist |

---

#### List Negotiation Sessions

List all negotiation sessions for a document.

```http
GET /docs/:id/negotiations
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "docId": "doc-001",
  "sessions": [ /* array of NegotiationSession objects */ ],
  "total": 2
}
```

**Errors:**
| Code | Error | When |
|------|-------|------|
| 403 | Forbidden | User lacks viewer+ access |
| 404 | `doc_not_found` | Document does not exist |

---

#### Get Session Detail

Get session detail with rounds summary (snapshot HTML/text stripped) and change status counts.

```http
GET /negotiations/:nid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "session": { /* NegotiationSession object */ },
  "rounds": [
    {
      "id": "rnd_abc123",
      "sessionId": "neg_abc123",
      "roundNumber": 1,
      "roundType": "initial_proposal",
      "proposedBy": "internal",
      "proposerLabel": null,
      "snapshotHash": "sha256hex...",
      "changeCount": 0,
      "versionId": "42",
      "importSource": "manual",
      "notes": null,
      "createdBy": "user:local",
      "createdAt": "2026-02-09T10:05:00.000Z",
      "updatedAt": "2026-02-09T10:05:00.000Z"
    }
  ],
  "changeSummary": {
    "pending": 5,
    "accepted": 2,
    "rejected": 1,
    "countered": 0
  },
  "positionDriftWarning": false
}
```

> **Note:** Round objects in this response **omit** `snapshotHtml` and `snapshotText` to keep payloads small. Use the round detail endpoint to get full snapshots.
>
> **`positionDriftWarning`** (boolean): Set to `true` when the document has been modified after the latest negotiation round was created, meaning change positions may be stale. Always present in the response.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_required` | Missing `x-workspace-id` header |
| 403 | `forbidden` | Session belongs to a different workspace |
| 404 | `session_not_found` | Session does not exist |

---

#### Update Session

Update session title, counterparty info, or status. Validates status transitions.

```http
PATCH /negotiations/:nid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body (all fields optional):**
```json
{
  "title": "Updated Title",
  "counterpartyName": "New Corp",
  "counterpartyLabel": "New Legal",
  "status": "active"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Updated session title |
| `counterpartyName` | string | No | Updated counterparty name |
| `counterpartyLabel` | string \| null | No | Updated counterparty label (null to clear) |
| `status` | string | No | New status: `draft`, `active`, `awaiting_response`, `reviewing`, `settled`, `abandoned` |

**Status Transition Rules:**
- Cannot change status **from** terminal states (`settled`, `abandoned`)
- Cannot go directly from `draft` to `settled` (must have rounds first)

**Response:** `200 OK` — Returns the updated `NegotiationSession` object.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `invalid_status` | Status value is not a valid NegotiationStatus |
| 400 | `invalid_title` | Title is empty string |
| 400 | `invalid_counterparty_name` | Counterparty name is empty string |
| 409 | `session_terminal` | Session is in `settled` or `abandoned` status |
| 409 | `cannot_settle_draft` | Attempting to set draft session to settled |

---

#### Delete Session

Delete a negotiation session and all associated rounds, changes, and counterproposals (CASCADE). **Admin only.**

```http
DELETE /negotiations/:nid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `204 No Content`

**Errors:**
| Code | Error | When |
|------|-------|------|
| 403 | `admin_required` | User is not a workspace admin |
| 403 | `forbidden` | Session belongs to a different workspace |
| 404 | `session_not_found` | Session does not exist |

---

#### Create Round (Manual)

Create a new negotiation round with HTML content (e.g., from the editor or pasted content). Runs the full round import pipeline: redline comparison, change detection, version snapshot, session count updates.

```http
POST /negotiations/:nid/rounds
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "html": "<p>Updated clause text...</p>",
  "text": "Optional plain text override",
  "proposedBy": "internal",
  "proposerLabel": "John Smith",
  "importSource": "editor",
  "notes": "Minor revisions to indemnity clause"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `html` | string | Yes | HTML content of the round |
| `text` | string | No | Plain text override. If omitted, extracted from HTML. |
| `proposedBy` | string | Yes | `"internal"` or `"external"` |
| `proposerLabel` | string | No | Human-readable proposer name |
| `importSource` | string | No | Source tag (default: `"manual"`) |
| `notes` | string | No | Round-level notes |

**Response:** `201 Created`
```json
{
  "round": {
    "id": "rnd_xyz789",
    "sessionId": "neg_abc123",
    "roundNumber": 2,
    "roundType": "counterproposal",
    "proposedBy": "external",
    "proposerLabel": "Acme Legal",
    "snapshotHash": "sha256hex...",
    "changeCount": 5,
    "versionId": "43",
    "importSource": "manual",
    "notes": null,
    "createdBy": "user:local",
    "createdAt": "2026-02-09T11:00:00.000Z",
    "updatedAt": "2026-02-09T11:00:00.000Z"
  },
  "changeCount": 5,
  "session": { /* updated NegotiationSession */ }
}
```

> **Note:** The `round` object in the response **omits** `snapshotHtml` and `snapshotText`.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `html_required` | HTML content missing or empty |
| 400 | `invalid_proposed_by` | proposedBy is not "internal" or "external" |
| 409 | `session_terminal` | Session is in settled/abandoned status |
| 500 | `round_creation_failed` | Import pipeline error |

---

#### Import Round (File Upload)

Import an external document (DOCX or PDF) as a new negotiation round. The file is converted to HTML, then processed through the round import pipeline. Always sets `proposedBy: "external"`.

```http
POST /negotiations/:nid/rounds/import?proposerLabel=Acme+Legal&notes=Counter+draft
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: multipart/form-data
```

**Multipart Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | DOCX or PDF file (max 50 MB) |

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `proposerLabel` | string | No | Human-readable proposer name |
| `notes` | string | No | Round-level notes |

**Response:** `201 Created`
```json
{
  "round": { /* round summary (no snapshotHtml/snapshotText) */ },
  "changeCount": 8,
  "session": { /* updated NegotiationSession */ },
  "import": {
    "filename": "counterdraft-v2.docx",
    "format": "docx",
    "bytes": 45231
  }
}
```

**WebSocket Events:** Broadcasts `ai_job` events with `kind: "negotiation_import"` during processing (`started` → `finished`/`failed`), followed by a `negotiation` event with `action: "round_imported"`.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `file_required` | No file uploaded |
| 400 | `unsupported_format` | File is not DOCX or PDF |
| 400 | `conversion_failed` | DOCX/PDF conversion error (including 30s timeout) |
| 400 | `no_content` | Extracted text is empty |
| 409 | `session_terminal` | Session is in settled/abandoned status |
| 413 | `file_too_large` | File exceeds 50 MB limit |
| 500 | `converter_unavailable` | mammoth or pdf-parse not installed |
| 500 | `round_import_failed` | Import pipeline error |

---

#### List Rounds

List all rounds for a negotiation session (without snapshot HTML/text).

```http
GET /negotiations/:nid/rounds
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "sessionId": "neg_abc123",
  "rounds": [ /* array of round summaries (no snapshotHtml/snapshotText) */ ],
  "total": 3
}
```

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_required` | Missing `x-workspace-id` header |
| 403 | `forbidden` | Session belongs to a different workspace |
| 404 | `session_not_found` | Session does not exist |

---

#### Get Round Detail

Get full round detail including snapshot HTML and text, plus change summary.

```http
GET /negotiations/:nid/rounds/:rid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "round": {
    "id": "rnd_xyz789",
    "sessionId": "neg_abc123",
    "roundNumber": 2,
    "roundType": "counterproposal",
    "proposedBy": "external",
    "proposerLabel": "Acme Legal",
    "snapshotHtml": "<p>Full HTML content...</p>",
    "snapshotText": "Full plain text content...",
    "snapshotHash": "sha256hex...",
    "changeCount": 5,
    "versionId": "43",
    "importSource": "upload:docx",
    "notes": null,
    "createdBy": "user:local",
    "createdAt": "2026-02-09T11:00:00.000Z",
    "updatedAt": "2026-02-09T11:00:00.000Z"
  },
  "changeCount": 5,
  "changeSummary": {
    "pending": 3,
    "accepted": 1,
    "rejected": 1,
    "countered": 0
  }
}
```

> **Note:** This is the **only** round endpoint that returns `snapshotHtml` and `snapshotText`.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_required` | Missing `x-workspace-id` header |
| 403 | `forbidden` | Session belongs to a different workspace |
| 404 | `session_not_found` | Session does not exist |
| 404 | `round_not_found` | Round does not exist or does not belong to this session |

---

### Negotiation Changes & Analysis Endpoints (Slice 7)

Manage individual negotiation changes: review, accept/reject, AI-powered analysis, counterproposal generation, bulk operations, and session summary. All AI endpoints create proof records and are rate-limited.

---

#### List Changes

List all changes for a negotiation session with optional filters.

```http
GET /negotiations/:nid/changes?roundId=&status=&category=&riskLevel=&limit=&offset=
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `roundId` | string | No | Filter by specific round |
| `status` | string | No | Filter by status: `pending`, `accepted`, `rejected`, `countered` |
| `category` | string | No | Filter by category: `substantive`, `editorial`, `structural` |
| `riskLevel` | string | No | Filter by risk: `low`, `medium`, `high`, `critical` |
| `limit` | number | No | Max results to return (default 50, max 200) |
| `offset` | number | No | Skip first N results (default 0) |

**Response:** `200 OK`
```json
{
  "sessionId": "neg_abc123",
  "changes": [
    {
      "id": "chg_001",
      "sessionId": "neg_abc123",
      "roundId": "rnd_xyz789",
      "changeType": "replace",
      "category": "substantive",
      "sectionHeading": "Indemnification",
      "originalText": "liability cap of $1,000,000",
      "proposedText": "liability cap of $500,000",
      "fromPos": 1234,
      "toPos": 1260,
      "status": "pending",
      "suggestionId": null,
      "riskLevel": "high",
      "aiAnalysis": null,
      "resolvedBy": null,
      "resolvedAt": null,
      "createdAt": "2026-02-09T11:00:00.000Z",
      "updatedAt": "2026-02-09T11:00:00.000Z"
    }
  ],
  "total": 15,
  "limit": 50,
  "offset": 0,
  "filters": {
    "roundId": null,
    "status": null,
    "category": null,
    "riskLevel": null
  }
}
```

> **Pagination:** `total` reflects the full filtered count (not the page size). `limit` and `offset` are echoed back in the response. Default limit is 50, max 200.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_required` | Missing `x-workspace-id` header |
| 404 | `session_not_found` | Session does not exist |
| 404 | `round_not_found` | Round filter specified but round not found or doesn't belong to session |

---

#### Get Change Detail

Get a single change with full AI analysis.

```http
GET /negotiations/:nid/changes/:cid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "change": {
    "id": "chg_001",
    "sessionId": "neg_abc123",
    "roundId": "rnd_xyz789",
    "changeType": "replace",
    "category": "substantive",
    "sectionHeading": "Indemnification",
    "originalText": "liability cap of $1,000,000",
    "proposedText": "liability cap of $500,000",
    "fromPos": 1234,
    "toPos": 1260,
    "status": "pending",
    "suggestionId": null,
    "riskLevel": "high",
    "aiAnalysis": {
      "category": "substantive",
      "riskLevel": "high",
      "summary": "Liability cap reduced from $1M to $500K",
      "impact": "Reduces your maximum recovery by 50%",
      "historicalContext": "Accepted similar terms in 3 of 4 past deals with this counterparty",
      "clauseComparison": "Your standard clause uses $1M cap",
      "complianceFlags": [],
      "recommendation": "counter",
      "recommendationReason": "Consider proposing $750K as a middle ground"
    },
    "resolvedBy": null,
    "resolvedAt": null,
    "createdAt": "2026-02-09T11:00:00.000Z",
    "updatedAt": "2026-02-09T11:30:00.000Z"
  }
}
```

**Errors:**
| Code | Error | When |
|------|-------|------|
| 404 | `session_not_found` | Session does not exist |
| 404 | `change_not_found` | Change does not exist or does not belong to this session |

---

#### Update Change Status

Update a change's status (accept, reject, or counter).

```http
PATCH /negotiations/:nid/changes/:cid
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "accepted"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | New status: `pending`, `accepted`, `rejected`, `countered` |

**Response:** `200 OK`
```json
{
  "change": { /* updated NegotiationChange */ },
  "session": { /* updated NegotiationSession with recalculated counts */ }
}
```

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `invalid_status` | Status value is not valid |
| 404 | `change_not_found` | Change does not exist or does not belong to this session |
| 409 | `session_terminal` | Session is in settled/abandoned status |

---

#### Analyze Single Change

Trigger AI deep-dive analysis for a specific change. Gathers context from knowledge graph, clause library, and compliance policies.

```http
POST /negotiations/:nid/changes/:cid/analyze
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Rate Limit:** 10 requests per hour (same as AI compose)

**Response:** `200 OK`
```json
{
  "change": { /* refreshed NegotiationChange with analysis stored */ },
  "analysis": {
    "category": "substantive",
    "riskLevel": "high",
    "summary": "Liability cap reduced from $1M to $500K",
    "impact": "Reduces your maximum recovery by 50%",
    "historicalContext": "Accepted similar terms in 3 of 4 past deals",
    "clauseComparison": "Your standard clause uses $1M cap",
    "complianceFlags": [],
    "recommendation": "counter",
    "recommendationReason": "Historical precedent suggests $750K"
  },
  "fromCache": false,
  "proof": {
    "id": "123",
    "hash": "sha256:abc..."
  }
}
```

> **Note:** If the change was already analyzed, `fromCache: true` and no new proof record is created.

**WebSocket Events:** Broadcasts `ai_job` events with `kind: "negotiation_analyze"` (`started` → `finished`/`failed`).

**Errors:**
| Code | Error | When |
|------|-------|------|
| 404 | `change_not_found` | Change does not exist or does not belong to session |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | `analysis_failed` | AI analysis engine error |

---

#### Batch Analyze Round

Analyze all changes in a round. Groups changes to minimize AI calls (max 10 per batch, 30s timeout). Substantive/structural changes analyzed individually; editorial changes grouped.

```http
POST /negotiations/:nid/rounds/:rid/analyze
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Rate Limit:** 10 requests per hour

**Response:** `200 OK`
```json
{
  "analyzed": 18,
  "failed": 2,
  "skipped": 5,
  "durationMs": 12500,
  "results": [
    {
      "changeId": "chg_001",
      "riskLevel": "high",
      "category": "substantive",
      "recommendation": "counter",
      "fromCache": false
    }
  ],
  "failedChangeIds": ["chg_003", "chg_007"],
  "proof": {
    "id": "124",
    "hash": "sha256:def..."
  }
}
```

> **Note:** `failedChangeIds` lists the IDs of changes that could not be analyzed (AI failure or timeout). When `failed > 0`, use this array to identify which changes need manual review or retry via the single-analysis endpoint.

**WebSocket Events:** Broadcasts `ai_job` events (`started` → `finished`/`failed`) and `negotiation` event with `action: "changes_analyzed"`.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 404 | `round_not_found` | Round does not exist or does not belong to session |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | `batch_analysis_failed` | Batch analysis engine error |

---

#### Generate Counterproposal

Generate AI compromise language for a specific change.

```http
POST /negotiations/:nid/changes/:cid/counterproposal
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
Content-Type: application/json
```

**Rate Limit:** 10 requests per hour

**Request Body:**
```json
{
  "mode": "balanced"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | Yes | Generation mode: `balanced`, `favorable`, `minimal_change` |

**Mode Descriptions:**
- `balanced` — Fair compromise, roughly equal concessions from both parties
- `favorable` — Leans toward user's original position, minimal concessions
- `minimal_change` — Smallest modification to counterparty's text that preserves key terms

**Response:** `201 Created`
```json
{
  "counterproposal": {
    "id": "cp_abc123",
    "changeId": "chg_001",
    "mode": "balanced",
    "proposedText": "liability cap of $750,000",
    "rationale": "Splits the difference between the $1M original and $500K proposed...\n\nYou concede: Reducing cap from $1M\nThey concede: Increasing from $500K\nPreserved: Liability cap concept\n\nMode: balanced",
    "clauseId": "cls_xyz",
    "proofId": null,
    "accepted": false,
    "createdBy": "user:local",
    "createdAt": "2026-02-09T12:00:00.000Z"
  },
  "clauseMatch": {
    "clauseId": "cls_xyz",
    "title": "Standard Indemnification Clause",
    "similarity": 85
  },
  "proof": {
    "id": "125",
    "hash": "sha256:ghi..."
  }
}
```

**WebSocket Events:** Broadcasts `ai_job` events with `kind: "negotiation_counterproposal"` (`started` → `finished`/`failed`).

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `invalid_mode` | Mode is missing or not one of the valid values |
| 404 | `change_not_found` | Change does not exist or does not belong to session |
| 409 | `session_terminal` | Session is in settled/abandoned status |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | `counterproposal_failed` | AI generation error |

---

#### List Counterproposals

List all AI-generated counterproposals for a specific change.

```http
GET /negotiations/:nid/changes/:cid/counterproposals
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "changeId": "chg_001",
  "counterproposals": [
    {
      "id": "cp_abc123",
      "changeId": "chg_001",
      "mode": "balanced",
      "proposedText": "liability cap of $750,000",
      "rationale": "...",
      "clauseId": "cls_xyz",
      "proofId": null,
      "accepted": false,
      "createdBy": "user:local",
      "createdAt": "2026-02-09T12:00:00.000Z"
    }
  ],
  "total": 1
}
```

**Errors:**
| Code | Error | When |
|------|-------|------|
| 404 | `change_not_found` | Change does not exist or does not belong to session |

---

#### Accept All Changes

Accept all pending changes in a negotiation session.

```http
POST /negotiations/:nid/changes/accept-all
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "accepted": 12,
  "session": { /* updated NegotiationSession with recalculated counts */ }
}
```

**Errors:**
| Code | Error | When |
|------|-------|------|
| 409 | `session_terminal` | Session is in settled/abandoned status |

---

#### Reject All Changes

Reject all pending changes in a negotiation session.

```http
POST /negotiations/:nid/changes/reject-all
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "rejected": 12,
  "session": { /* updated NegotiationSession with recalculated counts */ }
}
```

**Errors:**
| Code | Error | When |
|------|-------|------|
| 409 | `session_terminal` | Session is in settled/abandoned status |

---

#### Session Summary

Get negotiation summary with stats and change distribution.

```http
GET /negotiations/:nid/summary
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "session": { /* NegotiationSession object */ },
  "stats": {
    "totalRounds": 3,
    "totalChanges": 25,
    "byStatus": {
      "pending": 5,
      "accepted": 12,
      "rejected": 6,
      "countered": 2
    },
    "byCategory": {
      "substantive": 10,
      "editorial": 12,
      "structural": 3
    },
    "byRisk": {
      "low": 8,
      "medium": 10,
      "high": 5,
      "critical": 1,
      "unassessed": 1
    },
    "acceptanceRate": 60,
    "latestRound": {
      "id": "rnd_xyz789",
      "roundNumber": 3,
      "roundType": "counterproposal",
      "proposedBy": "external",
      "changeCount": 8,
      "createdAt": "2026-02-09T14:00:00.000Z"
    }
  }
}
```

> **Note:** `acceptanceRate` is null when no changes have been resolved yet. It is calculated as `accepted / (accepted + rejected + countered) * 100`.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_required` | Missing `x-workspace-id` header |
| 404 | `session_not_found` | Session does not exist |

---

### Negotiation Settlement & History Endpoints (Slice 8)

Settlement, abandonment, workspace-level listing, and statistics for negotiation sessions.

---

#### Settle Negotiation

Settle a negotiation session. Validates all changes are resolved, creates a final version snapshot, converts accepted changes to suggestions (for the existing track changes UI), and marks the session as settled.

```http
POST /negotiations/:nid/settle
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Preconditions:**
- Session must not be in a terminal state (`settled` or `abandoned`)
- Session must have at least one round
- All changes must be resolved (no `pending` status changes)

**Settlement Pipeline:**
1. Creates a named version snapshot ("Settlement — {title}") from the latest round
2. For each accepted change, creates a `suggestion` in the existing suggestions table
3. Links each created suggestion back to the negotiation change via `suggestionId`
4. Updates session status to `settled` (auto-sets `settledAt`)
5. Creates proof record and provenance trail

**Response:** `200 OK`
```json
{
  "session": {
    "id": "neg_abc123",
    "status": "settled",
    "settledAt": "2026-02-09T15:00:00.000Z"
  },
  "settlement": {
    "versionId": 45,
    "suggestionsCreated": 12,
    "acceptedChanges": 12,
    "rejectedChanges": 5,
    "counteredChanges": 3
  },
  "proof": {
    "id": "126",
    "hash": "sha256:abc..."
  }
}
```

> **Note:** The `session` field returns the full `NegotiationSession` object. The `suggestionsCreated` count may be less than `acceptedChanges` if some suggestion creations fail (non-fatal).

**WebSocket Events:** Broadcasts `negotiation` event with `action: "settled"`.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_required` | Missing `x-workspace-id` header |
| 403 | Forbidden | User lacks editor+ access |
| 404 | `session_not_found` | Session does not exist |
| 409 | `session_terminal` | Session is already settled or abandoned |
| 409 | `no_rounds` | Session has no rounds |
| 409 | `unresolved_changes` | Pending changes remain (includes `pendingCount` in response) |

---

#### Abandon Negotiation

Abandon a negotiation session. Preserves all rounds, changes, and counterproposals for audit purposes. No document modifications are made.

```http
POST /negotiations/:nid/abandon
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "session": {
    "id": "neg_abc123",
    "status": "abandoned"
  }
}
```

> **Note:** Returns the full `NegotiationSession` object with updated status.

**WebSocket Events:** Broadcasts `negotiation` event with `action: "abandoned"`.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_required` | Missing `x-workspace-id` header |
| 403 | Forbidden | User lacks editor+ access |
| 404 | `session_not_found` | Session does not exist |
| 409 | `session_terminal` | Session is already settled or abandoned |

---

#### List Workspace Negotiations

List all negotiation sessions in a workspace with optional filters.

```http
GET /workspaces/:wid/negotiations?status=&counterparty=&limit=&offset=
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | No | Filter by status: `draft`, `active`, `awaiting_response`, `reviewing`, `settled`, `abandoned` |
| `counterparty` | string | No | Search by counterparty name or session title (partial match) |
| `limit` | number | No | Max results to return |
| `offset` | number | No | Skip first N results (requires limit) |

**Response:** `200 OK`
```json
{
  "workspaceId": "ws-001",
  "negotiations": [
    {
      "id": "neg_abc123",
      "docId": "doc-001",
      "workspaceId": "ws-001",
      "title": "Acme Corp — SaaS Agreement Negotiation",
      "counterpartyName": "Acme Corp",
      "counterpartyLabel": "Acme Legal Team",
      "status": "reviewing",
      "currentRound": 3,
      "totalChanges": 25,
      "acceptedChanges": 12,
      "rejectedChanges": 5,
      "pendingChanges": 8,
      "startedBy": "user:local",
      "settledAt": null,
      "createdAt": "2026-02-09T10:00:00.000Z",
      "updatedAt": "2026-02-09T14:00:00.000Z",
      "docTitle": "SaaS Agreement v2"
    }
  ],
  "total": 15,
  "filters": {
    "status": null,
    "counterparty": null
  }
}
```

> **Note:** Each negotiation is enriched with `docTitle` from the linked document. If the document has been deleted, `docTitle` will be `"(deleted document)"`.

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_mismatch` | `x-workspace-id` header does not match URL parameter |

---

#### Workspace Negotiation Statistics

Get aggregate statistics for all negotiations in a workspace.

```http
GET /workspaces/:wid/negotiations/stats
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Response:** `200 OK`
```json
{
  "workspaceId": "ws-001",
  "stats": {
    "total": 15,
    "active": 3,
    "settledThisMonth": 5,
    "averageRounds": 3.2,
    "overallAcceptanceRate": 68,
    "byStatus": {
      "draft": 1,
      "active": 2,
      "awaiting_response": 1,
      "reviewing": 0,
      "settled": 8,
      "abandoned": 3
    }
  }
}
```

**Stats Definitions:**
- `total` — Total negotiation sessions in the workspace
- `active` — Sessions not in terminal state (i.e., not settled or abandoned)
- `settledThisMonth` — Sessions settled since the first day of the current month
- `averageRounds` — Average `currentRound` across settled sessions (null if no settled sessions)
- `overallAcceptanceRate` — `SUM(acceptedChanges) / SUM(totalChanges) * 100` across all sessions with changes (null if no changes)
- `byStatus` — Count of sessions per status value

**Errors:**
| Code | Error | When |
|------|-------|------|
| 400 | `workspace_mismatch` | `x-workspace-id` header does not match URL parameter |

---

### Document Attachment Endpoints (Slice 4)

Document attachments allow files (PDFs, images, office documents) to be associated with a document for reference viewing.

**Limits (configurable via environment variables):**
| Limit | Default | Env Variable |
|-------|---------|--------------|
| Max attachments per doc | 20 | `KACHERI_MAX_ATTACHMENTS_PER_DOC` |
| Max total size per doc | 100 MB | `KACHERI_MAX_ATTACHMENT_SIZE_PER_DOC` |
| Max single file size | 25 MB | `KACHERI_MAX_ATTACHMENT_FILE_SIZE` |
| Max total per workspace | 1 GB | `KACHERI_MAX_ATTACHMENT_SIZE_PER_WORKSPACE` |

**Allowed MIME types:** `application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX), `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX), `application/vnd.openxmlformats-officedocument.presentationml.presentation` (PPTX)

#### Upload Attachment

Upload a file attachment to a document.

```http
POST /docs/:id/attachments
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>

Field: file (binary)
```

**Auth:** `editor+` on document

**Response:** `201 Created`
```json
{
  "attachment": {
    "id": "abc123def456",
    "docId": "doc-xyz",
    "filename": "reference-contract.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 245678,
    "sha256": "a1b2c3d4e5f6...",
    "uploadedBy": "user_123",
    "uploadedAt": 1708300800000,
    "metadata": null
  },
  "proof": {
    "id": "doc-xyz",
    "hash": "sha256:a1b2c3d4e5f6..."
  }
}
```

**Errors:**
- `400` - No file uploaded, invalid MIME type
- `403` - Requires editor role on document
- `413` - File too large, per-doc attachment limit reached, or workspace limit reached

**Side effects:** Proof recorded (`attachment:upload`), provenance entry, audit log, WebSocket `attachment` broadcast

---

#### List Attachments

List all non-deleted attachments for a document.

```http
GET /docs/:id/attachments
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Auth:** `viewer+` on document

**Response:** `200 OK`
```json
{
  "attachments": [
    {
      "id": "abc123def456",
      "docId": "doc-xyz",
      "filename": "reference-contract.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 245678,
      "sha256": "a1b2c3...",
      "uploadedBy": "user_123",
      "uploadedAt": 1708300800000,
      "metadata": null
    }
  ],
  "totalSize": 245678,
  "count": 1,
  "limits": {
    "maxCount": 20,
    "maxTotalBytes": 104857600
  }
}
```

---

#### Download/View Attachment File

Serve the raw file content for inline viewing or download.

```http
GET /docs/:id/attachments/:attachmentId/file
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Auth:** `viewer+` on document

**Response:** Binary file content with headers:
- `Content-Type`: stored MIME type
- `Content-Disposition`: `inline; filename="<original_filename>"`
- `Cache-Control`: `public, max-age=31536000, immutable`

**Errors:**
- `403` - Requires viewer role on document
- `404` - Attachment not found or deleted

---

#### Delete Attachment

Soft-delete an attachment. The uploader can delete their own attachments; otherwise requires `editor+`.

```http
DELETE /docs/:id/attachments/:attachmentId
Authorization: Bearer <accessToken>
X-Workspace-Id: <workspaceId>
```

**Auth:** `editor+` on document, or uploader (with `viewer+`)

**Response:** `200 OK`
```json
{
  "deleted": true
}
```

**Errors:**
- `403` - Insufficient permissions
- `404` - Attachment not found or already deleted

**Side effects:** Proof recorded (`attachment:delete`), provenance entry, audit log, WebSocket `attachment` broadcast

---

#### Permission Model — Attachments

| Action | Required Role |
|--------|--------------|
| Upload attachment | `editor+` on doc |
| List attachments | `viewer+` on doc |
| View/download attachment | `viewer+` on doc |
| Delete attachment (own) | `viewer+` on doc (uploader only) |
| Delete attachment (others') | `editor+` on doc |

---

### Design Studio Endpoints (Slice A3)

Canvas CRUD, search, and per-canvas permission management for the Beyle Design Studio product. All routes are registered only when the `design-studio` product is enabled.

#### Canvas Permission Model

Canvas access uses a layered resolution model identical to document permissions:

1. **Explicit canvas permission** (takes precedence)
2. **Canvas `workspace_access` setting** (if set and user is workspace member)
3. **Workspace role mapping** (fallback: owner→owner, admin→editor, editor→editor, viewer→viewer)
4. **Canvas creator** (implicit owner)

| Action | Required Canvas Role |
|--------|---------------------|
| View canvas & frames | `viewer+` |
| Create canvas | workspace `editor+` |
| Update canvas | `editor+` |
| Update frame code | `editor+` |
| Delete canvas | `owner` |
| Manage permissions | `owner` |

---

#### Create Canvas

Create a new canvas in a workspace. The creator becomes the implicit owner.

```http
POST /workspaces/:wid/canvases
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "title": "Q3 Strategy Deck",
  "description": "Quarterly strategy presentation",
  "compositionMode": "deck"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Canvas title (defaults to "Untitled Canvas") |
| `description` | string | No | Canvas description |
| `compositionMode` | string | No | One of: `deck`, `page`, `notebook`, `widget` (defaults to `deck`) |

**Response:** `201 Created`

```json
{
  "id": "abc123def456",
  "title": "Q3 Strategy Deck",
  "description": "Quarterly strategy presentation",
  "workspaceId": "ws_001",
  "createdBy": "user_001",
  "compositionMode": "deck",
  "themeJson": null,
  "kclVersion": "1.0.0",
  "isLocked": false,
  "lockedBy": null,
  "lockedAt": null,
  "workspaceAccess": null,
  "createdAt": "2026-02-22T10:00:00.000Z",
  "updatedAt": "2026-02-22T10:00:00.000Z",
  "deletedAt": null
}
```

**Errors:**
- `400` — Invalid composition mode
- `401` — Authentication required
- `403` — Requires editor role or higher

---

#### List Canvases

List canvases in a workspace with pagination and sorting.

```http
GET /workspaces/:wid/canvases
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max items per page (1-200, default 50) |
| `offset` | number | Items to skip (default 0) |
| `sortBy` | string | Sort field: `updated_at`, `created_at`, `title` (default `updated_at`) |
| `sortDir` | string | Sort direction: `asc`, `desc` (default `desc`) |

**Response:** `200 OK`

```json
{
  "workspaceId": "ws_001",
  "canvases": [ ... ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role or higher

---

#### Search Canvases

Full-text search canvases by title and description via FTS5.

```http
GET /workspaces/:wid/canvases/search?q=strategy
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | **Required.** Search query |
| `limit` | number | Max results (1-200, default 50) |
| `offset` | number | Items to skip (default 0) |

**Response:** `200 OK`

```json
{
  "workspaceId": "ws_001",
  "canvases": [ ... ],
  "total": 5,
  "query": "strategy"
}
```

**Errors:**
- `400` — Missing query parameter `q`
- `401` — Authentication required
- `403` — Requires viewer role or higher

---

#### Get Canvas

Get a canvas with all its frames.

```http
GET /workspaces/:wid/canvases/:cid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`

```json
{
  "id": "abc123def456",
  "title": "Q3 Strategy Deck",
  "description": "...",
  "workspaceId": "ws_001",
  "createdBy": "user_001",
  "compositionMode": "deck",
  "themeJson": null,
  "kclVersion": "1.0.0",
  "isLocked": false,
  "lockedBy": null,
  "lockedAt": null,
  "workspaceAccess": null,
  "createdAt": "2026-02-22T10:00:00.000Z",
  "updatedAt": "2026-02-22T10:00:00.000Z",
  "deletedAt": null,
  "frames": [
    {
      "id": "frm_001",
      "canvasId": "abc123def456",
      "title": "Title Slide",
      "code": "<kcl-slide>...</kcl-slide>",
      "codeHash": "sha256:...",
      "sortOrder": 0,
      "speakerNotes": null,
      "thumbnailUrl": null,
      "durationMs": 5000,
      "transition": "fade",
      "metadata": null,
      "createdAt": "2026-02-22T10:00:00.000Z",
      "updatedAt": "2026-02-22T10:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `401` — Authentication required
- `403` — Access denied (requires viewer role or higher on canvas)
- `404` — Canvas not found

---

#### Update Canvas

Update canvas metadata. Only provided fields are modified.

```http
PATCH /workspaces/:wid/canvases/:cid
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "title": "Updated Title",
  "description": "New description",
  "compositionMode": "page",
  "themeJson": { "primaryColor": "#1a73e8" },
  "kclVersion": "1.0.0"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | New title |
| `description` | string\|null | No | New description (null to clear) |
| `compositionMode` | string | No | New composition mode |
| `themeJson` | object\|null | No | Theme configuration (null to clear) |
| `kclVersion` | string | No | KCL version pin |

**Response:** `200 OK` — Returns the updated canvas object.

**Errors:**
- `400` — Invalid composition mode or no valid fields to update
- `401` — Authentication required
- `403` — Requires editor role or higher on canvas
- `404` — Canvas not found

---

#### Delete Canvas

Soft-delete a canvas (can be restored). Only the canvas owner can delete.

```http
DELETE /workspaces/:wid/canvases/:cid
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `401` — Authentication required
- `403` — Requires owner role on canvas
- `404` — Canvas not found

---

#### Get Frame

Get a single frame with its code.

```http
GET /canvases/:cid/frames/:fid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`

```json
{
  "id": "frm_001",
  "canvasId": "abc123def456",
  "title": "Title Slide",
  "code": "<kcl-slide>...</kcl-slide>",
  "codeHash": "sha256:...",
  "sortOrder": 0,
  "speakerNotes": null,
  "thumbnailUrl": null,
  "durationMs": 5000,
  "transition": "fade",
  "metadata": null,
  "createdAt": "2026-02-22T10:00:00.000Z",
  "updatedAt": "2026-02-22T10:00:00.000Z"
}
```

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role or higher on canvas
- `404` — Canvas or frame not found

---

#### Update Frame Code (Power Mode)

Replace a frame's HTML/CSS/JS code. The SHA256 code hash is recomputed automatically.

```http
PUT /canvases/:cid/frames/:fid/code
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "code": "<kcl-slide theme=\"dark\">...</kcl-slide>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Frame HTML/CSS/JS code |

**Response:** `200 OK` — Returns the updated frame with new `codeHash`.

**Errors:**
- `400` — Missing `code` field
- `401` — Authentication required
- `403` — Requires editor role or higher on canvas
- `404` — Canvas or frame not found
- `409` — Canvas is locked by another user

---

#### Update Frame Metadata (Speaker Notes, Title, etc.)

Partially update a frame's metadata fields (title, speaker notes, duration, transition). Does not affect the frame's code or code hash.

```http
PATCH /canvases/:cid/frames/:fid
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "speakerNotes": "<p>Mention the quarterly results here.</p>",
  "title": "Revenue Overview",
  "durationMs": 8000,
  "transition": "slide"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `speakerNotes` | string \| null | No | Rich-text HTML speaker notes |
| `title` | string | No | Frame title |
| `durationMs` | number | No | Frame display duration (ms) |
| `transition` | string | No | Transition effect name |

At least one field must be provided. Unspecified fields are left unchanged.

**Response:** `200 OK` — Returns the updated `CanvasFrame` object.

**Errors:**
- `400` — No valid update fields provided
- `401` — Authentication required
- `403` — Requires editor role or higher on canvas
- `404` — Canvas or frame not found

---

#### Set Canvas Permission

Grant or update a per-canvas permission override for a user. If the user already has a permission on this canvas, it is updated to the new role.

```http
POST /canvases/:cid/permissions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "userId": "user_002",
  "role": "editor"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | Target user ID |
| `role` | string | Yes | One of: `owner`, `editor`, `viewer` |

**Response:** `200 OK`

```json
{
  "canvasId": "abc123def456",
  "userId": "user_002",
  "role": "editor",
  "grantedBy": "user_001",
  "grantedAt": "2026-02-22T10:00:00.000Z"
}
```

**Errors:**
- `400` — Missing `userId` or invalid `role`
- `401` — Authentication required
- `403` — Requires owner role on canvas
- `404` — Canvas not found

---

#### List Canvas Permissions

List all per-canvas permission overrides.

```http
GET /canvases/:cid/permissions
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`

```json
{
  "canvasId": "abc123def456",
  "permissions": [
    {
      "canvasId": "abc123def456",
      "userId": "user_002",
      "role": "editor",
      "grantedBy": "user_001",
      "grantedAt": "2026-02-22T10:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `401` — Authentication required
- `403` — Requires owner role on canvas
- `404` — Canvas not found

---

#### Revoke Canvas Permission

Remove a per-canvas permission override for a user.

```http
DELETE /canvases/:cid/permissions/:userId
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `401` — Authentication required
- `403` — Requires owner role on canvas
- `404` — Canvas or permission not found

---

### KCL Serving Endpoints (Slice A6)

Versioned KCL (Kacheri Component Library) bundle assets served to sandboxed iframes that render Design Studio frames. These are **public endpoints** — no authentication required, since frames render in isolated iframes with no session context.

**Product Gate:** Routes only registered when `design-studio` product is enabled.

#### Serve KCL JavaScript Bundle

```
GET /kcl/:version/kcl.js
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `version` | string | Semver version (e.g. `1.0.0`) |

**Response:** `200 OK` — JavaScript bundle (`application/javascript`)

**Headers:**
- `Content-Type: application/javascript`
- `Cache-Control: public, max-age=31536000, immutable`

**Errors:**
- `400` — Invalid version format (must be `X.Y.Z` semver)
- `404` — KCL version not found

#### Serve KCL CSS Bundle

```
GET /kcl/:version/kcl.css
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `version` | string | Semver version (e.g. `1.0.0`) |

**Response:** `200 OK` — CSS stylesheet (`text/css`)

**Headers:**
- `Content-Type: text/css`
- `Cache-Control: public, max-age=31536000, immutable`

**Errors:**
- `400` — Invalid version format (must be `X.Y.Z` semver)
- `404` — KCL version not found

#### Frame HTML Template

Sandboxed iframes that render Design Studio frames use this template to load KCL:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/kcl/{canvas.kclVersion}/kcl.css">
  <style>/* frame-specific CSS */</style>
</head>
<body>
  <!-- frame HTML with KCL components -->
  <script src="/kcl/{canvas.kclVersion}/kcl.js"></script>
  <!-- data binding scripts -->
</body>
</html>
```

---

### Design Studio AI Endpoints (Slice B3)

AI-powered canvas frame generation, editing, restyling, and conversation history. Each AI action creates conversation entries, proof packets, persists frame updates, and broadcasts WebSocket events.

**Product Gate:** Routes only registered when `design-studio` product is enabled.

**Rate Limit:** 20 requests per hour per user (AI mutation endpoints).

#### Generate New Frames

Generate new frame(s) from a text prompt using KCL components. Optionally cross-references Kacheri Docs for context.

```http
POST /canvases/:cid/ai/generate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Natural language prompt describing the desired frame(s) |
| `frameContext` | string | No | Currently selected frame ID for context |
| `docRefs` | string[] | No | Kacheri Doc IDs to reference for content |
| `compositionMode` | string | No | Override: `deck` / `page` / `notebook` / `widget` |
| `provider` | string | No | Override AI provider |
| `model` | string | No | Override AI model |
| `includeMemoryContext` | boolean | No | Query memory graph for context (P7) |

**Response:** `200 OK`

```json
{
  "conversationId": "abc123",
  "frames": [
    {
      "id": "frame_id",
      "code": "<kcl-slide>...</kcl-slide>",
      "codeHash": "sha256hex",
      "title": "Frame Title",
      "sortOrder": 0
    }
  ],
  "docRefs": [
    {
      "docId": "doc_id",
      "section": "Section Title",
      "textUsed": "excerpt...",
      "textHash": "sha256hex",
      "sourceType": "section"
    }
  ],
  "proofId": "proof_uuid",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "validation": {
    "valid": true,
    "warnings": 0
  },
  "memoryContextUsed": true,
  "memoryEntityCount": 5,
  "memoryIndexedCount": 3
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `message` | string? | Clarification or outline text from AI (present when `isClarification` is `true`) |
| `isClarification` | boolean? | `true` when the AI responded with clarifying questions or an outline instead of code. `frames` will be empty. |
| `isOutline` | boolean? | `true` when the response is a structured slide outline (subset of clarification). The user can confirm the outline to trigger full generation, or request changes. |
| `memoryContextUsed` | boolean | Whether memory graph context was injected into the AI prompt (P7) |
| `memoryEntityCount` | number | Number of entities from the memory graph injected as context |
| `memoryIndexedCount` | number | Number of entities extracted from generated frames and pushed to the Memory Graph (S12). `0` when `MEMORY_GRAPH_ENABLED=false` or no entities extracted. |

**Outline-First Generation Flow:** By default, the generate endpoint uses a two-phase conversational flow. On the first request, the AI proposes a structured slide-by-slide outline (returned as `isClarification: true, isOutline: true, frames: []`). The user reviews the outline in the conversation panel and can request changes. When the user confirms (e.g., "go ahead"), the next generate call detects the confirmed outline in conversation history and generates full KCL HTML frames. Users can bypass the outline phase by including "just generate" or "skip outline" in their prompt.

**Memory Graph Behavior (Slice P7):** When `includeMemoryContext: true` is passed and `MEMORY_GRAPH_ENABLED=true`, the generate endpoint queries the workspace's knowledge graph (entities_fts FTS5 index) for entities relevant to the prompt. Matched entities with their cross-product mention sources (Docs, Research, Design Studio) are injected as a "Related Knowledge" section in the AI prompt. When `MEMORY_GRAPH_ENABLED=false` or memory graph query returns no results, `memoryContextUsed` is `false` and `memoryEntityCount` is `0` — no errors.

**Entity Indexing Behavior (Slice S12):** After frames are generated and persisted, the endpoint extracts entities from the frame HTML content (text, lists, quotes, metrics, data bindings) and pushes them to the Memory Graph with `productSource: 'design-studio'` and `sourceRef: canvasId`. Each indexed frame receives a `memoryIndexed: true` flag in its metadata. Extraction failures are silently ignored — they never block frame generation. When `MEMORY_GRAPH_ENABLED=false`, entity indexing is skipped entirely and `memoryIndexedCount` is `0`.

**Auth:** Canvas editor+ required.

**Errors:**
- `400` — Missing prompt
- `401` — Authentication required
- `403` — Requires editor role on canvas
- `404` — Canvas not found
- `409` — Canvas is locked by another user
- `429` — Rate limit exceeded

#### Edit Existing Frame

Modify an existing frame's code based on a text instruction. Preserves structure, applies targeted changes.

```http
POST /canvases/:cid/ai/edit
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Edit instruction |
| `frameId` | string | Yes | ID of the frame to edit |
| `provider` | string | No | Override AI provider |
| `model` | string | No | Override AI model |

**Response:** `200 OK` — Same shape as generate response, with single frame.

**Auth:** Canvas editor+ required.

**Errors:**
- `400` — Missing prompt or frameId
- `403` — Requires editor role
- `404` — Canvas or frame not found
- `409` — Canvas locked by another user

#### Restyle Frame(s)

Change visual appearance of frame(s) without altering content or data.

```http
POST /canvases/:cid/ai/style
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Style instruction |
| `frameIds` | string[] | Yes | IDs of frames to restyle (non-empty) |
| `provider` | string | No | Override AI provider |
| `model` | string | No | Override AI model |

**Response:** `200 OK` — Same shape as generate response, with restyled frame(s).

**Auth:** Canvas editor+ required.

**Errors:**
- `400` — Missing prompt or frameIds
- `403` — Requires editor role
- `404` — Canvas or any frame not found
- `409` — Canvas locked by another user

#### Get Conversation History

Retrieve paginated conversation history for a canvas.

```http
GET /canvases/:cid/conversation?limit=50&offset=0
Authorization: Bearer <accessToken>
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max messages to return (1-200) |
| `offset` | number | 0 | Pagination offset |

**Response:** `200 OK`

```json
{
  "canvasId": "canvas_id",
  "messages": [
    {
      "id": "msg_id",
      "canvasId": "canvas_id",
      "frameId": null,
      "role": "user",
      "content": "Create a slide about...",
      "actionType": "generate",
      "docRefs": null,
      "proofId": null,
      "metadata": null,
      "createdAt": "2026-02-22T10:00:00.000Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

**Auth:** Canvas viewer+ required.

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role on canvas
- `404` — Canvas not found

---

### Canvas Version & Export Endpoints (Slice B4)

Canvas version snapshots and export job management. Versions capture full canvas state (all frames with code, metadata, sort order). Exports trigger background rendering jobs (rendering workers available in Phase 5).

**Product Gate:** Routes only registered when `design-studio` product is enabled.

#### Create Named Version

Create a named version snapshot capturing the full canvas state (canvas metadata + all frames).

```http
POST /canvases/:cid/versions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Version name |
| `description` | string | No | Version description |

**Response:** `201 Created`

```json
{
  "id": "version_id",
  "canvasId": "canvas_id",
  "name": "v1.0",
  "description": "Before major redesign",
  "createdBy": "user_id",
  "createdAt": "2026-02-23T00:00:00.000Z",
  "frameCount": 5
}
```

**Auth:** Canvas editor+ required.

**Errors:**
- `400` — Missing version name
- `401` — Authentication required
- `403` — Requires editor role on canvas
- `404` — Canvas not found

#### List Versions

List version snapshots for a canvas (paginated, most recent first). Returns summaries without snapshot payload.

```http
GET /canvases/:cid/versions?limit=50&offset=0
Authorization: Bearer <accessToken>
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max results (1-200) |
| `offset` | number | 0 | Pagination offset |

**Response:** `200 OK`

```json
{
  "canvasId": "canvas_id",
  "versions": [
    {
      "id": "version_id",
      "canvasId": "canvas_id",
      "name": "v1.0",
      "description": "Before major redesign",
      "createdBy": "user_id",
      "createdAt": "2026-02-23T00:00:00.000Z"
    }
  ],
  "total": 3,
  "limit": 50,
  "offset": 0
}
```

**Auth:** Canvas viewer+ required.

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role on canvas
- `404` — Canvas not found

#### Restore Version

Restore a canvas to a previous version snapshot. Replaces all current frames and canvas metadata with the version state. Lock check enforced.

```http
POST /canvases/:cid/versions/:vid/restore
Authorization: Bearer <accessToken>
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |
| `vid` | string | Version ID |

**Response:** `200 OK`

```json
{
  "id": "canvas_id",
  "title": "Restored Title",
  "compositionMode": "deck",
  "frames": [
    {
      "id": "new_frame_id",
      "code": "<kcl-slide>...</kcl-slide>",
      "codeHash": "sha256hex",
      "sortOrder": 0
    }
  ],
  "restoredFrom": {
    "versionId": "version_id",
    "versionName": "v1.0"
  }
}
```

**Auth:** Canvas editor+ required.

**Errors:**
- `401` — Authentication required
- `403` — Requires editor role on canvas
- `404` — Canvas or version not found
- `409` — Canvas is locked by another user

#### Trigger Export

Create an export record and queue the export job. Export rendering workers are Phase 5 (D2-D4, D8) — records remain in `pending` status until workers are available.

```http
POST /canvases/:cid/export
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | Yes | Export format: `pdf`, `pptx`, `html_bundle`, `html_standalone`, `png`, `svg`, `embed`, `mp4` |
| `metadata` | object | No | Additional export metadata |

**Response:** `202 Accepted`

```json
{
  "id": "export_id",
  "canvasId": "canvas_id",
  "format": "pdf",
  "status": "pending",
  "filePath": null,
  "fileSize": null,
  "proofId": "proof_uuid",
  "errorMessage": null,
  "metadata": null,
  "createdBy": "user_id",
  "createdAt": "2026-02-23T00:00:00.000Z",
  "completedAt": null
}
```

**Auth:** Canvas viewer+ required.

**Errors:**
- `400` — Missing or invalid format
- `401` — Authentication required
- `403` — Requires viewer role on canvas
- `404` — Canvas not found

#### Get Export Status

Retrieve the status of an export job.

```http
GET /canvases/:cid/exports/:eid
Authorization: Bearer <accessToken>
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |
| `eid` | string | Export ID |

**Response:** `200 OK`

```json
{
  "id": "export_id",
  "canvasId": "canvas_id",
  "format": "pdf",
  "status": "pending",
  "filePath": null,
  "fileSize": null,
  "proofId": null,
  "errorMessage": null,
  "metadata": null,
  "createdBy": "user_id",
  "createdAt": "2026-02-23T00:00:00.000Z",
  "completedAt": null
}
```

**Auth:** Canvas viewer+ required.

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role on canvas
- `404` — Canvas or export not found

---

### Frame Templates (Slice D9)

Reusable frame templates — workspace-scoped with tag filtering. Templates are saved from existing frames and can be inserted as new frames in any canvas within the same workspace.

**Product Gate:** Routes only registered when `design-studio` product is enabled.

#### Create Template

Save a frame as a reusable template.

```http
POST /workspaces/:wid/templates
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "title": "Hero Slide",
  "code": "<kcl-slide>...</kcl-slide>",
  "description": "Full-width hero slide with title and subtitle",
  "tags": ["hero", "title", "deck"],
  "compositionMode": "deck",
  "thumbnailUrl": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Template name |
| `code` | string | Yes | Frame HTML/CSS/JS code |
| `description` | string | No | Template description |
| `tags` | string[] | No | Tags for filtering |
| `compositionMode` | string | No | One of: `deck`, `page`, `notebook`, `widget` |
| `thumbnailUrl` | string | No | Base64 or URL thumbnail |

**Response:** `201 Created`

```json
{
  "id": "tpl_abc123",
  "workspaceId": "ws_001",
  "title": "Hero Slide",
  "description": "Full-width hero slide with title and subtitle",
  "code": "<kcl-slide>...</kcl-slide>",
  "thumbnailUrl": null,
  "tags": ["hero", "title", "deck"],
  "compositionMode": "deck",
  "isPublic": false,
  "createdBy": "user_001",
  "createdAt": "2026-02-23T12:00:00.000Z",
  "updatedAt": "2026-02-23T12:00:00.000Z"
}
```

**Errors:**
- `400` — Missing title or code, invalid composition mode, invalid tags format
- `401` — Authentication required
- `403` — Requires editor role or higher

---

#### List Templates

List templates in a workspace with optional tag and composition mode filtering.

```http
GET /workspaces/:wid/templates
Authorization: Bearer <accessToken>
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max items per page (1-200, default 50) |
| `offset` | number | Items to skip (default 0) |
| `tag` | string | Filter by tag |
| `compositionMode` | string | Filter by composition mode |

**Response:** `200 OK`

```json
{
  "workspaceId": "ws_001",
  "templates": [ ... ],
  "total": 15,
  "limit": 50,
  "offset": 0
}
```

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role or higher

---

#### List Distinct Tags

Get all unique tags used across workspace templates.

```http
GET /workspaces/:wid/templates/tags
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`

```json
{
  "workspaceId": "ws_001",
  "tags": ["chart", "deck", "hero", "layout", "title"]
}
```

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role or higher

---

#### Get Template

Get a single template with its full code.

```http
GET /workspaces/:wid/templates/:tid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK` — Full `CanvasTemplate` object (same shape as create response)

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role or higher
- `404` — Template not found

---

#### Update Template

Update template metadata (title, description, tags, composition mode).

```http
PATCH /workspaces/:wid/templates/:tid
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "title": "Updated Hero Slide",
  "tags": ["hero", "title", "updated"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | New template name |
| `description` | string \| null | New description |
| `tags` | string[] | New tags array |
| `compositionMode` | string \| null | New composition mode |
| `thumbnailUrl` | string \| null | New thumbnail |

**Response:** `200 OK` — Updated `CanvasTemplate` object

**Errors:**
- `400` — No valid update fields, invalid composition mode
- `401` — Authentication required
- `403` — Requires editor role or higher
- `404` — Template not found

---

#### Delete Template

Permanently delete a template.

```http
DELETE /workspaces/:wid/templates/:tid
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `401` — Authentication required
- `403` — Requires editor role or higher
- `404` — Template not found

---

### AI Image Generation & Canvas Assets (Slice B5)

AI image generation via configurable provider (DALL-E 3 by default). Generated images are stored as canvas assets with proof tracking and per-workspace credit system.

**Feature Gate:** Routes registered only when `design-studio` product is enabled.

**Credit System:** Per-workspace image generation credits. Default allocation configurable via `IMAGE_CREDITS_DEFAULT` env var (default: 100). Credits are deducted after successful generation only.

#### Generate AI Image

Generate an image from a text prompt using AI. Stores the result as a canvas asset.

```http
POST /canvases/:cid/ai/image
Authorization: Bearer <accessToken>
x-workspace-id: <workspaceId>
Content-Type: application/json
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |

**Request Body:**

```json
{
  "prompt": "A modern office building at sunset with warm lighting",
  "size": "1024x1024",
  "quality": "standard",
  "style": "vivid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Text description of the desired image |
| `size` | string | No | Image dimensions: `1024x1024` (default), `1024x1792`, `1792x1024` |
| `quality` | string | No | Image quality: `standard` (default), `hd` |
| `style` | string | No | Image style: `vivid` (default), `natural` |

**Response:** `200 OK`

```json
{
  "assetId": "a1b2c3d4e5f6",
  "url": "/canvases/canvas_id/assets/a1b2c3d4e5f6",
  "filename": "1708950000000_abcd1234.png",
  "hash": "sha256:abc123...",
  "bytes": 1234567,
  "mimeType": "image/png",
  "width": 1024,
  "height": 1024,
  "revisedPrompt": "A modern glass office building at golden hour sunset...",
  "proofId": "proof_uuid",
  "provider": "openai",
  "model": "dall-e-3",
  "creditsRemaining": 99,
  "conversationId": "conv_msg_id"
}
```

**Auth:** Canvas editor+ required.

**Rate Limit:** 10 requests per hour per user (`designImage`).

**Errors:**
- `400` — Missing or empty prompt (`missing_prompt`)
- `401` — Authentication required
- `402` — Image generation credits exhausted (`credits_exhausted`)
- `403` — Requires editor role on canvas
- `404` — Canvas not found
- `409` — Canvas is locked by another user (`canvas_locked`)
- `429` — Rate limit exceeded
- `500` — Image generation failed

**Proof Tracking:** Each successful generation creates a proof packet with kind `design:image`, recording the prompt, provider, model, image hash, and asset metadata.

---

#### Serve Canvas Asset

Retrieve a canvas asset (generated image, uploaded file, etc.) by asset ID.

```http
GET /canvases/:cid/assets/:assetId
Authorization: Bearer <accessToken>
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `cid` | string | Canvas ID |
| `assetId` | string | Asset ID |

**Response:** `200 OK` — Binary image data

**Response Headers:**
- `Content-Type: image/png` (or actual MIME type of asset)
- `Cache-Control: public, max-age=31536000, immutable`

**Auth:** Canvas viewer+ required.

**Errors:**
- `401` — Authentication required
- `403` — Requires viewer role on canvas
- `404` — Canvas or asset not found

---

### Memory Graph Endpoints (Slice P2)

The Memory Graph is the platform's shared intelligence layer. Any product (Docs, Design Studio, JAAL Research, future products) can push entities and relationships into the graph via the unified ingest endpoint.

**Feature Gate:** Routes only available when `MEMORY_GRAPH_ENABLED=true`. Returns 404 when disabled.

**Workspace Context:** Resolved from `x-workspace-id` request header.

**Rate Limit:** 60 requests per minute per workspace.

#### Ingest Entities & Relationships

Accepts a batch of entities and relationships from any product and ingests them into the workspace's Memory Graph. Entities are deduplicated by normalized name + type within the workspace.

```http
POST /platform/memory/ingest
Authorization: Bearer <accessToken>
x-workspace-id: <workspaceId>
Content-Type: application/json
```

**Request Body:**
```json
{
  "productSource": "research",
  "entities": [
    {
      "name": "Acme Corp Annual Report 2025",
      "entityType": "research_source",
      "context": "Primary source in research session on corporate governance",
      "confidence": 0.9,
      "sourceRef": "session_2026-02-15T10-30-00Z",
      "metadata": { "url": "https://example.com/report" }
    },
    {
      "name": "Acme Corp",
      "entityType": "organization",
      "context": "Subject of corporate governance analysis",
      "confidence": 0.95
    }
  ],
  "relationships": [
    {
      "fromName": "Acme Corp Annual Report 2025",
      "fromType": "research_source",
      "toName": "Acme Corp",
      "toType": "organization",
      "relationshipType": "co_occurrence",
      "label": "source about",
      "evidence": "Research session analyzed Acme Corp governance structure"
    }
  ]
}
```

**Request Body Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productSource` | string | Yes | Source product: `docs`, `design-studio`, `research`, `notes`, `sheets` |
| `entities` | array | Yes | Array of entities to ingest (max 500) |
| `entities[].name` | string | Yes | Entity display name |
| `entities[].entityType` | string | Yes | Entity type: `person`, `organization`, `date`, `amount`, `location`, `product`, `term`, `concept`, `web_page`, `research_source`, `design_asset`, `event`, `citation` |
| `entities[].context` | string | No | Surrounding text context for the mention |
| `entities[].confidence` | number | No | Confidence score 0-1 (default: 0.5) |
| `entities[].sourceRef` | string | No | Source reference ID (canvas_id, session_id, etc.) |
| `entities[].metadata` | object | No | Arbitrary metadata for the entity |
| `relationships` | array | No | Array of relationships between entities |
| `relationships[].fromName` | string | Yes | Source entity name (must exist in entities array or already in graph) |
| `relationships[].fromType` | string | Yes | Source entity type |
| `relationships[].toName` | string | Yes | Target entity name (must exist in entities array or already in graph) |
| `relationships[].toType` | string | Yes | Target entity type |
| `relationships[].relationshipType` | string | Yes | Type: `co_occurrence`, `contractual`, `financial`, `organizational`, `temporal`, `custom` |
| `relationships[].label` | string | No | Human-readable relationship description |
| `relationships[].evidence` | string | No | Evidence context for the relationship |

**Response:** `201 Created`
```json
{
  "ok": true,
  "entitiesCreated": 1,
  "entitiesReused": 1,
  "mentionsCreated": 2,
  "relationshipsCreated": 1,
  "proofId": "42"
}
```

**Response with warnings (partial success):**
```json
{
  "ok": true,
  "entitiesCreated": 3,
  "entitiesReused": 0,
  "mentionsCreated": 3,
  "relationshipsCreated": 0,
  "proofId": "43",
  "warnings": [
    "Relationship 'Unknown Entity' -> 'Acme Corp': entity 'Unknown Entity' (concept) not found"
  ]
}
```

**Errors:**
- `400` — Validation failed (invalid productSource, entityType, empty entities, etc.)
- `401` — Authentication required
- `403` — Requires editor role or higher in workspace
- `404` — Memory Graph feature is disabled (`MEMORY_GRAPH_ENABLED=false`)
- `429` — Rate limit exceeded (60 req/min per workspace)
- `500` — Internal server error

**Deduplication Rules:**
- Entities are matched by normalized name (NFC + trim + lowercase) + entity type within the workspace
- If an entity already exists, it is reused (not duplicated) and a new mention is created
- Relationships use INSERT OR IGNORE on (from_entity_id, to_entity_id, relationship_type) — duplicate typed pairs are silently skipped

**Proof Tracking:**
- Each successful ingest creates a proof packet with kind `memory:ingest`
- The proof hash covers the ingest result (entities created/reused, mentions created, relationships created)
- An audit log entry is created for every ingest operation

---

### Health & Debug Endpoints

#### Root Info

Get service info and available routes.

```http
GET /
```

**Response:** `200 OK`
```json
{
  "service": "kacheri-backend",
  "version": "1.0.0",
  "routes": ["/docs", "/auth", "/workspaces", "..."]
}
```

---

#### Debug: SQLite Stats (Dev Only)

```http
GET /__debug/sqlite
```

**Response:** Database statistics

**Access:** Development only. Disabled in production (`NODE_ENV=production` returns 404). In development, requires platform admin access (`KACHERI_ADMIN_USERS` env var).

---

#### Debug: Document IDs with Proof Counts (Dev Only)

```http
GET /__debug/docIds
```

**Response:** List of documents with proof counts

**Access:** Development only. Disabled in production (`NODE_ENV=production` returns 404). In development, requires platform admin access (`KACHERI_ADMIN_USERS` env var).

---

#### Debug: Raw Provenance (Dev Only)

```http
GET /__debug/doc/:id/provRaw
```

**Response:** Raw provenance data for document

**Access:** Development only. Disabled in production (`NODE_ENV=production` returns 404). In development, requires platform admin access (`KACHERI_ADMIN_USERS` env var).

---

## WebSocket Events

### Connection

Connect to the WebSocket server for real-time updates.

**URL:** `ws://localhost:3002` (Yjs standalone) or custom workspace WebSocket

### Event Types

| Event | Direction | Description |
|-------|-----------|-------------|
| `ai:job:started` | Server → Client | AI job started |
| `ai:job:finished` | Server → Client | AI job completed |
| `ai:job:error` | Server → Client | AI job failed |
| `proof:added` | Server → Client | New proof recorded |
| `doc:updated` | Server → Client | Document updated |
| `comment` | Server → Client | Comment action (created/updated/deleted/resolved/reopened) |
| `version` | Server → Client | Version action (created/renamed/deleted/restored) |
| `suggestion` | Server → Client | Suggestion action (created/updated/accepted/rejected/deleted/accepted_all/rejected_all) |
| `message` | Server → Client | Chat message action (created/updated/deleted) |
| `notification` | Server → Client | New notification created |
| `attachment` | Server → Client | Attachment action (uploaded/deleted) |
| `reviewer` | Server → Client | Reviewer assignment action (assigned/status_changed/removed) |
| `workspace:member:added` | Server → Client | Member joined workspace |
| `workspace:member:removed` | Server → Client | Member left workspace |
| `canvas_presence` | Server → Client | Canvas viewer presence update (E8) |
| `canvas_lock` | Server → Client | Frame lock acquired/released/denied (E8) |
| `canvas_conversation` | Server → Client | Canvas conversation message broadcast (E8) |
| `canvas_join` | Client → Server | Join a canvas for presence tracking (E8) |
| `canvas_leave` | Client → Server | Leave a canvas (E8) |
| `canvas_frame_focus` | Client → Server | Update focused frame for presence (E8) |
| `canvas_lock_request` | Client → Server | Request to acquire/release a frame lock (E8) |

### Event Payloads

**ai:job:started:**
```json
{
  "type": "ai:job:started",
  "docId": "doc_xyz789",
  "jobId": "compose_1704067200_abc",
  "action": "compose"
}
```

**ai:job:finished:**
```json
{
  "type": "ai:job:finished",
  "docId": "doc_xyz789",
  "jobId": "compose_1704067200_abc",
  "proofId": 123,
  "elapsedMs": 1234
}
```

**proof:added:**
```json
{
  "type": "proof:added",
  "docId": "doc_xyz789",
  "proofId": 123,
  "kind": "ai:compose"
}
```

**comment:**
```json
{
  "type": "comment",
  "action": "created",
  "docId": "doc_xyz789",
  "commentId": 1,
  "threadId": "abc123def456",
  "authorId": "user_abc123",
  "content": "This paragraph needs revision.",
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `action` | One of: `created`, `updated`, `deleted`, `resolved`, `reopened` |
| `docId` | Document the comment belongs to |
| `commentId` | The comment ID |
| `threadId` | Thread ID (null for doc-level comments) |
| `authorId` | User who performed the action |
| `content` | Comment content (only for created/updated) |
| `ts` | Unix timestamp in milliseconds |

**version:**
```json
{
  "type": "version",
  "action": "created",
  "docId": "doc_xyz789",
  "versionId": 3,
  "versionNumber": 3,
  "name": "Final draft",
  "createdBy": "user_abc123",
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `action` | One of: `created`, `renamed`, `deleted`, `restored` |
| `docId` | Document the version belongs to |
| `versionId` | The version ID |
| `versionNumber` | Sequential version number for the document |
| `name` | Version name (null if unnamed) |
| `createdBy` | User who performed the action |
| `ts` | Unix timestamp in milliseconds |

**suggestion:**
```json
{
  "type": "suggestion",
  "action": "created",
  "docId": "doc_xyz789",
  "suggestionId": 1,
  "authorId": "user_abc123",
  "changeType": "replace",
  "status": "pending",
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `action` | One of: `created`, `updated`, `accepted`, `rejected`, `deleted`, `accepted_all`, `rejected_all` |
| `docId` | Document the suggestion belongs to |
| `suggestionId` | The suggestion ID (omitted for bulk actions) |
| `authorId` | User who performed the action |
| `changeType` | Change type: `insert`, `delete`, `replace` (only for created/accepted/rejected) |
| `status` | Suggestion status: `pending`, `accepted`, `rejected` (only for created/accepted/rejected) |
| `count` | Number of suggestions affected (only for accepted_all/rejected_all) |
| `ts` | Unix timestamp in milliseconds |

**message:**
```json
{
  "type": "message",
  "action": "created",
  "messageId": 42,
  "authorId": "user_abc123",
  "content": "Hello everyone!",
  "replyToId": null,
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `action` | One of: `created`, `updated`, `deleted` |
| `messageId` | The message ID |
| `authorId` | User who performed the action |
| `content` | Message content (only for created/updated) |
| `replyToId` | ID of the parent message if this is a reply (null otherwise) |
| `ts` | Unix timestamp in milliseconds |

**notification:**
```json
{
  "type": "notification",
  "notificationId": 99,
  "userId": "user_xyz789",
  "notificationType": "mention",
  "title": "You were mentioned in a comment",
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `notificationId` | The notification ID |
| `userId` | User receiving the notification |
| `notificationType` | Type: `mention`, `comment_reply`, `doc_shared`, `suggestion_pending`, `reminder`, `review_assigned` |
| `title` | Short notification title |
| `ts` | Unix timestamp in milliseconds |

**reviewer:**
```json
{
  "type": "reviewer",
  "action": "assigned",
  "docId": "doc_abc123",
  "userId": "user_xyz789",
  "assignedBy": "user_abc123",
  "status": "pending",
  "ts": 1708300800000
}
```

| Field | Description |
|-------|-------------|
| `action` | One of: `assigned`, `status_changed`, `removed` |
| `docId` | Document the reviewer is assigned to |
| `userId` | The reviewer user ID |
| `assignedBy` | User who assigned the reviewer (only for `assigned`) |
| `status` | Current status: `pending`, `in_review`, `completed` (omitted for `removed`) |
| `ts` | Unix timestamp in milliseconds |

**canvas_presence (E8):**
```json
{
  "type": "canvas_presence",
  "canvasId": "canvas_abc123",
  "frameId": "frame_xyz789",
  "userId": "user_abc123",
  "displayName": "Jane Doe",
  "action": "editing",
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `canvasId` | Canvas being viewed |
| `frameId` | Frame the user is focused on (null if none) |
| `userId` | User whose presence changed |
| `displayName` | Display name for UI rendering |
| `action` | One of: `viewing`, `editing`, `left` |
| `ts` | Unix timestamp in milliseconds |

**canvas_lock (E8):**
```json
{
  "type": "canvas_lock",
  "canvasId": "canvas_abc123",
  "frameId": "frame_xyz789",
  "userId": "user_abc123",
  "displayName": "Jane Doe",
  "action": "acquired",
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `canvasId` | Canvas containing the frame |
| `frameId` | Frame that was locked/unlocked |
| `userId` | User who holds or released the lock |
| `displayName` | Display name for UI rendering |
| `action` | One of: `acquired`, `released`, `denied` |
| `ts` | Unix timestamp in milliseconds |

**canvas_conversation (E8):**
```json
{
  "type": "canvas_conversation",
  "canvasId": "canvas_abc123",
  "messageId": "msg_abc123",
  "role": "user",
  "content": "Make the header blue",
  "actionType": "edit",
  "authorId": "user_abc123",
  "ts": 1704067200000
}
```

| Field | Description |
|-------|-------------|
| `canvasId` | Canvas the conversation belongs to |
| `messageId` | Unique message identifier |
| `role` | One of: `user`, `assistant` |
| `content` | Message content |
| `actionType` | Action type: `generate`, `edit`, `style` (optional) |
| `authorId` | User who sent the message |
| `ts` | Unix timestamp in milliseconds |

**Client → Server: canvas_join (E8):**
```json
{ "type": "canvas_join", "canvasId": "canvas_abc123" }
```

**Client → Server: canvas_leave (E8):**
```json
{ "type": "canvas_leave" }
```

**Client → Server: canvas_frame_focus (E8):**
```json
{ "type": "canvas_frame_focus", "canvasId": "canvas_abc123", "frameId": "frame_xyz789" }
```

**Client → Server: canvas_lock_request (E8):**
```json
{ "type": "canvas_lock_request", "canvasId": "canvas_abc123", "frameId": "frame_xyz789", "action": "acquire" }
```

| Field | Description |
|-------|-------------|
| `canvasId` | Canvas containing the frame |
| `frameId` | Frame to lock/unlock |
| `action` | One of: `acquire`, `release` |

---

## Data Models

### User

```typescript
interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: "active" | "inactive" | "suspended";
}
```

### Document

```typescript
interface Document {
  id: string;
  title: string;
  updatedAt: string | number | null;
}
```

### Workspace

```typescript
interface Workspace {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: number;
}
```

### Doc Permission

```typescript
type DocRole = "owner" | "editor" | "commenter" | "viewer";

interface DocPermission {
  docId: string;
  userId: string;
  role: DocRole;
  grantedBy: string;
  grantedAt: string;  // ISO 8601
}
```

### Comment

```typescript
interface Comment {
  id: number;
  docId: string;
  threadId: string | null;
  parentId: number | null;
  authorId: string;
  content: string;
  anchorFrom: number | null;    // Plain text start position
  anchorTo: number | null;      // Plain text end position
  anchorText: string | null;    // Original anchored text
  resolvedAt: string | null;    // ISO 8601 timestamp
  resolvedBy: string | null;    // User ID who resolved
  createdAt: string;            // ISO 8601
  updatedAt: string;            // ISO 8601
  mentions: string[];           // User IDs mentioned
}
```

### Doc Version

```typescript
interface DocVersionMeta {
  id: number;
  docId: string;
  versionNumber: number;
  name: string | null;
  snapshotHash: string;         // SHA256 hash of content
  createdBy: string;
  createdAt: string;            // ISO 8601
  proofId: number | null;       // Link to AI proof if applicable
  metadata: {
    wordCount?: number;
    charCount?: number;
    notes?: string;
  } | null;
}

interface DocVersionFull extends DocVersionMeta {
  snapshotHtml: string;         // Full HTML content
  snapshotText: string;         // Plain text for diff
}

interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

interface DiffHunk {
  type: 'add' | 'remove' | 'context';
  lineStart: number;
  content: string[];
}
```

### Suggestion

```typescript
type SuggestionStatus = 'pending' | 'accepted' | 'rejected';
type ChangeType = 'insert' | 'delete' | 'replace';

interface Suggestion {
  id: number;
  docId: string;
  authorId: string;
  status: SuggestionStatus;
  changeType: ChangeType;
  fromPos: number;             // Plain text start position (0-indexed)
  toPos: number;               // Plain text end position
  originalText: string | null; // Text being replaced/deleted
  proposedText: string | null; // New text being inserted/replaced
  comment: string | null;      // Author's explanation
  resolvedBy: string | null;   // User ID who accepted/rejected
  resolvedAt: string | null;   // ISO 8601 timestamp
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}
```

### Template

```typescript
interface TemplateListItem {
  id: string;           // Template identifier (e.g., "prd", "meeting-notes")
  name: string;         // Display name
  description: string;  // Short description
  icon: string;         // Icon identifier
  category: string;     // Category grouping
}

interface Template extends TemplateListItem {
  content: object;      // Tiptap JSON document structure
}
```

### File Node

```typescript
interface FileNode {
  id: string;
  parentId: string | null;
  kind: "folder" | "doc";
  name: string;
  docId: string | null;
  hasChildren: boolean;
}
```

### Proof Packet

```typescript
interface ProofPacket {
  id: string;
  kind: ProofKind;
  timestamp: string;  // ISO 8601
  docId?: string;
  actor: {
    type: "ai" | "system" | "user";
    provider?: string;
    model?: string;
  };
  input: unknown;
  output: unknown;
  hashes: {
    input?: string;
    output?: string;
  };
  meta?: Record<string, unknown>;
  created_by?: string | null;    // Authenticated user ID who created the proof
  workspace_id?: string | null;  // Workspace scope for the proof
}

type ProofKind =
  | "ai:compose"
  | "ai:rewriteSelection"
  | "ai:rewriteConstrained"
  | "ai:detectFields"
  | "ai:translate"
  | "ai:action"
  | "export:pdf"
  | "export:docx"
  | "import:pdf"
  | "import:docx"
  | "import"
  | "import:apply"
  | "tts:read_aloud"
  | "stt:dictate";
```

### Provenance Entry

```typescript
interface ProvenanceEntry {
  id: number;
  doc_id: string;
  action: string;
  actor: string;
  actor_id?: string | null;      // Authenticated user ID who performed the action
  workspace_id?: string | null;  // Workspace scope for the provenance entry
  ts: number;  // Unix timestamp
  details: Record<string, unknown> | null;
}
```

### AI Provider

```typescript
type ProviderName = "openai" | "anthropic" | "ollama" | "dev";

interface ProviderInfo {
  provider: ProviderName;
  models: string[];
  defaultModel: string | null;
}
```

### Detected Field

```typescript
interface DetectedField {
  type: "date" | "name" | "amount" | "custom";
  value: string;
  start: number;  // 0-indexed character position
  end: number;    // End character position
  confidence: number;  // 0-1 confidence score
}
```

### Audit Entry

```typescript
interface AuditEntry {
  id: number;
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ts: number;  // Unix timestamp (ms)
}

type AuditAction =
  | "member:add"
  | "member:remove"
  | "role:change"
  | "doc:create"
  | "doc:delete"
  | "doc:restore"
  | "doc:permanent_delete"
  | "doc:permission:grant"
  | "doc:permission:update"
  | "doc:permission:revoke"
  | "comment:create"
  | "comment:update"
  | "comment:delete"
  | "comment:resolve"
  | "comment:reopen"
  | "version:create"
  | "version:rename"
  | "version:delete"
  | "version:restore"
  | "suggestion:create"
  | "suggestion:update"
  | "suggestion:delete"
  | "suggestion:accept"
  | "suggestion:reject"
  | "suggestion:accept_all"
  | "suggestion:reject_all"
  | "folder:create"
  | "folder:delete"
  | "file:restore"
  | "file:permanent_delete";

type AuditTargetType = "user" | "doc" | "folder" | "file" | "workspace" | "comment" | "version" | "suggestion";
```

---

## Rate Limiting

Rate limiting is implemented on AI endpoints using `@fastify/rate-limit` plugin.

### Rate Limit Configuration

| Endpoint | Limit | Time Window |
|----------|-------|-------------|
| `POST /docs/:id/ai/compose` | 10 requests | 1 hour |
| `POST /docs/:id/ai/rewriteSelection` | 30 requests | 1 hour |
| `POST /docs/:id/ai/constrainedRewrite` | 30 requests | 1 hour |
| `POST /docs/:id/ai/detectFields` | 50 requests | 1 hour |
| `POST /docs/:id/ai/:action` (generic) | 20 requests | 1 hour |

### Rate Limit Key Resolution

Priority order for identifying the user:
1. `x-user-id` header (authenticated user)
2. `x-dev-user` header (development mode)
3. IP address (fallback)

### Rate Limit Headers

All AI endpoint responses include:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds until retry allowed (only on 429) |

### Rate Limit Exceeded Response

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 3600 seconds.",
  "retryAfter": 3600
}
```

---

## Versioning

The API does not currently use URL versioning. Future breaking changes may introduce `/v2/` prefix.

---

## Changelog

### v1.21.0 (Real-Time Canvas Collaboration — Phase 7, Slice E8)

- **NEW:** WebSocket `canvas_presence` server event — broadcasts viewer presence (viewing/editing/left) scoped to canvas
- **NEW:** WebSocket `canvas_lock` server event — broadcasts frame lock state (acquired/released/denied) scoped to canvas
- **NEW:** WebSocket `canvas_conversation` server event — broadcasts conversation messages between canvas viewers
- **NEW:** Client→Server `canvas_join` event — join a canvas for presence tracking
- **NEW:** Client→Server `canvas_leave` event — leave a canvas
- **NEW:** Client→Server `canvas_frame_focus` event — update focused frame for presence
- **NEW:** Client→Server `canvas_lock_request` event — request to acquire/release a frame lock
- **NEW:** Frame-level locking with 60s server-side timeout and 15s sweep interval
- **NEW:** Canvas-scoped WebSocket broadcasting (only viewers of a canvas receive its events)
- **NEW:** `PresenceIndicator` component — compact avatar row showing canvas viewers
- **NEW:** `FrameLockThumbnail` component — lock badge on frame rail thumbnails
- **NEW:** `FrameLockOverlay` component — full viewport overlay for locked frames
- **NEW:** `useCanvasCollaboration` hook — manages presence, locks, and conversation sync

### v1.20.0 (Advanced Page Numbering — Section 2.1)

- **NEW:** DOCX export page number format support — decimal, lowerRoman, upperRoman, lowerAlpha, upperAlpha via Word field code format switches and `<w:pgNumType>` section properties
- **NEW:** DOCX export page number startAt — first page starts at user-specified number
- **NEW:** DOCX export section breaks with page numbering restart — `sectionResetPageNumbers=true` creates proper Word `<w:sectPr>` elements with `<w:pgNumType w:start="1"/>`
- **NEW:** PDF export page number position mapping — `pageNumberPosition` setting places page numbers in header or footer with correct alignment (left/center/right)
- **DOCUMENTED:** PDF export limitations — format always decimal, startAt always 1, no section reset (Puppeteer constraints)
- **NEW:** Shared page number format utilities (`pageNumberFormat.ts`) for backend and frontend

### v1.19.0 (Email Notification Delivery — Phase 2 Sprint 4)

- **NEW:** `email` notification channel — SMTP-based email delivery for all notification types
- **NEW:** Email channel config: `{ "email": "user@example.com" }` with format validation
- **NEW:** Email templates for: mention, comment_reply, doc_shared, suggestion_pending, reminder, review_assigned
- **NEW:** SMTP transport via `nodemailer` — configured via env vars (`KACHERI_SMTP_HOST`, `KACHERI_SMTP_PORT`, `KACHERI_SMTP_USER`, `KACHERI_SMTP_PASS`, `KACHERI_SMTP_FROM`)
- **UPDATED:** `NotificationChannel` type now includes `'email'` alongside `'in_app'`, `'webhook'`, `'slack'`
- **UPDATED:** Notification preferences PUT validation includes email address format check

### v1.18.0 (Review Assignment System — Phase 2 Sprint 4)

- **NEW:** `POST /docs/:id/reviewers` — Assign reviewer to document (editor+)
- **NEW:** `GET /docs/:id/reviewers` — List document reviewers (viewer+)
- **NEW:** `PATCH /docs/:id/reviewers/:userId` — Update reviewer status (reviewer or editor+)
- **NEW:** `DELETE /docs/:id/reviewers/:userId` — Remove reviewer (editor+ or self)
- **NEW:** Migration `012_add_doc_reviewers.sql` — `doc_reviewers` table with UNIQUE constraint and indexes
- **NEW:** `review_assigned` notification type — fires on reviewer assignment
- **NEW:** Audit actions: `reviewer:assign`, `reviewer:unassign`, `reviewer:status_change`
- **NEW:** WebSocket `reviewer` event type (actions: `assigned`, `status_changed`, `removed`)

### v1.17.0 (Notification Preferences & Webhook Delivery — Phase 2 Sprint 4)

- **NEW:** `GET /workspaces/:id/notification-preferences` — List user's notification preferences for a workspace
- **NEW:** `PUT /workspaces/:id/notification-preferences` — Upsert notification preferences (channel, type, enabled, config)
- **NEW:** Migration `011_add_notification_preferences.sql` — `notification_preferences` table with UNIQUE constraint
- **NEW:** Job type `notification:deliver` — Background delivery to webhook and Slack channels
- **NEW:** Audit action: `notification:preference:update`
- **NEW:** `createAndDeliverNotification()` wrapper for auto-enqueuing external delivery

### v1.16.0 (Document Attachments Backend — Phase 2 Sprint 2)

- **NEW:** `POST /docs/:id/attachments` — Upload file attachment (multipart, MIME validation, limits enforcement)
- **NEW:** `GET /docs/:id/attachments` — List document attachments with stats and limits
- **NEW:** `GET /docs/:id/attachments/:attachmentId/file` — Serve attachment file (inline, cached)
- **NEW:** `DELETE /docs/:id/attachments/:attachmentId` — Soft-delete attachment
- **NEW:** Migration `010_add_doc_attachments.sql` — `doc_attachments` table with indexes
- **NEW:** Audit actions: `attachment:upload`, `attachment:delete`
- **NEW:** WebSocket `attachment` event type (actions: `uploaded`, `deleted`)
- **NEW:** Proof recording for attachment upload and delete operations

### v1.15.0 (Suggestion Filters — Phase 2 Sprint 1)

- **UPDATED:** `GET /docs/:id/suggestions` — Added query params: `changeType`, `from`, `to`
- **UPDATED:** `GET /docs/:id/suggestions` response now includes `total` count field

### v1.14.0 (Comment Filters & Bulk Resolve — Phase 2 Sprint 1)

- **UPDATED:** `GET /docs/:id/comments` — Added query params: `authorId`, `mentionsUser`, `unresolvedOnly`, `from`, `to`, `search`, `limit`, `offset`, `sortBy`
- **UPDATED:** `GET /docs/:id/comments` response now includes `total` count field
- **NEW:** `POST /docs/:id/comments/bulk-resolve` — Bulk resolve comment threads (all or specific thread IDs)
- **NEW:** Audit action: `comment:bulk_resolve`
- **NEW:** WebSocket `comment` event action: `bulk_resolved`

### v1.13.0 (Auth, RBAC & Sharing — Pilot Completion)

- **NEW:** `created_by` column on `proofs` table — tracks authenticated user who created each proof
- **NEW:** `actor_id` column on `provenance` table — tracks authenticated user for each provenance entry
- **NEW:** `workspace_id` column on both `proofs` and `provenance` tables — enables workspace-scoped queries
- **NEW:** Shared `checkDocAccess()` utility in workspace middleware for doc-level permission enforcement
- **ENFORCED:** Doc-level permission checks on all doc-scoped routes:
  - `GET /docs/:id`, `GET /docs/:id/layout`, `GET /docs/:id/exports`, `GET /docs/:id/provenance` — `viewer+`
  - `PATCH /docs/:id`, `DELETE /docs/:id`, `PATCH /docs/:id/layout`, `POST /docs/:id/restore` — `editor+`
  - `DELETE /docs/:id/permanent` — `owner`
  - `POST /docs/:id/export/pdf`, `GET /docs/:id/exports/pdf/:file`, `GET /docs/:id/exports/docx/:file` — `viewer+`
  - `POST /docs/:id/export/docx` — `viewer+`
  - All `POST /docs/:id/ai/*` routes — `editor+`
  - `POST /docs/:id/extract`, `PATCH /docs/:id/extraction` — `editor+`
  - `GET /docs/:id/extraction`, `GET /docs/:id/extraction/export`, `GET /docs/:id/extraction/actions` — `viewer+`
  - `POST /docs/:id/extraction/actions`, `DELETE /docs/:id/extraction/actions/:actionId` — `editor+`
  - `POST /docs/:id/images`, `DELETE /docs/:id/images/:filename` — `editor+`
  - `GET /docs/:id/images/:filename`, `GET /docs/:id/images` — `viewer+`
  - `GET /docs/:id/import/source`, `GET /docs/:id/import/meta` — `viewer+`
- **NEW:** 403 response `{ error: "forbidden", message: "..." }` on all doc-scoped routes when permission denied
- Migration `005_add_user_workspace_to_proofs_provenance.sql` with backfill from docs table

### v1.12.0 (Translation - Phase 3)

- **NEW:** `POST /docs/:id/ai/translate` endpoint for AI-powered text translation
- **NEW:** `ai:translate` provenance action type with source/target language tracking
- **NEW:** Translation proof recording with input/output hashes, language pair metadata
- **SUPPORTED LANGUAGES:** Auto-detect, English, Spanish, French, German, Italian, Portuguese, Japanese, Chinese, Korean, Arabic, Hindi, Russian
- **FRONTEND:** `TranslateModal` component with language selection, preview, and apply options
- **FRONTEND:** "Translate" button in editor toolbar (selection-aware)
- **FRONTEND:** ProofsPanel filter for `ai:translate` events
- **FEATURES:**
  - Translate selection or full document
  - Source language auto-detection
  - Preview before applying
  - Apply actions: Replace, Insert Below, Copy to Clipboard

### v1.11.0 (STT Dictation - Phase 3)

- **NEW:** `stt:dictate` provenance action type for voice input
- **NEW:** STT proof recording with details: textLength, duration, language, completed status
- **FRONTEND:** `useSTT` hook for Web Speech API SpeechRecognition
- **FRONTEND:** `DictatePanel` component with recording controls, language selection
- **FRONTEND:** "Dictate" button in editor toolbar
- **FRONTEND:** ProofsPanel filter for `stt:dictate` events
- **NOTE:** Requires microphone permission; works best in Chrome/Edge

### v1.10.0 (TTS Read Aloud - Phase 3)

- **NEW:** `tts:read_aloud` provenance action type for auditory verification
- **NEW:** TTS proof recording with details: textLength, duration, voice, rate, completed status
- **FRONTEND:** `useTTS` hook for Web Speech API integration
- **FRONTEND:** `ReadAloudPanel` component with playback controls
- **FRONTEND:** "Read" button in editor toolbar (selection-aware)
- **FRONTEND:** ProofsPanel filter for `tts:read_aloud` events

### v1.9.0 (Rate Limiting)

- **NEW:** Rate limiting on AI endpoints via `@fastify/rate-limit`
- **NEW:** Per-route limits: compose (10/hr), rewrite (30/hr), detectFields (50/hr)
- **NEW:** User-based rate limit keying (x-user-id > x-dev-user > IP)
- **NEW:** Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- **NEW:** 429 Too Many Requests response with retryAfter

### v1.8.0 (Pilot Completion)

- **NEW:** @Mentions UI in comments with autocomplete popup
- **NEW:** Keyboard shortcuts modal (Ctrl/Cmd + ?)
- **NEW:** Headers & footers rendering in editor and exports
- **VERIFIED:** Template gallery with 6 seeded templates
- **VERIFIED:** CLI verification scripts (replay_exports, replay_ai_compose, nightly_verify)
- **VERIFIED:** AI Watch standalone dashboard at /ai-watch
- **VERIFIED:** Share dialog workspace access toggle
- **VERIFIED:** Multi-level list nesting (bullets, numbers, legal)
- **VERIFIED:** Find & Replace with headings navigation

### v1.7.0 (Template Gallery)

- **NEW:** `GET /templates` - List all available document templates
- **NEW:** `GET /templates/:id` - Get a single template with content
- **NEW:** `POST /docs/from-template` - Create a document from a template
- **NEW:** 6 built-in templates: Blank, PRD, One-Pager, Meeting Notes, Project Brief, Weekly Report
- Added `Template`, `TemplateListItem` data models

### v1.6.0 (Suggestions / Track Changes)

- **NEW:** `GET /docs/:id/suggestions` - List suggestions for a document
- **NEW:** `POST /docs/:id/suggestions` - Create a new suggestion
- **NEW:** `GET /suggestions/:id` - Get a single suggestion
- **NEW:** `PATCH /suggestions/:id` - Update suggestion comment
- **NEW:** `DELETE /suggestions/:id` - Delete a suggestion
- **NEW:** `POST /suggestions/:id/accept` - Accept a suggestion
- **NEW:** `POST /suggestions/:id/reject` - Reject a suggestion
- **NEW:** `POST /docs/:id/suggestions/accept-all` - Accept all pending suggestions
- **NEW:** `POST /docs/:id/suggestions/reject-all` - Reject all pending suggestions
- **NEW:** Change types: `insert`, `delete`, `replace`
- **NEW:** Position-based text anchoring (`fromPos`, `toPos`)
- **NEW:** WebSocket `suggestion` event for real-time updates
- **NEW:** Audit actions: `suggestion:create`, `suggestion:update`, `suggestion:delete`, `suggestion:accept`, `suggestion:reject`, `suggestion:accept_all`, `suggestion:reject_all`
- Added `Suggestion`, `SuggestionStatus`, `ChangeType` data models

### v1.5.0 (Version History)

- **NEW:** `GET /docs/:id/versions` - List all versions for a document
- **NEW:** `POST /docs/:id/versions` - Create a named version snapshot
- **NEW:** `GET /docs/:id/versions/:versionId` - Get full version with snapshot content
- **NEW:** `PATCH /docs/:id/versions/:versionId` - Rename a version
- **NEW:** `DELETE /docs/:id/versions/:versionId` - Delete a version
- **NEW:** `GET /docs/:id/versions/:versionId/diff` - Compute line-based text diff
- **NEW:** `POST /docs/:id/restore-version` - Restore document to prior version (with backup)
- **NEW:** Version number auto-increments per document
- **NEW:** SHA256 hash computed for each snapshot
- **NEW:** WebSocket `version` event for real-time updates
- **NEW:** Audit actions: `version:create`, `version:rename`, `version:delete`, `version:restore`
- Added `DocVersionMeta`, `DocVersionFull`, `VersionDiff`, `DiffHunk` data models

### v1.4.0 (Comments)

- **NEW:** `GET /docs/:id/comments` - List comments for a document
- **NEW:** `POST /docs/:id/comments` - Create a new comment
- **NEW:** `GET /comments/:id` - Get a single comment
- **NEW:** `PATCH /comments/:id` - Update a comment's content
- **NEW:** `DELETE /comments/:id` - Soft delete a comment
- **NEW:** `POST /comments/:id/resolve` - Resolve a comment thread
- **NEW:** `POST /comments/:id/reopen` - Reopen a resolved thread
- **NEW:** Comment threading with `threadId` and `parentId`
- **NEW:** Text anchoring with `anchorFrom`, `anchorTo`, `anchorText`
- **NEW:** @mentions stored in `comment_mentions` table
- **NEW:** WebSocket `comment` event for real-time updates
- **NEW:** Audit actions: `comment:create`, `comment:update`, `comment:delete`, `comment:resolve`, `comment:reopen`
- Added `Comment` data model

### v1.3.0 (Doc-Level Permissions)

- **NEW:** `GET /docs/:id/permissions` - List permissions for a document
- **NEW:** `POST /docs/:id/permissions` - Grant access to a user on a document
- **NEW:** `PATCH /docs/:id/permissions/:userId` - Update a user's role on a document
- **NEW:** `DELETE /docs/:id/permissions/:userId` - Revoke a user's permission
- **NEW:** Doc permission roles: `owner`, `editor`, `commenter`, `viewer`
- **NEW:** Permission resolution order: doc permission > workspace role > doc creator
- **NEW:** Audit actions: `doc:permission:grant`, `doc:permission:update`, `doc:permission:revoke`
- Added `DocRole`, `DocPermission` data models
- Documents now track `createdBy` for implicit ownership

### v1.2.0 (Audit Log)

- **NEW:** `GET /workspaces/:id/audit` - List audit log entries for a workspace
- **NEW:** `GET /workspaces/:id/audit/export` - Export audit log as JSON/CSV (admin only)
- **NEW:** `GET /workspaces/:id/audit/stats` - Get audit statistics for a workspace
- **NEW:** Audit logging for membership changes (add, remove, role change)
- **NEW:** Audit logging for document operations (create, delete, restore, permanent delete)
- **NEW:** Audit logging for file/folder operations (create, delete, restore, permanent delete)
- Added `AuditEntry`, `AuditAction`, `AuditTargetType` data models

### v1.1.0 (Enhanced PDF Import)

- **NEW:** `GET /docs/:id/import/source` - Serve original uploaded PDF for side-by-side viewing
- **NEW:** `GET /docs/:id/import/meta` - Get import metadata to determine modal type
- **NEW:** `POST /docs/:id/ai/detectFields` - AI-powered field detection (dates, names, amounts)
- **IMPROVED:** PDF extraction now uses pdfjs-dist with font metadata for better heading detection
- **IMPROVED:** Structure detection using font size heuristics (h1: 1.5x, h2: 1.3x, h3: 1.15x base font)
- Added `DetectedField` data model
- Added `ai:detectFields` proof kind

### v1.0.0 (Initial)

- Authentication (register, login, logout, refresh)
- Document CRUD operations
- AI compose, rewrite selection, constrained rewrite
- PDF and DOCX export
- Multi-format document import
- Provenance tracking
- File manager (folders and document organization)
- Workspace management with role-based access
- AI activity monitoring

---

### Canvas Provenance Endpoint (Slice E3)

Fetch provenance history (proof packets and AI activity) scoped to a specific canvas. Added during Phase 7 E3 (Proof Integration).

#### List Canvas Provenance

```
GET /canvases/:cid/provenance
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `number` | `50` | Maximum items to return |
| `offset` | `number` | `0` | Pagination offset |
| `kind` | `string` | — | Filter by proof kind (e.g. `design:generate`, `design:edit`, `design:style`, `design:export`) |

**Response:** `200 OK`

```json
{
  "provenance": [
    {
      "id": "prov_abc123",
      "kind": "design:generate",
      "userId": "user_123",
      "details": { "canvasId": "canvas_456", "prompt": "Create a title slide" },
      "createdAt": "2026-02-24T10:00:00.000Z"
    }
  ],
  "total": 42
}
```

**Auth:** Requires viewer+ role on the canvas.

**Errors:**
- `401` — Authentication required
- `403` — Insufficient permissions
- `404` — Canvas not found

---

### KCL Asset Proxy Endpoint (Slice E1)

Public proxy route for serving canvas assets (images, fonts, icons) to sandboxed iframes. Frames cannot authenticate or access the parent origin directly, so this proxy resolves `kcl-asset://` references to actual file data.

**Security:** Asset IDs are 12-character nanoids (~72 bits entropy), making enumeration infeasible. Only `image`, `font`, and `icon` asset types are served.

#### Serve Canvas Asset via Proxy

```
GET /kcl-assets/:assetId
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `assetId` | `string` | The nanoid of the canvas asset |

**Response:** `200 OK` — Binary file content with appropriate `Content-Type` header.

**Response Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | Asset MIME type (e.g. `image/png`, `font/woff2`) |
| `Cache-Control` | `public, max-age=31536000, immutable` |
| `Access-Control-Allow-Origin` | `null` (for sandboxed iframe CORS) |

**Auth:** None — public endpoint (iframes have no session context).

**Errors:**
- `400` — Invalid asset ID format
- `404` — Asset not found or unsupported asset type

---

### Canvas Frame Embedding — Cross-Product (Slice P9)

Read-only endpoint for embedding Design Studio canvas frames inside Kacheri Docs via the Tiptap `canvasEmbed` node extension.

**Feature Gate:** Route registered only when **both** `docs` and `design-studio` products are enabled. Returns 404 when either product is disabled.

#### Get Frame Render Data

Fetch a frame's HTML code and KCL version for rendering in a sandboxed iframe embedded in a document.

```http
GET /embed/frames/:fid/render?docId=<docId>
Authorization: Bearer <accessToken>
```

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `fid` | string | Frame ID |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `docId` | string | No | When provided, creates a `doc_link` provenance record linking the document to the canvas (`link_text: 'canvas_embed'`) |

**Response:** `200 OK`

```json
{
  "code": "<kcl-slide background=\"#1e1b4b\">...</kcl-slide>",
  "kclVersion": "1.0.0",
  "canvasId": "abc123def456",
  "canvasTitle": "Q4 Revenue Deck",
  "frameId": "frm_001",
  "frameTitle": "Title Slide"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Frame HTML/CSS/JS code using KCL components |
| `kclVersion` | string | KCL bundle version pinned to the canvas |
| `canvasId` | string | Parent canvas ID |
| `canvasTitle` | string | Canvas title |
| `frameId` | string | Frame ID |
| `frameTitle` | string \| null | Frame title if set |

**Errors:**
- `403` — Access denied (user lacks viewer+ access to the canvas)
- `404` — Frame not found, canvas not found, or cross-product routes not enabled

---

### Public Canvas Embed — Embed/Widget Mode (Slice E5)

Public embed routes for embedding published Design Studio canvases and frames on external sites. Published embeds require no authentication — only that the canvas owner has toggled the publish state.

**Feature Gate:** Routes registered only when `design-studio` product is enabled.

#### Toggle Canvas Published State

Toggle a canvas between published (embeddable) and unpublished. Only the canvas owner can publish/unpublish.

```http
PATCH /canvases/:cid/publish
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "published": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `published` | boolean | Yes | `true` to publish, `false` to unpublish |

**Response:** `200 OK`

```json
{
  "id": "cnv_abc123",
  "title": "Q4 Revenue Deck",
  "isPublished": true,
  "publishedAt": "2026-02-24T10:30:00.000Z",
  "..."
}
```

Returns the full canvas object with updated `isPublished` and `publishedAt` fields.

**Errors:**
- `400` — Missing or invalid `published` field
- `403` — User is not the canvas owner
- `404` — Canvas not found

---

#### Get Public Canvas Embed (HTML)

Render a published canvas as a self-contained HTML page for embedding in an `<iframe>`. No authentication required.

```http
GET /embed/public/canvases/:cid
```

**Response:** `200 OK` with `Content-Type: text/html`

Returns a full HTML document containing all canvas frames with KCL components loaded, responsive layout, and auto-resize messaging.

**Errors:**
- `404` — Canvas not found or not published

---

#### Get Public Frame Embed (HTML)

Render a single frame from a published canvas as a self-contained HTML page for embedding in an `<iframe>`. No authentication required.

```http
GET /embed/public/frames/:fid
```

**Response:** `200 OK` with `Content-Type: text/html`

Returns a full HTML document containing the single frame with KCL components loaded, responsive layout, and auto-resize messaging.

**Errors:**
- `404` — Frame not found, parent canvas not found, or canvas not published

---

### Workspace Embed Whitelist (Slice E7)

Per-workspace configuration of allowed external embed domains for Design Studio frames. Extends the default whitelist (YouTube, Vimeo, Google Maps, Codepen, Loom) with workspace-specific custom domains. Only workspace admins can modify the whitelist.

**Feature Gate:** Routes registered only when `design-studio` product is enabled.

#### Get Workspace Embed Whitelist

Retrieve the effective embed whitelist for a workspace, including default domains, custom additions, and the merged effective list.

```http
GET /workspaces/:wid/embed-whitelist
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`

```json
{
  "defaults": [
    "youtube.com", "www.youtube.com", "youtu.be",
    "vimeo.com", "player.vimeo.com",
    "google.com", "www.google.com", "maps.google.com",
    "codepen.io",
    "loom.com", "www.loom.com"
  ],
  "custom": ["figma.com", "miro.com"],
  "effective": [
    "youtube.com", "www.youtube.com", "youtu.be",
    "vimeo.com", "player.vimeo.com",
    "google.com", "www.google.com", "maps.google.com",
    "codepen.io",
    "loom.com", "www.loom.com",
    "figma.com", "miro.com"
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `defaults` | string[] | Built-in default embed domains (always included) |
| `custom` | string[] | Workspace-specific custom domains added by admin |
| `effective` | string[] | Merged and deduplicated list of all allowed domains |

**Errors:**
- `401` — Authentication required
- `403` — Requires workspace viewer role or higher

---

#### Update Workspace Embed Whitelist

Set the workspace's custom embed domain whitelist. Replaces the existing custom list entirely. Default domains cannot be removed.

```http
PUT /workspaces/:wid/embed-whitelist
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "domains": ["figma.com", "miro.com"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domains` | string[] | Yes | Custom domains to allow. Must be valid hostnames (no protocol, path, or port). |

**Response:** `200 OK`

```json
{
  "defaults": ["youtube.com", "..."],
  "custom": ["figma.com", "miro.com"],
  "effective": ["youtube.com", "...", "figma.com", "miro.com"]
}
```

**Errors:**
- `400` — Missing `domains` array or invalid domain format
- `401` — Authentication required
- `403` — Requires workspace admin role or higher

---

### Workspace AI Settings (BYOK + Model Selection)

Per-workspace configuration for AI provider, model, and optional Bring-Your-Own-Key (BYOK). Settings are workspace-scoped; when absent the server-level defaults apply.

#### Get Workspace AI Settings

Returns current workspace AI settings plus the available provider catalog and server defaults.

```http
GET /workspaces/:wid/ai-settings
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "hasApiKey": true,
  "availableProviders": [
    { "provider": "openai", "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"], "defaultModel": "gpt-4o" },
    { "provider": "anthropic", "models": ["claude-sonnet-4-5-20250929", "claude-3-5-haiku-20241022"], "defaultModel": "claude-sonnet-4-5-20250929" },
    { "provider": "ollama", "models": ["llama3", "mistral"], "defaultModel": "llama3" }
  ],
  "serverDefaults": { "provider": "openai", "model": "gpt-4o" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `provider` | string \| null | Workspace override provider, or null for server default |
| `model` | string \| null | Workspace override model, or null for provider default |
| `hasApiKey` | boolean | Whether a BYOK API key is stored (never exposes the actual key) |
| `availableProviders` | array | Provider catalog from server env vars |
| `serverDefaults` | object | Server-level default provider and model |

**Errors:**
- `401` — Authentication required
- `403` — Requires workspace admin role or higher

---

#### Update Workspace AI Settings

Set or update the workspace AI provider, model, and/or API key. Fields not provided are left unchanged. Pass `null` to clear a field.

```http
PUT /workspaces/:wid/ai-settings
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "apiKey": "sk-ant-..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string \| null | No | AI provider name. Must match an available provider. Null clears. |
| `model` | string \| null | No | Model identifier. Null clears. |
| `apiKey` | string \| null | No | BYOK API key. Encrypted at rest (AES-256-GCM). Null clears. |

**Response:** `200 OK` — Same shape as GET response.

**Errors:**
- `400` — Unknown provider or empty body
- `401` — Authentication required
- `403` — Requires workspace admin role or higher

---

#### Delete Workspace AI Settings

Remove all workspace AI settings, reverting to server defaults.

```http
DELETE /workspaces/:wid/ai-settings
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

**Errors:**
- `401` — Authentication required
- `403` — Requires workspace admin role or higher

---

---

## JAAL Research Browser (Phase B, Slice S5)

> All JAAL endpoints require authentication (`Authorization: Bearer <accessToken>`) and an active workspace context (`X-Workspace-Id` header or `workspaceId` body field). JAAL routes are product-gated — they return 404 unless `jaal` is included in `ENABLED_PRODUCTS`.

---

### JAAL Session Endpoints (Slice S5)

#### Create Session

Start a new JAAL research session.

```http
POST /jaal/sessions
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "workspaceId": "ws_abc123"
}
```

**Response:** `201 Created`
```json
{
  "session": {
    "id": "aBcDeFgHiJkL",
    "workspaceId": "ws_abc123",
    "userId": "user_xyz",
    "status": "active",
    "actionCount": 0,
    "metadata": null,
    "startedAt": "2026-02-26T10:00:00.000Z",
    "endedAt": null
  }
}
```

**Errors:**
- `400` — Missing `workspaceId`
- `401` — Authentication required
- `403` — Not a member of the workspace

---

#### List Sessions

List the authenticated user's JAAL sessions in the current workspace.

```http
GET /jaal/sessions
Authorization: Bearer <accessToken>
X-Workspace-Id: ws_abc123
```

**Response:** `200 OK`
```json
{
  "sessions": [
    {
      "id": "aBcDeFgHiJkL",
      "workspaceId": "ws_abc123",
      "userId": "user_xyz",
      "status": "active",
      "actionCount": 3,
      "metadata": null,
      "startedAt": "2026-02-26T10:00:00.000Z",
      "endedAt": null
    }
  ]
}
```

**Errors:**
- `401` — Authentication required

---

#### Get Session

Get details of a specific session.

```http
GET /jaal/sessions/:sid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "session": { ... }
}
```

**Errors:**
- `401` — Authentication required
- `404` — Session not found

---

#### Update / End Session

Update session metadata or end the session.

```http
PATCH /jaal/sessions/:sid
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "ended": true
}
```

Or update metadata:

```json
{
  "metadata": { "tags": ["legal", "research"] }
}
```

**Response:** `200 OK`
```json
{
  "session": { ... }
}
```

**Errors:**
- `401` — Authentication required
- `404` — Session not found or access denied

---

### JAAL Guide (AI Action) Endpoints (Slice S5)

> All guide endpoints are rate-limited: 30 requests per hour per user. Each endpoint performs a policy check before executing, creates a proof record, and logs an audit event.

---

#### Summarize Page

AI-summarize page content (5 bullet points).

```http
POST /jaal/guide/summarize
Authorization: Bearer <accessToken>
X-Workspace-Id: ws_abc123
Content-Type: application/json

{
  "url": "https://example.com/article",
  "content": "<html>...page content...</html>"
}
```

**Response:** `200 OK`
```json
{
  "result": "• Point one\n• Point two\n• ...",
  "proofId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Errors:**
- `400` — Missing `content`
- `401` — Authentication required
- `403` — Policy denied (action or domain blocked)

---

#### Extract Links

Extract links from page content (local extraction, no LLM).

```http
POST /jaal/guide/extract-links
Authorization: Bearer <accessToken>
X-Workspace-Id: ws_abc123
Content-Type: application/json

{
  "url": "https://example.com/article",
  "content": "<html>...page content...</html>"
}
```

**Response:** `200 OK`
```json
{
  "result": [
    { "url": "https://example.com/link1", "text": "Link 1" },
    { "url": "https://example.com/link2", "text": "Link 2" }
  ],
  "proofId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Errors:**
- `400` — Missing `content`
- `401` — Authentication required
- `403` — Policy denied

---

#### Compare Pages

AI-compare two pages with sourced bullet points.

```http
POST /jaal/guide/compare
Authorization: Bearer <accessToken>
X-Workspace-Id: ws_abc123
Content-Type: application/json

{
  "urlA": "https://example.com/page-a",
  "contentA": "<html>...page A...</html>",
  "urlB": "https://example.com/page-b",
  "contentB": "<html>...page B...</html>"
}
```

**Response:** `200 OK`
```json
{
  "result": "• [A] claims X while [B] claims Y\n• ...",
  "proofId": "550e8400-e29b-41d4-a716-446655440002"
}
```

**Errors:**
- `400` — Missing `contentA` or `contentB`
- `401` — Authentication required
- `403` — Policy denied for URL A or URL B

---

### JAAL Proof Endpoints (Slice S5)

#### Create Proof

Manually create a JAAL proof record.

```http
POST /jaal/proofs
Authorization: Bearer <accessToken>
X-Workspace-Id: ws_abc123
Content-Type: application/json

{
  "sessionId": "aBcDeFgHiJkL",
  "kind": "capture",
  "payload": {
    "url": "https://example.com",
    "title": "Example Page",
    "capturedAt": "2026-02-26T10:05:00.000Z"
  }
}
```

**Response:** `201 Created`
```json
{
  "proof": {
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "sessionId": "aBcDeFgHiJkL",
    "workspaceId": "ws_abc123",
    "userId": "user_xyz",
    "kind": "capture",
    "hash": "a1b2c3d4e5f6...",
    "payload": { ... },
    "createdAt": "2026-02-26T10:05:00.000Z"
  }
}
```

**Errors:**
- `400` — Missing `kind` or `payload`
- `401` — Authentication required

---

#### List Proofs

List JAAL proofs with optional filters.

```http
GET /jaal/proofs?sessionId=abc&kind=summarize&limit=50
Authorization: Bearer <accessToken>
X-Workspace-Id: ws_abc123
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | string | — | Filter by session |
| `kind` | string | — | Filter by proof kind |
| `limit` | number | 100 | Max results (capped at 200) |

**Response:** `200 OK`
```json
{
  "proofs": [ ... ]
}
```

**Errors:**
- `401` — Authentication required

---

#### Get Proof

Get details of a specific proof.

```http
GET /jaal/proofs/:pid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "proof": { ... }
}
```

**Errors:**
- `401` — Authentication required
- `404` — Proof not found

---

### JAAL Policy Endpoints (Slice S5)

#### Evaluate Policy

Check whether an action is allowed by the current policy bundle.

```http
GET /jaal/policy/evaluate?action=summarize&url=https://example.com&mode=Guide
Authorization: Bearer <accessToken>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | Action to evaluate (e.g. `summarize`, `compare`, `extract_links`) |
| `url` | string | No | Target URL for domain-level checks |
| `mode` | string | No | `Guide` or `Research` (defaults to Guide) |

**Response:** `200 OK`
```json
{
  "allowed": true,
  "readOnly": false,
  "reasons": [],
  "policy": {
    "version": "0.3",
    "bundleId": "policy-seed-v0.3"
  }
}
```

**Denied example:**
```json
{
  "allowed": false,
  "readOnly": false,
  "reasons": ["Domain 'paypal.com' is in the deny list."],
  "policy": { "version": "0.3", "bundleId": "policy-seed-v0.3" }
}
```

**Errors:**
- `400` — Missing `action` query parameter
- `401` — Authentication required

---

#### Get Privacy Receipt

Get a privacy receipt summarizing recent JAAL proof activity for the user.

```http
GET /jaal/policy/privacy-receipt
Authorization: Bearer <accessToken>
X-Workspace-Id: ws_abc123
```

**Response:** `200 OK`
```json
{
  "receipts": [
    {
      "id": "550e8400-...",
      "action": "summarize",
      "timestamp": "2026-02-26T10:05:00.000Z",
      "details": { "url": "https://example.com" }
    }
  ]
}
```

**Errors:**
- `401` — Authentication required

---

### JAAL Browse Proxy Endpoint (Slice S5)

#### Browse URL

Server-side proxy fetch of a URL with HTML sanitization. Used for JAAL web-topology browsing.

```http
GET /jaal/browse?url=https%3A%2F%2Fexample.com
Authorization: Bearer <accessToken>
X-Workspace-Id: ws_abc123
```

**Response:** Sanitized HTML with `Content-Type: text/html; charset=utf-8` and `X-Frame-Options: SAMEORIGIN`.

**Security:**
- SSRF protection: blocks localhost, RFC 1918, link-local addresses, `.local` TLD
- Only `http` and `https` schemes allowed
- HTML sanitized: scripts, iframes, objects, embeds, event handlers stripped
- Response size limit: 5 MB
- Fetch timeout: 10 seconds
- `<base>` tag injected for relative URL resolution

**Errors:**
- `400` — Missing `url` parameter, invalid URL, or blocked protocol
- `401` — Authentication required
- `403` — Blocked host (private/internal address)
- `502` — Fetch error, timeout, response too large, or read error

---

*Generated for Kacheri - AI-Native Document Platform*
