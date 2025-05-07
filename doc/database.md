---
# Unique identifier for this specific document instance
uniqueDocId: "DB-TAXRAG-20250506"
projectName: "Agentic Malaysia Tax RAG System MVP"
projectShortName: "TAXRAG"
version: "2.0.0" # Schema version, semantic versioning
date: "2025-05-06"
status: "Draft"
targetAgent: "Cline (CRCT, Memory Bank)"
authors:
  - "HM K"
relatedDocs:
  - "PRD-TAXRAG-20250505"
  - "FS-TAXRAG-20250506"
databaseType: "Weaviate"
databaseVersion: "1.23.x"
---

# Database Schema - Agentic Malaysia Tax RAG System MVP

**[AGENT_PROMPT: Parse this Database Schema document. Identify database type, classes, properties (with types, descriptions, module configs), indexes, and relationships. Store this schema information in the memory bank, linked to `uniqueDocId`. Use this schema to generate Weaviate schema‑creation scripts and validate data handling logic specified in FS‑TAXRAG‑20250506.]**

## 1. Overview

This document defines the vector‑database structure for the Agentic Malaysia Tax RAG System MVP (version 2.0.0). It specifies Weaviate classes and properties needed to support ingestion, embedding storage, retrieval, chat interactions, and logging as described in PRD‑TAXRAG‑20250505 and FS‑TAXRAG‑20250506.

* **Database System:** Weaviate 1.23.x (stand‑alone)
* **Schema Version:** 2.0.0
* **Vectorizer:** none (embeddings supplied externally)
* **Distance Metric:** cosine

## 2. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    IngestJob ||--|{ RawDoc : produces
    RawDoc ||--|{ DocChunk : contains
    DocChunk ||--o{ ChatInteraction : cited_in

    class IngestJob {
        UUID jobId PK
        TEXT url
        ENUM status
        DATETIME queuedAt
        DATETIME completedAt
        TEXT errorMessage
    }
    class RawDoc {
        UUID docId PK
        UUID jobId FK
        TEXT sourceUrl
        TEXT title
        DATETIME createdAt
    }
    class DocChunk {
        UUID chunkId PK
        UUID docId FK
        INT chunkIndex
        TEXT text
        VECTOR[768] embedding
        DATETIME createdAt
    }
    class ChatInteraction {
        UUID chatId PK
        TEXT userSessionId
        TEXT prompt
        TEXT answer
        LIST<UUID> citations
        DATETIME askedAt
    }
```

## 3. Class Definitions

### 3.1 Class: `IngestJob`

| Property | Type | Description | Module Config |
|----------|------|-------------|---------------|
| `jobId` | uuid **PK** | Unique job id | `{vectorizer:"none","skip":true}` |
| `url` | text | Submitted URL | |
| `status` | text | Enum `pending|processing|completed|failed` | |
| `queuedAt` | date | Time queued | |
| `completedAt` | date | Nullable finish time | |
| `errorMessage` | text | Nullable error message | |

### 3.2 Class: `RawDoc`

| Property | Type | Description |
|----------|------|-------------|
| `docId` | uuid **PK** | Document id |
| `jobId` | IngestJob (reference) | Link to job |
| `sourceUrl` | text | Original URL |
| `title` | text | Parsed title |
| `createdAt` | date | Timestamp |

Vectorizer skipped.

### 3.3 Class: `DocChunk`

| Property | Type | Description | Notes |
|----------|------|-------------|-------|
| `chunkId` | uuid **PK** | Chunk id |
| `docId` | RawDoc (reference) | Parent doc |
| `chunkIndex` | int | Order |
| `text` | text | Chunk content |
| `embedding` | vector[768] | Supplied vector | distance: cosine |
| `createdAt` | date | Timestamp |

### 3.4 Class: `ChatInteraction`

| Property | Type | Description |
|----------|------|-------------|
| `chatId` | uuid **PK** | Chat id |
| `userSessionId` | text | Frontend session token |
| `prompt` | text | User prompt |
| `answer` | text | Assistant answer |
| `citations` | DocChunk[] (references) | Chunks cited |
| `askedAt` | date | Timestamp |

## 4. Enums / Data Formats

* **statusEnum**: pending, processing, completed, failed (used in `IngestJob.status`)
* **ISODateUTC**: All `date` fields use ISO8601 UTC format.

## 5. Migration Strategy

* **Tool:** Weaviate Schema API via startup script (`schema.ts`) or wcs CLI.
* **Process:** On service boot, check `/v1/schema`; if classes absent, POST class definitions; version tag `2.0.0`.

## 6. Seed Data Strategy

* Provide demo ingestion job + sample doc via `/v1/batch/objects`.
* Script `seed_weaviate.ts` in repo `/scripts/`.

## 7. Document History

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0.0 | 2025‑05‑06 | HM K | Initial relational draft (deprecated) |
| 2.0.0 | 2025‑05‑06 | HM K | Switched to Weaviate vector schema |

---
*End of Database Schema*
