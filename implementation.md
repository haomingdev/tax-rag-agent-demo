# Implementation Plan: Agentic RAG Tax Agent (Local Demo)

## Introduction

This document outlines the implementation plan for the Agentic RAG Tax Agent demo. The goal is to create a functional prototype showcasing core RAG capabilities for a hackathon. The system will run locally using Docker for services like Weaviate and Redis, and will leverage a Google Gemini API Key for embedding and LLM functionalities.

Each phase includes development steps and corresponding Jest unit tests.

## Progress Tracking

**Phase 0: Project Setup & Foundational Configuration**
- [x] **P0.1**: Initialize Monorepo structure (e.g., using Turborepo or Lerna, or simple yarn/npm workspaces).
  - [x] Create `apps/frontend` (Next.js) and `apps/backend` (NestJS) directories.
- [] **P0.2**: Initialize Next.js frontend project (`apps/frontend`).
  - [] Setup with TypeScript, Tailwind CSS, Shadcn/UI.
  - [] Configure ESLint, Prettier.
  - [] Configure Jest for unit testing.
    - [] Write a sample Jest test for a simple component.
    - [] Run tests (e.g., `npm run test` or `yarn test`) and ensure the sample test passes.
- [ ] **P0.3**: Initialize NestJS backend project (`apps/backend`).
  - [ ] Setup with TypeScript.
  - [ ] Configure ESLint, Prettier.
  - [ ] Configure Jest for unit testing.
    - [ ] Write a sample Jest test for a simple service.
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure the sample test passes.
- [ ] **P0.4**: Setup Docker Compose for local development.
  - [ ] Add Weaviate service (referencing `database.md` for schema version, vectorizer 'none').
  - [ ] Add Redis service (for BullMQ).
  - [ ] Ensure Docker services are configurable and can start up correctly.
- [ ] **P0.5**: Configure environment variables for the backend.
  - [ ] Setup `.env` file for `GEMINI_API_KEY`.
  - [ ] Setup configurations for Weaviate connection (URL, scheme).
  - [ ] Setup configurations for Redis connection.
- [ ] **P0.6**: Backend: Implement Weaviate client and schema initialization.
  - [ ] Create a Weaviate client service in NestJS.
  - [ ] Implement logic to create the schema (classes: `IngestJob`, `RawDoc`, `DocChunk`, `ChatInteraction` as per `database.md`) if it doesn't exist on application startup.
    - [ ] Write Jest tests for schema initialization logic (mocking Weaviate client).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure schema initialization tests pass.

**Phase 1: Backend - Data Ingestion Pipeline**
- [ ] **P1.1**: Define Data Transfer Objects (DTOs) for ingestion requests (e.g., URL to ingest).
  - [ ] Add validation (e.g., using `class-validator`).
- [ ] **P1.2**: Implement `IngestionController` (`/api/ingest`).
  - [ ] Endpoint to receive ingestion requests.
  - [ ] Add basic request validation.
    - [ ] Write Jest tests for controller (mocking service).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure controller tests pass.
- [ ] **P1.3**: Setup BullMQ for asynchronous ingestion tasks.
  - [ ] Configure queue and worker processes in NestJS.
    - [ ] Write Jest tests for queue setup and job addition (mocking BullMQ).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure queue tests pass.
- [ ] **P1.4**: Implement `IngestionService` (Core Logic - to be called by BullMQ worker).
  - [ ] **P1.4.1**: Content Fetching:
    - [ ] Implement fetching HTML content using Playwright.
    - [ ] Implement fetching PDF content using `pdf-parse`.
    - [ ] Write Jest tests for content fetching (mocking external libraries).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure content fetching tests pass.
  - [ ] **P1.4.2**: Text Parsing & Cleaning:
    - [ ] Implement HTML to text conversion (e.g., using `html-to-text` or `@extractus/article-extractor`).
    - [ ] Basic text cleaning.
    - [ ] Write Jest tests for text parsing and cleaning.
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure text parsing/cleaning tests pass.
  - [ ] **P1.4.3**: Text Chunking:
    - [ ] Implement text chunking using LangChain text splitters (e.g., `RecursiveCharacterTextSplitter`).
    - [ ] Write Jest tests for text chunking.
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure text chunking tests pass.
  - [ ] **P1.4.4**: Embedding Generation:
    - [ ] Implement embedding generation for text chunks using `GoogleGenerativeAIEmbeddings` (`models/text-embedding-004`) with the Gemini API Key.
    - [ ] Write Jest tests for embedding generation (mocking the embedding API call).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure embedding generation tests pass.
  - [ ] **P1.4.5**: Data Storage:
    - [ ] Implement logic to store `IngestJob`, `RawDoc`, and `DocChunk` (with embeddings) in Weaviate.
    - [ ] Update `IngestJob` status (pending, processing, completed, failed) in Weaviate.
    - [ ] Write Jest tests for data storage (mocking Weaviate client).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure data storage tests pass.
- [ ] **P1.5**: Implement BullMQ Worker to process ingestion jobs using `IngestionService`.
  - [ ] Handle job success and failure, update `IngestJob` status.
    - [ ] Write Jest tests for the worker logic (mocking `IngestionService`).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure worker logic tests pass.

**Phase 2: Backend - RAG Query Pipeline**
- [ ] **P2.1**: Define DTOs for chat requests (e.g., query, sessionId (optional for demo)).
  - [ ] Add validation.
- [ ] **P2.2**: Implement `ChatController` (`/api/chat`).
  - [ ] Endpoint to receive chat queries.
  - [ ] Implement Server-Sent Events (SSE) for streaming responses.
    - [ ] Write Jest tests for controller (mocking service, testing SSE setup if feasible).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure controller tests pass.
- [ ] **P2.3**: Implement `ChatService`.
  - [ ] **P2.3.1**: User Query Embedding:
    - [ ] Embed the user's query using `GoogleGenerativeAIEmbeddings` (`models/text-embedding-004`) with the Gemini API Key.
    - [ ] Write Jest tests (mocking embedding API call).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure query embedding tests pass.
  - [ ] **P2.3.2**: Similarity Search / Document Retrieval:
    - [ ] Perform similarity search against `DocChunk` embeddings in Weaviate (e.g., `nearVector` search).
    - [ ] Retrieve top-k relevant document chunks.
    - [ ] Write Jest tests (mocking Weaviate client).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure similarity search tests pass.
  - [ ] **P2.3.3**: Prompt Engineering & LLM Interaction (LangChain):
    - [ ] Use LangChain.js to construct a RAG chain (e.g., `RetrievalQAChain` or custom equivalent).
    - [ ] Integrate with `ChatGoogleGenerativeAI` (`gemini-2.5-pro-exp-03-25` model) using the Gemini API Key for answer generation.
    - [ ] Ensure citations from retrieved chunks are included in the context/prompt or processed for display.
    - [ ] Implement streaming of the LLM response.
    - [ ] Write Jest tests (mocking LangChain components and LLM calls).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure LLM interaction tests pass.
  - [ ] **P2.3.4**: Store `ChatInteraction`:
    - [ ] Save the prompt, answer, and cited chunk references to Weaviate.
    - [ ] Write Jest tests (mocking Weaviate client).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure chat interaction storage tests pass.

**Phase 3: Frontend - User Interface (Next.js)**
- [ ] **P3.1**: Implement API Client Utility.
  - [ ] Utility functions to call backend `/api/ingest` and `/api/chat` endpoints.
    - [ ] Write Jest tests for API client utility (mocking `fetch`).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure API client tests pass.
- [ ] **P3.2**: Create Ingestion Page (`/ingest` or `/dev-ingest`).
  - [ ] UI with URL input field and submit button.
  - [ ] Display feedback to the user (e.g., 'Ingesting...', 'Success!', 'Error: ...').
  - [ ] Call `/api/ingest` endpoint.
    - [ ] Write Jest tests for Ingestion Page components and logic (mocking API client).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure Ingestion Page tests pass.
- [ ] **P3.3**: Create Chat Page (`/` or `/chat`).
  - [ ] UI with chat input field and send button.
  - [ ] Display chat history (user queries and streamed LLM responses).
  - [ ] Handle SSE for real-time display of streamed responses and citations.
  - [ ] Call `/api/chat` endpoint.
    - [ ] Write Jest tests for Chat Page components and logic (mocking API client and SSE handling).
    - [ ] Run tests (e.g., `npm run test` or `yarn test`) and ensure Chat Page tests pass.

**Phase 4: Integration, Testing & Demo Polish**
- [ ] **P4.1**: Manual End-to-End Testing.
  - [ ] Test ingestion flow with various URLs and PDF files.
  - [ ] Test chat flow with different questions, verify responses and citations.
- [ ] **P4.2**: Basic Error Handling & UI Feedback.
  - [ ] Ensure loading indicators are present for asynchronous operations.
  - [ ] Display user-friendly error messages for common issues (e.g., failed ingestion, chat errors).
- [ ] **P4.3**: Create `README.md`.
  - [ ] Instructions for setting up Google Gemini API Key (`GEMINI_API_KEY` environment variable).
  - [ ] Commands to run the application locally (Docker, backend, frontend).
  - [ ] Example usage for ingestion and chat.
- [ ] **P4.4**: Code Cleanup & Final Review.
  - [ ] Run linters and formatters.
  - [ ] Remove any hardcoded secrets or unnecessary logs.
  - [ ] Ensure all planned Jest tests are passing.

This plan provides a structured approach to developing the demo. We can adjust and add details as we progress through each phase.
