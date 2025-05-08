# Agentic RAG Tax Agent Demo

This project is a demonstration of an Agentic Retrieval Augmented Generation (RAG) system for tax-related queries. It uses a Next.js frontend, a NestJS backend, Weaviate for vector storage, Redis for task queuing, and Google Gemini for embeddings and language model capabilities.

## Prerequisites

- Node.js (v18 or later recommended)
- npm or yarn
- Docker and Docker Compose
- A Google Gemini API Key

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd tax-rag-agent-demo
    ```

2.  **Install root dependencies:**
    This project might use a workspace manager (like npm/yarn workspaces, or Turborepo/Lerna if configured). Check `package.json` at the root. For simple setups, you might need to install dependencies in each app individually.
    Assuming a simple setup (install in each app later if needed):
    ```bash
    # No root install command specified in project structure, skip or adapt as needed
    ```

3.  **Set up Environment Variables:**
    Create a `.env` file in the project root directory (`/tax-rag-agent-demo/.env`):
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    ```
    Replace `your_gemini_api_key_here` with your actual Google Gemini API Key.

4.  **Install Backend Dependencies:**
    ```bash
    cd apps/backend
    npm install
    cd ../..
    ```

5.  **Install Frontend Dependencies:**
    ```bash
    cd apps/frontend
    npm install
    cd ../..
    ```

## Running the Application

1.  **Start Docker Services (Weaviate & Redis):**
    Open a terminal in the project root directory and run:
    ```bash
    docker-compose up -d
    ```
    This will start Weaviate and Redis in detached mode. Wait a few moments for them to initialize.

2.  **Start the Backend (NestJS):**
    Open a new terminal in the project root directory and run:
    ```bash
    cd apps/backend
    npm run start:dev
    ```
    The backend will typically be available at `http://localhost:3001` (or as configured in NestJS).

3.  **Start the Frontend (Next.js):**
    Open another new terminal in the project root directory and run:
    ```bash
    cd apps/frontend
    npm run dev
    ```
    The frontend will typically be available at `http://localhost:3000`.

## Accessing the Application

-   **Frontend UI:** Open your browser and navigate to `http://localhost:3000`
-   **Backend API (Swagger Docs):** The backend might expose Swagger documentation at `http://localhost:3001/api` (or similar, check NestJS configuration).

## Usage

1.  **Ingest Documents:**
    -   Navigate to the `/ingest` page on the frontend (e.g., `http://localhost:3000/ingest`).
    -   Enter a URL of a webpage or a publicly accessible PDF to ingest its content.

2.  **Chat with the Agent:**
    -   Navigate to the main chat page (e.g., `http://localhost:3000/`).
    -   Ask tax-related questions. The system will retrieve relevant information from the ingested documents and generate an answer.

## Stopping the Application

1.  **Stop the Frontend:** Press `Ctrl+C` in the frontend terminal.
2.  **Stop the Backend:** Press `Ctrl+C` in the backend terminal.
3.  **Stop Docker Services:**
    ```bash
    docker-compose down
    ```

## Development Notes

-   **Backend API Endpoints:** Defined in `apps/backend/src` (e.g., `ChatController`, `IngestionController`).
-   **Frontend Pages:** Located in `apps/frontend/src/app`.
-   **Database Schema:** See `doc/database.md` for Weaviate schema details.
-   **Implementation Plan:** See `implementation.md` for project phases and tasks.
