# Product Requirements Document (PRD) – Agentic RAG Tax Agent

**uniqueDocId**: PRD-RAGTaxAgent-20250506  
**projectName**: Agentic RAG Tax Agent  
**projectShortName**: RAGTaxAgent  
**version**: 1.0.0  
**date**: 2025‑05‑06  
**status**: Draft  
**targetAgent**: Cline (CRCT, Memory Bank)  
**authors**: ChatGPT‑PM, IVY (Ivan Yeo)  
**relatedDocs**: Competitive Research Memo – Tax AI Platforms (2025‑05‑05)

---

## 1. Introduction & Overview
The **Agentic RAG Tax Agent** is a lightweight, web‑based assistant that answers Malaysian tax questions in plain language. It combines Retrieval‑Augmented Generation (RAG) with authoritative sources that the developer manually ingests. The goal is to boost tax literacy among Malaysian employees, freelancers, and SME owners by delivering citation‑backed answers in seconds.

---

## 2. Goals & Objectives
| GOAL_ID | Goal | Metric Ref | Rationale |
|---------|------|-----------|-----------|
| **G‑001** | Reach **500 unique users** and **1,500 answered queries** within 90 days of launch. | MET‑001 | Proves product‑market fit and initial traction. |
| **G‑002** | Maintain **≥ 90 % helpful‑vote rate** on chatbot answers during MVP. | MET‑002 | Ensures answer quality and user trust. |
| **G‑003** | Ingest **≥ 50 authoritative documents** in the first month. | MET‑003 | Provides broad coverage of Malaysian tax topics. |
| **G‑004** | Keep **p95 response latency ≤ 2 s**. | MET‑004 | Guarantees responsive UX for conversational flow. |

---

## 3. Target Audience & User Personas
### P‑001 – Practical Taxpayer
* **Description**  25–45 y/o salaried or freelance individual, moderate tech‑savvy. Needs quick relief info for annual filing.
* **Key Needs / Pain Points**
  * Clear, jargon‑free explanations
  * Fear of making costly mistakes
  * Dislikes scrolling long LHDN PDFs

### P‑002 – Startup Founder
* **Description**  Runs a small company, handles bookkeeping personally, time‑poor.
* **Key Needs / Pain Points**
  * Wants clarity on deductible business expenses & PCB rules
  * Needs fast answers during financial planning

### P‑003 – Developer‑Admin
* **Description**  Internal role (you). Feeds docs, monitors quality.
* **Key Needs / Pain Points**
  * One‑click ingestion workflow
  * Visibility into stored documents & feedback

---

## 4. Features & Requirements
### FEAT‑001 – Developer Ingestion Page  
**Priority:** Critical
* **Description**  Hidden route (`/dev‑ingest`) to submit a URL or PDF. System scrapes/parses, chunks (700 tokens, 100 overlap), embeds via Gecko‑004, tags & saves to Weaviate. Shows summary & tags for confirmation.
* **User Story**  _As a Developer‑Admin (P‑003), I want to paste a link or upload a PDF so that the chatbot always answers with up‑to‑date content._
* **Acceptance Criteria**
  * AC‑001‑01  Ingestion succeeds for ≥ 95 % of valid URLs/PDFs < 20 MB.
  * AC‑001‑02  System auto‑generates ≤ 150‑word summary and 3‑7 tags.
  * AC‑001‑03  Confirmation toast shows stored chunk count and metadata.

### FEAT‑002 – Public Chatbot Interface  
**Priority:** Critical
* **Description**  Landing page (`/`) with Chatbot‑UI component. Streams answer and lists source links.
* **User Story**  _As a Practical Taxpayer (P‑001), I want to ask a tax question and get a clear, sourced answer so I can file confidently._
* **Acceptance Criteria**
  * AC‑002‑01  Answer includes at least one hyperlink citation.
  * AC‑002‑02  95 % of responses return < 2 s after first token.
  * AC‑002‑03  “Helpful?” thumbs Up/Down records feedback.

### FEAT‑003 – RAG Retrieval Pipeline  
**Priority:** High
* **Description**  NestJS + LangChain pipeline: embed query → Weaviate search → construct prompt → GPT‑4 answer streaming.
* **User Story**  _As a Startup Founder (P‑002), I need accurate answers grounded in law so I avoid compliance risk._
* **Acceptance Criteria**
  * AC‑003‑01  Retrieval precision ≥ 0.70 on internal benchmark (50 queries).
  * AC‑003‑02  Prompt kept under 4 K tokens to control cost.

### FEAT‑004 – Feedback Analytics  
**Priority:** Medium
* **Description**  Stores thumbs feedback & query text; exportable CSV.
* **User Story**  _As a Developer‑Admin, I want to see down‑voted answers so I can improve the KB._
* **Acceptance Criteria**
  * AC‑004‑01  Feedback stored with timestamp, user‑agent, answer ID.
  * AC‑004‑02  CSV export endpoint protected by secret key.

---

## 5. Non‑Functional Requirements (NFRs)
| NFR_ID | Category | Requirement | Rationale |
|--------|----------|-------------|-----------|
| NFR‑001 | Performance | p95 API latency < 2 s. | Conversational feel. |
| NFR‑002 | Security | HTTPS only; sanitize HTML; CORS allow‑list. | Protect data & prevent XSS. |
| NFR‑003 | Privacy | No PII stored; IP logs max 90 days. | PDPA compliance. |
| NFR‑004 | Accessibility | UI meets WCAG 2.1 AA. | Inclusive design. |
| NFR‑005 | Maintainability | ≥ 80 % unit‑test coverage; ESLint/Prettier. | Reduce tech debt. |
| NFR‑006 | Cost Control | Avg answer cost ≤ USD $0.002. | Budget adherence. |

---

## 6. Design & UI/UX Considerations
| ID | Type | Location | Description |
|----|------|----------|-------------|
| DL‑001 | Wireframes | _Figma link TBA_ | Chatbot (desktop & mobile) and Dev‑ingest page. |
| DL‑002 | Style Guide | _Internal Notion link_ | Tailwind color tokens & typography scale. |

**Principles**  
* **Clarity**  Minimalist card layout, large fonts for legal text.  
* **Feedback**  Typing indicator & success/error toasts.  

---

## 7. Out of Scope
* OOS‑001  Automatic web crawling / scheduled scrapes.  
* OOS‑002  User document uploads for analysis.  
* OOS‑003  Bahasa Malaysia generation (English‑only MVP).  
* OOS‑004  Native iOS/Android apps.  

---

## 8. Success Metrics
| METRIC_ID | Metric | Target | Related Goal | Measurement Method |
|-----------|--------|--------|--------------|--------------------|
| MET‑001 | Unique public users | ≥ 500 / 90 days | G‑001 | Plausible analytics. |
| MET‑002 | Helpful‑vote rate | ≥ 90 % | G‑002 | Firestore feedback logs. |
| MET‑003 | Docs ingested | ≥ 50 by Day 30 | G‑003 | Weaviate metadata count. |
| MET‑004 | p95 latency | ≤ 2 s | G‑004 | New Relic APM traces. |

---

## 9. Open Issues & Questions
| ISSUE_ID | Issue | Owner | Status | Due Date |
|----------|-------|-------|--------|----------|
| ISSUE‑001 | Confirm Vertex AI quota/cost for Gecko‑004. | Engineering | Open | 2025‑05‑10 |
| ISSUE‑002 | Choose Weaviate Cloud vs self‑host on GKE. | DevOps | In Progress | 2025‑05‑12 |
| ISSUE‑003 | Legal review of PDPA implications for IP logs. | Legal | Open | 2025‑05‑15 |

---

## 10. Release Criteria
* All **Critical** & **High** features implemented and pass acceptance tests.  
* NFR‑001, NFR‑002, NFR‑004 verified in staging.  
* No Blocker/Critical bugs open.  
* UAT sign‑off by Product & Legal.  
* Deployment & rollback plan approved.  
* Documentation (Functional, Technical, User) complete.

---

## 11. Glossary
| Term | Definition |
|------|------------|
| **RAG** | Retrieval‑Augmented Generation – combines vector search with an LLM. |
| **LLM** | Large Language Model, e.g. GPT‑4. |
| **Embedding** | Numeric vector representation of text for similarity search. |
| **Gecko‑004** | Google Vertex AI `textembedding‑gecko‑004` embedding model. |
| **Weaviate** | Open‑source vector database for storing embeddings. |
| **LangChain.js** | JavaScript framework for building LLM pipelines. |