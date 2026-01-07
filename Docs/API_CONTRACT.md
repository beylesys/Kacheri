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
  }
}
```

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
  ]
}
```

**Errors:**
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
  "pendingCount": 5
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
| `type` | string | Filter by job type (export:pdf, verify:export, etc.) |
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
      "type": "export:pdf",
      "docId": "doc123",
      "userId": "user:local",
      "payload": {},
      "status": "completed",
      "priority": 0,
      "attempts": 1,
      "maxAttempts": 3,
      "createdAt": 1735559000000,
      "startedAt": 1735559001000,
      "completedAt": 1735559005000,
      "error": null,
      "result": { "path": "..." }
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
    "type": "export:pdf",
    "docId": "doc123",
    "userId": "user:local",
    "payload": {},
    "status": "completed",
    "priority": 0,
    "attempts": 1,
    "maxAttempts": 3,
    "createdAt": 1735559000000,
    "startedAt": 1735559001000,
    "completedAt": 1735559005000,
    "error": null,
    "result": { "path": "..." }
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
- `export:pdf` - Generate PDF export
- `export:docx` - Generate DOCX export
- `verify:export` - Verify export artifact hash
- `verify:compose` - Verify compose action determinism
- `import:file` - Import uploaded file
- `cleanup:orphan` - Clean orphaned artifacts

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

**Status Values:**
- `healthy` - All dependencies are available
- `degraded` - Some dependencies are unavailable but service is functional
- `unhealthy` - Critical dependencies are unavailable

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

---

#### Debug: Document IDs with Proof Counts (Dev Only)

```http
GET /__debug/docIds
```

**Response:** List of documents with proof counts

---

#### Debug: Raw Provenance (Dev Only)

```http
GET /__debug/doc/:id/provRaw
```

**Response:** Raw provenance data for document

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
| `workspace:member:added` | Server → Client | Member joined workspace |
| `workspace:member:removed` | Server → Client | Member left workspace |

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
| `notificationType` | Type: `mention`, `comment_reply`, `doc_shared`, `suggestion_pending` |
| `title` | Short notification title |
| `ts` | Unix timestamp in milliseconds |

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

*Generated for Kacheri - AI-Native Document Platform*
