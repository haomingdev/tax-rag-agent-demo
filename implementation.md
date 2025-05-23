# Implementation Plan: Agentic RAG Tax Agent (Local Demo)

## Introduction

This document outlines the implementation plan for the Agentic RAG Tax Agent demo. The goal is to create a functional prototype showcasing core RAG capabilities for a hackathon. The system will run locally using Docker for services like Weaviate and Redis, and will leverage a Google Gemini API Key for embedding and LLM functionalities.

Each phase includes development steps and corresponding Jest unit tests.

## Progress Tracking

**Phase 0: Project Setup & Foundational Configuration**
- [x] **P0.1**: Initialize Monorepo structure (e.g., using Turborepo or Lerna, or simple yarn/npm workspaces).
  - [x] Create `apps/frontend` (Next.js) and `apps/backend` (NestJS) directories.
- [x] **P0.2**: Initialize Next.js frontend project (`apps/frontend`).
  - [x] Setup with TypeScript, Tailwind CSS, Shadcn/UI.
  - [x] Configure ESLint, Prettier.
  - [x] Configure Jest for unit testing.
    - [x] Write a sample Jest test for a simple component.
    - [x] Run tests (e.g., `npm run test` or `yarn test`) and ensure the sample test passes.
- [x] **P0.3**: Initialize NestJS backend project (`apps/backend`).
  - [x] Setup with TypeScript.
  - [x] Configure ESLint, Prettier.
  - [x] Configure Jest for unit testing.
    - [x] Write a sample Jest test for a simple service.
    - [x] Run tests (e.g., `npm run test` or `yarn test`) and ensure the sample test passes.
- [x] **P0.4**: Setup Docker Compose for local development.
  - [x] Add Weaviate service (referencing `database.md` for schema version, vectorizer 'none').
  - [x] Add Redis service (for BullMQ).
  - [x] Ensure Docker services are configurable and can start up correctly.
- [x] **P0.5**: Configure environment variables for the backend.
  - [x] Setup `.env` file for `GEMINI_API_KEY`.
  - [x] Setup configurations for Weaviate connection (URL, scheme).
  - [x] Setup configurations for Redis connection.
- [x] **P0.6**: Backend: Implement Weaviate client and schema initialization.
  - [x] Create a Weaviate client service in NestJS.
  - [x] Implement logic to create the schema (classes: `IngestJob`, `RawDoc`, `DocChunk`, `ChatInteraction` as per `database.md`) if it doesn't exist on application startup.
    - [x] Write Jest tests for schema initialization logic (mocking Weaviate client).
    - [x] Run tests (e.g., `npm run test` or `yarn test`) and ensure schema initialization tests pass.

**Phase 1: Backend - Data Ingestion Pipeline**
- [x] **P1.1**: Define Data Transfer Objects (DTOs) for ingestion requests (e.g., URL to ingest).
  - [x] Add validation (e.g., using `class-validator`).
- [x] **P1.2**: Implement `IngestionController` (`/api/ingest`).
  - [x] Endpoint to receive ingestion requests.
  - [x] Add basic request validation.
    - [x] Write Jest tests for controller (mocking service).
    - [x] Run tests (e.g., `npm run test` or `yarn test`) and ensure controller tests pass.
- [x] **P1.3**: Setup BullMQ for asynchronous ingestion tasks.
  - [x] Configure queue and worker processes in NestJS.
    - [x] Write Jest tests for queue setup and job addition (mocking BullMQ).
    - [x] Run tests (e.g., `npm run test` or `yarn test`) and ensure queue tests pass.
- [x] **P1.4**: Implement `IngestionService` (Core Logic - to be called by BullMQ worker).
  - [x] Method to add jobs to the BullMQ queue (this might already be in controller, decide if service layer is needed for this simple step or if controller directly uses queue).
  - [x] **P1.4.1**: Content Fetching:
    - [x] Implement fetching HTML content using Playwright.
    - [x] Implement fetching PDF content using `pdf-parse`.
    - [x] Write Jest tests for content fetching (mocking external libraries).
    - [x] Run tests (e.g., `npm run test` or `yarn test`) and ensure content fetching tests pass.
  - [x] **P1.4.2**: Text Parsing & Cleaning:
    - [x] Implement HTML to text conversion (e.g., using `html-to-text` or `@extractus/article-extractor`).
    - [x] Basic text cleaning.
    - [x] Write Jest tests for text parsing and cleaning.
    - [x] Run tests (e.g., `npm run test` or `yarn test`) and ensure text parsing/cleaning tests pass.
  - [X] **P1.4.3**: Text Chunking:
    - [X] Implement text chunking using LangChain text splitters (e.g., `RecursiveCharacterTextSplitter`).
    - [X] Write Jest tests for text chunking.
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure text chunking tests pass.
  - [X] **P1.4.4**: Embedding Generation:
    - [X] Implement embedding generation for text chunks using `GoogleGenerativeAIEmbeddings` (`models/text-embedding-004`) with the Gemini API Key.
    - [X] Write Jest tests for embedding generation (mocking the embedding API call).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure embedding generation tests pass.
  - [X] **P1.4.5**: Data Storage:
    - [X] Implement logic to store `IngestJob`, `RawDoc`, and `DocChunk` (with embeddings) in Weaviate.
    - [X] Update `IngestJob` status (pending, processing, completed, failed) in Weaviate.
    - [X] Write Jest tests for data storage (mocking Weaviate client).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure data storage tests pass.
- [X] **P1.5**: Implement BullMQ Worker to process ingestion jobs using `IngestionService`.
  - [X] Handle job success and failure, update `IngestJob` status.
    - [X] Write Jest tests for the worker logic (mocking `IngestionService`).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure worker logic tests pass.

**Phase 2: Backend - RAG Query Pipeline**
- [X] **P2.1**: Define DTOs for chat requests (e.g., query, sessionId (optional for demo)).
  - [X] Add validation.
- [X] **P2.2**: Implement `ChatController` (`/api/chat`).
  - [X] Endpoint to receive chat queries.
  - [X] Implement Server-Sent Events (SSE) for streaming responses.
    - [X] Write Jest tests for controller (mocking service, testing SSE setup if feasible).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure controller tests pass.
- [X] **P2.3**: Implement `ChatService`.
  - [X] **P2.3.1**: User Query Embedding:
    - [X] Embed the user's query using `GoogleGenerativeAIEmbeddings` (`models/text-embedding-004`) with the Gemini API Key.
    - [X] Write Jest tests (mocking embedding API call).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure query embedding tests pass.
  - [X] **P2.3.2**: Similarity Search / Document Retrieval:
    - [X] Perform similarity search against `DocChunk` embeddings in Weaviate (e.g., `nearVector` search).
    - [X] Retrieve top-k relevant document chunks.
    - [X] Write Jest tests (mocking Weaviate client).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure similarity search tests pass.
  - [X] **P2.3.3**: Prompt Engineering & LLM Interaction (LangChain):
    - [X] Use LangChain.js to construct a RAG chain (e.g., `RetrievalQAChain` or custom equivalent).
    - [X] Integrate with `ChatGoogleGenerativeAI` (`gemini-1.5-pro-latest` model) using the Gemini API Key for answer generation.
    - [X] Ensure citations from retrieved chunks are included in the context/prompt or processed for display.
    - [X] Implement streaming of the LLM response.
    - [X] Write Jest tests (mocking LangChain components and LLM calls).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure LLM interaction tests pass.
  - [X] **P2.3.4**: Store `ChatInteraction`:
    - [X] Save the prompt, answer, and cited chunk references to Weaviate.
    - [X] Write Jest tests (mocking Weaviate client).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure chat interaction storage tests pass.

**Phase 3: Frontend - User Interface (Next.js)**
- [X] **P3.1**: Implement API Client Utility.
  - [X] Utility functions to call backend `/api/ingest` and `/api/chat` endpoints.
    - [X] Write Jest tests for API client utility (mocking `fetch`).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure API client tests pass.
- [X] **P3.2**: Create Ingestion Page (`/ingest` or `/dev-ingest`).
  - [X] UI with URL input field and submit button.
  - [X] Display feedback to the user (e.g., 'Ingesting...', 'Success!', 'Error: ...').
  - [X] Call `/api/ingest` endpoint.
    - [X] Write Jest tests for Ingestion Page components and logic (mocking API client).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure Ingestion Page tests pass.
- [X] **P3.3**: Create Chat Page (`/` or `/chat`).
  - [X] UI with chat input field and send button.
  - [X] Display chat history (user queries and streamed LLM responses).
  - [X] Handle SSE for real-time display of streamed responses and citations.
  - [X] Call `/api/chat` endpoint.
    - [X] Write Jest tests for Chat Page components and logic (mocking API client and SSE handling).
    - [X] Run tests (e.g., `npm run test` or `yarn test`) and ensure Chat Page tests pass.

**Phase 4: Integration, Testing & Demo Polish**
- [X] **P4.1**: Manual End-to-End Testing.
  - [X] Test ingestion flow with various URLs and PDF files.
  - [X] Test chat flow with different questions, verify responses and citations.
- [X] **P4.2**: Basic Error Handling & UI Feedback.
  - [X] Ensure loading indicators are present for asynchronous operations.
  - [X] Display user-friendly error messages for common issues (e.g., failed ingestion, chat errors).
- [X] **P4.3**: Create `README.md`.
  - [X] Instructions for setting up Google Gemini API Key (`GEMINI_API_KEY` environment variable).
  - [X] Commands to run the application locally (Docker, backend, frontend).
  - [X] Example usage for ingestion and chat.
- [X] **P4.4**: Code Cleanup & Final Review.
  - [X] Run linters and formatters.
  - [X] Remove any hardcoded secrets or unnecessary logs.
  - [X] Ensure all planned Jest tests are passing.

This plan provides a structured approach to developing the demo. We can adjust and add details as we progress through each phase.
