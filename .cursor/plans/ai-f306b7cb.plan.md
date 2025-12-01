<!-- f306b7cb-2af8-451f-9b3c-9cbbb697afa5 0217a18c-5846-44be-8965-e79c438c09de -->
# AI Helper with LiteLLM + LightRAG – Implementation Plan (Orchestrator-Focused)

### 1. Discover existing backend and AI-related structures

- **Inspect backend entrypoint**: Review [`packages/fossflow-backend/server.js`](packages/fossflow-backend/server.js) to understand the current Express setup, routing style, and error handling.
- **Check docs for AI/assistant mentions**: Skim [`FOSSFLOW_ENCYCLOPEDIA.md`](FOSSFLOW_ENCYCLOPEDIA.md) and [`FOSSFLOW_TODO.md`](FOSSFLOW_TODO.md) for any references to an AI Helper / architecting assistant to align with planned behavior and avoid conflicts.

### 2. Define configuration for LiteLLM and LightRAG

- **Add environment variables**: Introduce backend env variables (documented in `FOSSFLOW_ENCYCLOPEDIA.md`) such as `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LIGHTRAG_BASE_URL`, and `LIGHTRAG_API_KEY` (or token header name), keeping defaults non-breaking.
- **Create a small config utility**: Add a config module under `packages/fossflow-backend` (e.g. `aiConfig.js/ts`) that reads and validates these env vars, centralizing URL paths, timeouts, and headers.

### 3. Implement backend clients for LiteLLM and LightRAG

- **HTTP client utility**: Either reuse existing HTTP helpers (if present) or add a minimal, dependency-light fetch/axios wrapper consistent with the backend style.
- **LiteLLM client**: Implement a function like `callLiteLLM({ model, messages, temperature, tools })` that:
- Builds the appropriate request payload for the LiteLLM proxy (using your base URL and key).
- Handles errors and timeouts gracefully and returns a normalized response (message text, usage, etc.).
- **LightRAG client**: Implement a function like `queryLightRAG({ query, topK })` that:
- Calls the LightRAG REST endpoint you use for retrieval (e.g. `/query` or similar).
- Normalizes the result into a list of context chunks with titles, source, and snippet text.

### 4. Design the AI Architecting Assistant orchestration (multi-phase) on the backend

The AI Architecting Assistant should act as a **multi-phase orchestrator** that always routes through LightRAG as a "Knowledge Assistant" before generating answers via LiteLLM.

- **Define the assistant contract**: Keep a clear `ArchitectAssistantRequest` / response shape, including:
- `question` (user text),
- optional `diagramMetadata` (id, name, tags, high-level properties),
- optional `sessionId`.
- **Phase 1 – Interpret request**:
- Normalize the incoming payload into an internal intent structure (e.g. explain vs. improve vs. migrate), optionally using a cheap LiteLLM call for classification.
- Extract high-level constraints (e.g. compliance, latency, reliability) from the question when present.
- **Phase 2 – Knowledge retrieval with LightRAG**:
- Build 1–3 focused queries derived from the user question + intent + diagram metadata (e.g. analysis, best practices, specific patterns).
- Call `queryLightRAG` for each query, with sensible `topK` per query.
- Re-rank/filter snippets locally to keep only the most relevant 3–5k tokens overall, preferring conceptual book/doc passages over short fragments.
- **Phase 3 – Prompt construction & generation via LiteLLM**:
- Construct a structured prompt that:
- Introduces the assistant role (FossFLOW AI Architecting Assistant),
- Lists retrieved references as short, numbered items (`[R1]`, `[R2]`, ...),
- Provides the original user question and diagram metadata as separate messages.
- Call `callLiteLLM` with a model like `AI_ASSISTANT_MODEL`, low temperature, and clear instructions to:
- Ground reasoning in retrieved references where possible,
- Mark general/non-referenced advice as such,
- Answer in structured sections (Summary, Risks/Trade-offs, Suggested Diagram Changes, Implementation Notes).
- **Phase 4 – Post-process and shape response**:
- Normalize the model output into `{ answer, contexts, meta }`, where `contexts` is the subset of LightRAG items that were actually surfaced and `meta` includes model name and usage.
- Ensure clear error codes and messages when LightRAG or LiteLLM fail, while keeping the rest of the backend functional.

### 5. Expose a stable backend API endpoint for the frontend

- **Add Express route**: Create an endpoint such as `POST /api/ai/architect-assistant` in `server.js` or a dedicated router file to:
- Validate and parse the incoming request body against the defined contract.
- Call the orchestrator service and return JSON with the assistant’s answer and any additional metadata.
- Map internal errors to safe HTTP responses (4xx/5xx) without leaking secrets.
- **CORS and security**: Ensure the route respects existing CORS and auth patterns; if there is no auth yet, at least ensure rate-limiting and basic validation to avoid misuse.

### 6. Integrate from the frontend app (FossFLOW PWA)

- **Add a thin API client**: In `packages/fossflow-app/src/services` (or similar), add an `aiAssistantService.ts` that calls the new backend endpoint, matching the request/response types.
- **Wire to UI (minimal)**: If an AI Helper UI does not exist yet, add a small, non-intrusive component (e.g. `AiArchitectHelper` under `components/`) that:
- Lets the user type a question.
- Shows loading and error states.
- Displays the answer and possibly related sources.
- **Respect existing UX**: Follow current styling and layout patterns (CSS modules or existing CSS) and mount the helper in an appropriate place (e.g. within `EditorPage.tsx` or a sidebar), keeping behavior backward-compatible.

### 7. Configuration, docs, and quality gates

- **Update documentation**: Extend `FOSSFLOW_ENCYCLOPEDIA.md` (and optionally `FOSSFLOW_TODO.md`) to document the new env vars, the AI Helper endpoint, and how it uses LiteLLM + LightRAG.
- **Add basic tests**: Where feasible, add unit tests in `packages/fossflow-backend` for the orchestrator service (mocking LiteLLM and LightRAG clients) to ensure prompts, multi-phase orchestration, and error handling behave as expected.
- **Run lint and tests**: Execute `npm run lint` and `npm test` (or the project’s equivalents) to ensure the new code passes existing quality checks, and fix any issues found.

### 8. Non-breaking rollout and toggles

- **Feature flag / env toggle**: Guard the AI endpoint and frontend UI behind a flag (e.g. `ENABLE_AI_ASSISTANT` in the backend and `VITE_ENABLE_AI_ASSISTANT` in the frontend) so that in environments without LiteLLM or LightRAG configured, the system degrades gracefully (no UI, or clear "not configured" message).
- **Graceful failure paths**: Ensure that if LiteLLM or LightRAG return errors or time out, the user gets a helpful message while the rest of FossFLOW remains fully functional.

### To-dos

- [ ] Inspect `packages/fossflow-backend/server.js` and core docs to understand current backend architecture and any existing AI-related hooks.
- [ ] Define and document environment variables and config helper for LiteLLM and LightRAG in the backend.
- [ ] Implement LiteLLM and LightRAG client helpers in the backend with proper error handling.
- [ ] Create an AI Architecting Assistant orchestrator service that combines LightRAG retrieval and LiteLLM generation.
- [ ] Expose a backend Express route for the AI Architecting Assistant that uses the orchestrator service.
- [ ] Add a small frontend service and UI component to call the AI assistant endpoint and show results, guarded by a feature flag.
- [ ] Update docs for new env vars and API, add minimal tests for the orchestrator, and run lint/tests.
- [ ] Add an `ENABLE_AI_ASSISTANT` toggle and ensure FossFLOW behaves gracefully when AI services are not configured or fail.