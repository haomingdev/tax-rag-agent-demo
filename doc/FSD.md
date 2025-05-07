# Unique identifier for this specific document instance

uniqueDocId: "FS-TAXRAG-20250506"
projectName: "Agentic Malaysia Tax RAG System MVP"
projectShortName: "TAXRAG"
version: "1.0.5"
date: "2025-05-06"
status: "Draft"
targetAgent: "Cline (CRCT, Memory Bank)"
authors:

- "HM K"
  relatedDocs:
- "PRD-TAXRAG-20250505"
- "DB-TAXRAG-20250510"
- "TS-TAXRAG-20250510"

---

# Functional Specifications - Agentic Malaysia Tax RAG System MVP

## 1. Introduction

This document provides detailed functional specifications for the Agentic Malaysia Tax RAG System MVP defined in PRD‑TAXRAG‑20250505.

## 2. Functional Decomposition

- **F-INGEST**: FUNC‑001–004
- **F-CHAT**: FUNC‑005–007
- **F-CONTENT‑MGMT**: FUNC‑008
- **F-LOG**: FUNC‑009–010

## 3. Detailed Functional Requirements

### 3.1 FUNC‑001 Paste Link UI & URL Validation

_(already detailed earlier)_

### 3.2 FUNC‑002 Web‑Page Crawler + Chunker

- **Description**: Fetch, parse, markdown, chunk (~1k tokens), store.
- **Data Handling**: Input `url`, `jobId`; Output chunk rows.
- **Business Rules**: RULE‑010 size ≤5 MB; RULE‑011 obey robots.txt.
- **Errors**: ERR‑FN002‑01 timeout; ERR‑FN002‑02 robots blocked.
- **Edge Cases**: JS-heavy prerender.

### 3.3 FUNC‑003 Embedding Generation

- **Description**: Batch call Google Text Embedding 004 for each chunk.
- **Data Handling**: Input chunk text; Output embedding vector.
- **Rules**: RULE‑020 retry 2 on 429.
- **Errors**: ERR‑FN003‑01 API error; ERR‑FN003‑02 invalid vector.

### 3.4 FUNC‑004 Vector Store Upsert

- **Description**: Upsert chunk vector + metadata into Weaviate.
- **Errors**: ERR‑FN004‑01 HTTP 5xx retry.

### 3.5 FUNC‑005 Chat UI & Session Manager

- **Description**: Tailwind chat interface, SSE streaming, logs.
- **Rule**: RULE‑101 prompt len 1‑512.

### 3.6 FUNC‑006 Retriever (Similarity Search)

- **Description**: GraphQL nearVector search top‑k 8.
- **Rule**: RULE‑110 score ≥0.15.
- **Errors**: ERR‑FN006‑01 no hits; ERR‑FN006‑02 search fail.

### 3.7 FUNC‑007 LLM Answer Synthesis

- **Description**: LangChain QA chain with citations.
- **Rule**: RULE‑120 must cite ≥1 or fallback.
- **Errors**: ERR‑FN007‑01 LLM 5xx; ERR‑FN007‑02 timeout 15 s.

### 3.8 FUNC‑008 Ingested Document List & Delete

- **Description**: Table list docs; delete action removes DB + vectors.
- **Rule**: RULE‑130 delete immediate.
- **Error**: ERR‑FN008‑01 DB delete fail.

### 3.9 FUNC‑009 Server‑Side Event Logging

- **Description**: Structured JSON logs; rotate daily.

### 3.10 FUNC‑010 Log Dashboard

- **Description**: Frontend filterable log viewer; live updates.

## 4  Use Cases / User Flows

### 4.1 UC‑001  Ingest New URL

| Field | Content |
|-------|---------|
| **USE_CASE_ID** | UC-001 |
| **NAME** | Ingest New URL |
| **ACTOR** | Public User (P‑USER) |
| **RELATED_FUNCTIONS** | FUNC‑001 · FUNC‑002 · FUNC‑003 · FUNC‑004 |
| **PRECONDITIONS** | User can reach `/ingest`; network OK |
| **POSTCONDITIONS** | Chunks embedded & stored; status **ready** |
| **MAIN SUCCESS SCENARIO** | 1 Enter URL (FUNC‑001) → 2 Validate (RULE‑001) → 3 Queue job → 4 Crawler fetch + chunk (FUNC‑002) → 5 Generate embeddings (FUNC‑003) → 6 Upsert to Weaviate (FUNC‑004) → 7 UI shows toast “Ingestion complete”. |
| **ALTERNATIVE FLOWS** | **4.a Invalid URL** → ERR‑FN001‑01 shown, process stops. |
| **ERROR FLOWS** | **4.b Crawler timeout** → ERR‑FN002‑01 logged, toast “Timed out”. |

---

### 4.2 UC‑002  Ask Tax Question

| Field | Content |
|-------|---------|
| **USE_CASE_ID** | UC-002 |
| **NAME** | Ask Tax Question |
| **ACTOR** | Public User (P‑USER) |
| **RELATED_FUNCTIONS** | FUNC‑005 · FUNC‑006 · FUNC‑007 |
| **PRECONDITIONS** | Chat page `/chat` reachable; vectors exist in Weaviate; INT‑001 & INT‑002 up |
| **POSTCONDITIONS** | Answer with citations streamed to user; Q&A logged (FUNC‑009) |
| **MAIN SUCCESS SCENARIO** | 1 User types prompt (FUNC‑005) → 2 Validation (RULE‑101) → 3 System embeds prompt & retrieves context (FUNC‑006) → 4 LLM generates answer with citations (FUNC‑007) → 5 Tokens streamed to UI; citations clickable. |
| **ALTERNATIVE FLOWS** | **3.a No relevant hits** → System returns fallback: “I don’t have enough info …” (ERR‑FN006‑01). |
| **ERROR FLOWS** | **4.b LLM timeout** → ERR‑FN007‑02 logged, toast “Service temporarily unavailable”. |

---

## 5  System Interfaces

### 5.1 INT‑001  Google Text Embedding 004 API

| Attribute | Details |
|-----------|---------|
| **INTERFACE_ID** | INT-001 |
| **SYSTEM_NAME** | Google Vertex AI Text Embedding 004 |
| **DESCRIPTION** | Returns 768‑dimensional embedding vectors for text chunks and user prompts. |
| **DATA_FORMAT** | JSON |
| **PROTOCOL** | REST (HTTPS) |
| **ENDPOINT / METHOD** | `POST /v1/projects/{pid}/locations/us-central1/publishers/google/models/text-embedding-004:predict` |
| **AUTHENTICATION** | OAuth2 service‑account key (see TS‑TAXRAG‑20250510 §Security) |
| **DATA_EXCHANGED** | **Request**: `{"instances":[{"content":"<text>"}]}` · **Response**: `{"predictions":[[<float>…]]}` |
| **ERROR_HANDLING** | Map HTTP 4xx/5xx to ERR‑FN003‑01/02; on 429 use exponential back‑off (max 2 retries). |

---

### 5.2 INT‑002  Weaviate Vector DB

| Attribute | Details |
|-----------|---------|
| **INTERFACE_ID** | INT-002 |
| **SYSTEM_NAME** | Weaviate v1.23 (self‑hosted) |
| **DESCRIPTION** | Vector storage & similarity search for document chunks. |
| **DATA_FORMAT** | JSON |
| **PROTOCOL** | REST (HTTPS) |
| **ENDPOINTS & METHODS** | `POST /v1/objects` (upsert) · `POST /v1/graphql` (search) · `DELETE /v1/objects/{id}` (delete) |
| **AUTHENTICATION** | None for MVP (private network) — future API‑Key support. |
| **DATA_EXCHANGED** | **Upsert**: `{class:"TaxChunk",properties:{docId,chunkIndex,text},vector:[…]}` → returns `{id}`.<br>**Search**: GraphQL query returns `text,docId,chunkIndex,score`. |
| **ERROR_HANDLING** | HTTP 5xx → ERR‑FN004‑01 (upsert) / ERR‑FN006‑02 (search); retry 3 exponential back‑off. |

---

## 6  Non‑Functional Requirements (Functional Impact)

| NFR_ID | Description | Functional Impact |
|--------|-------------|-------------------|
| **NFR‑001** | **Performance** – Chat response ≤ 2 s | Optimize similarity search (FUNC‑006) with HNSW index; stream answer tokens (FUNC‑007). |
| **NFR‑002** | **Security** – No PII storage | Logs (FUNC‑009) must redact IPs; DB & backups encrypted at rest; HTTPS everywhere. |
| **NFR‑003** | **Availability** – 99.5 % | Deploy stateless services in two AZs; health checks on INT‑001 & INT‑002 every 30 s; auto‑restart on failure. |

## 7. Document History

| Version | Date       | Summary                                         |
| ------- | ---------- | ----------------------------------------------- |
| 1.0.5   | 2025‑05‑06 | Full markdown with all units & UC‑002 completed |

---

_End of Functional Specifications_

