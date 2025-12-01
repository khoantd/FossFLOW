# FossFLOW Backend

Optional Express.js server for FossFLOW persistent storage, authentication, and AI assistant features.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in this directory (`packages/fossflow-backend/.env`)

3. Copy the configuration template below and fill in your values

4. Start the server:
```bash
npm start
# or for development with auto-reload:
npm run dev
```

## Environment Configuration

Create a `.env` file in `packages/fossflow-backend/` with the following variables:

### Required for Basic Storage

```env
BACKEND_PORT=3001
ENABLE_SERVER_STORAGE=true
STORAGE_PATH=/data/diagrams
```

### Optional: Authentication

```env
AUTH_ENABLED=false
JWT_SECRET=your-secret-key-here-change-in-production
JWT_EXPIRES_IN=1h
AUTH_COOKIE_NAME=fossflow_auth
AUTH_CORS_ORIGIN=http://localhost:3000
```

### Optional: AI Assistant (LiteLLM + LightRAG)

To enable the AI Architecting Assistant, you need both LiteLLM and LightRAG configured:

```env
# Feature flag
ENABLE_AI_ASSISTANT=true

# LiteLLM Proxy Configuration
LITELLM_BASE_URL=https://your-litellm-proxy-url.com
LITELLM_API_KEY=your-litellm-api-key
LITELLM_TIMEOUT_MS=20000
AI_ASSISTANT_MODEL=gpt-4.1-mini

# LightRAG Knowledge Assistant Configuration
LIGHTRAG_BASE_URL=https://lightrag-latest-xyu3.onrender.com
LIGHTRAG_QUERY_STREAM_PATH=/query/stream
LIGHTRAG_API_KEY=your-lightrag-api-key-if-needed
LIGHTRAG_API_KEY_HEADER=Authorization
LIGHTRAG_API_KEY_PREFIX=Bearer
LIGHTRAG_TIMEOUT_MS=90000
```

## Configuration Details

### LiteLLM Configuration

- **LITELLM_BASE_URL**: Your LiteLLM proxy base URL
  - Example: `https://api.litellm.ai` (cloud)
  - Example: `http://localhost:4000` (self-hosted)
  
- **LITELLM_API_KEY**: Your LiteLLM API key
  - Get this from your LiteLLM provider or self-hosted instance

- **AI_ASSISTANT_MODEL**: The model to use for AI assistant
  - Default: `gpt-4.1-mini`
  - Can be any model supported by your LiteLLM proxy (e.g., `gpt-4`, `claude-3-opus`, etc.)

### LightRAG Configuration

- **LIGHTRAG_BASE_URL**: Your LightRAG service URL
  - Default: `https://lightrag-latest-xyu3.onrender.com`
  - Change this if you're using a different LightRAG instance

- **LIGHTRAG_API_KEY**: Optional API key if your LightRAG instance requires authentication
  - Leave empty if no authentication is needed

- **LIGHTRAG_TIMEOUT_MS**: Timeout for LightRAG queries (default: 90000ms = 90 seconds)
  - Increase if you have slow queries or large knowledge bases

## API Endpoints

### Storage Endpoints
- `GET /api/storage/status` - Check storage status
- `GET /api/diagrams` - List all diagrams
- `GET /api/diagrams/:id` - Get a specific diagram
- `PUT /api/diagrams/:id` - Save/update a diagram
- `POST /api/diagrams` - Create a new diagram
- `DELETE /api/diagrams/:id` - Delete a diagram

### AI Endpoints
- `POST /api/ai/query` - Direct LightRAG knowledge query (streaming)
- `POST /api/ai/architect-assistant` - AI Architecting Assistant (orchestrated: LightRAG + LiteLLM)

### Auth Endpoints (if `AUTH_ENABLED=true`)
- `POST /auth/signup` - Create a new user account
- `POST /auth/login` - Login and get auth token
- `POST /auth/logout` - Logout and clear auth token
- `GET /auth/me` - Get current user info

## Security Notes

- **Never commit your `.env` file** to version control
- Use strong, unique `JWT_SECRET` values in production
- Set `AUTH_COOKIE_SECURE=true` in production (HTTPS required)
- Keep your `LITELLM_API_KEY` and `LIGHTRAG_API_KEY` secret

## Troubleshooting

### AI Assistant not working?

1. Check that `ENABLE_AI_ASSISTANT=true` in your `.env`
2. Verify `LITELLM_BASE_URL` and `LITELLM_API_KEY` are set correctly
3. Verify `LIGHTRAG_BASE_URL` is accessible
4. Check server logs for error messages
5. Test LiteLLM connection: `curl -X POST $LITELLM_BASE_URL/chat/completions -H "Authorization: Bearer $LITELLM_API_KEY" ...`
6. Test LightRAG connection: `curl -X POST $LIGHTRAG_BASE_URL/query/stream ...`

### Storage not working?

1. Ensure `ENABLE_SERVER_STORAGE=true`
2. Check that `STORAGE_PATH` directory exists and is writable
3. Verify file permissions on the storage directory

