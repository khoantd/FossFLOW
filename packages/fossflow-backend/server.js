import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { callLightRagQueryStream } from './lightragClient.js';
import { AUTH_CORS_ORIGIN, AUTH_ENABLED } from './authConfig.js';
import { createUser, findUserByEmail, validateUserCredentials } from './userStore.js';
import { clearAuthCookie, setAuthCookie, verifyUserToken } from './authJwt.js';
import { attachUserIfPresent } from './authMiddleware.js';
import { ENABLE_AI_ASSISTANT } from './aiConfig.js';
import { runArchitectAssistant } from './aiArchitectAssistantService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the backend package directory
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Configuration from environment variables
const STORAGE_ENABLED = process.env.ENABLE_SERVER_STORAGE === 'true';
// Default to project's data/diagrams for local dev, or use env var (e.g., /data/diagrams for Docker)
const STORAGE_PATH =
  process.env.STORAGE_PATH ||
  path.join(__dirname, '..', '..', 'data', 'diagrams');
const ENABLE_GIT_BACKUP = process.env.ENABLE_GIT_BACKUP === 'true';

// Middleware
const corsOptions = AUTH_CORS_ORIGIN
  ? {
      origin: AUTH_CORS_ORIGIN.split(',').map((origin) => {
        return origin.trim();
      }),
      credentials: true
    }
  : undefined;

if (corsOptions) {
  app.use(cors(corsOptions));
} else {
  app.use(cors());
}
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(attachUserIfPresent);

// Health check / Storage status endpoint
app.get('/api/storage/status', (req, res) => {
  res.json({
    enabled: STORAGE_ENABLED,
    gitBackup: ENABLE_GIT_BACKUP,
    version: '1.0.0'
  });
});

// Auth endpoints
if (AUTH_ENABLED) {
  app.post('/auth/signup', async (req, res) => {
    const { email, password, name } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 8 characters long' });
    }

    try {
      const user = await createUser({ email, password, name });
      const token = setUserTokenCookie(res, user);

      return res.status(201).json({
        user,
        tokenSet: Boolean(token)
      });
    } catch (error) {
      if (error.message === 'USER_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      // eslint-disable-next-line no-console
      console.error('[POST /auth/signup] Error:', error);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    try {
      const user = await validateUserCredentials(email, password);

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = setUserTokenCookie(res, user);

      return res.json({
        user,
        tokenSet: Boolean(token)
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /auth/login] Error:', error);
      return res.status(500).json({ error: 'Failed to log in' });
    }
  });

  app.post('/auth/logout', (req, res) => {
    clearAuthCookie(res);
    return res.json({ success: true });
  });

  app.get('/auth/me', (req, res) => {
    const token = req.cookies?.fossflow_auth;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = verifyUserToken(token);
      const fullUser = findUserByEmail(user.email) ?? {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: null
      };

      return res.json({
        user: {
          id: fullUser.id,
          email: fullUser.email,
          name: fullUser.name,
          createdAt: fullUser.createdAt
        }
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /auth/me] Error verifying token:', error);
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
  });
} else {
  // When auth is disabled, keep endpoints present but return a clear message.
  app.post('/auth/signup', (req, res) => {
    return res
      .status(503)
      .json({ error: 'Authentication is disabled on this server' });
  });

  app.post('/auth/login', (req, res) => {
    return res
      .status(503)
      .json({ error: 'Authentication is disabled on this server' });
  });

  app.post('/auth/logout', (req, res) => {
    return res
      .status(503)
      .json({ error: 'Authentication is disabled on this server' });
  });

  app.get('/auth/me', (req, res) => {
    return res
      .status(503)
      .json({ error: 'Authentication is disabled on this server' });
  });
}

function setUserTokenCookie(res, user) {
  try {
    const token = setAuthCookieAndReturn(res, user);
    return token;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[auth] Failed to sign JWT token:', error);
    return null;
  }
}

function setAuthCookieAndReturn(res, user) {
  const { signUserToken, setAuthCookie: setCookie } = requireAuthJwt();
  const token = signUserToken(user);
  setCookie(res, token);
  return token;
}

function requireAuthJwt() {
  // Dynamic import helper to avoid potential import cycles in some bundlers
  // while keeping types and behavior explicit.
  // eslint-disable-next-line global-require
  const jwtModule = require('./authJwt.js');
  return {
    signUserToken: jwtModule.signUserToken,
    setAuthCookie: jwtModule.setAuthCookie
  };
}

// AI assistant endpoint backed by LightRAG query/stream API
app.post('/api/ai/query', async (req, res) => {
  const { query, diagramContext, options } = req.body ?? {};

  if (!query || typeof query !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing required field "query" (string).' });
  }

  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[POST /api/ai/query] Incoming diagramContext snapshot:', {
        hasContext: Boolean(diagramContext),
        diagramId: diagramContext?.diagramId,
        nodeCount: Array.isArray(diagramContext?.nodes)
          ? diagramContext.nodes.length
          : undefined,
        edgeCount: Array.isArray(diagramContext?.edges)
          ? diagramContext.edges.length
          : undefined
      });
    }

    const result = await callLightRagQueryStream({
      query,
      diagramContext,
      options
    });

    const includeRawChunks =
      process.env.LIGHTRAG_INCLUDE_RAW === 'true';

    return res.json({
      answer: result.answer,
      raw: includeRawChunks ? result.chunks : undefined
    });
  } catch (error) {
    // Normalize error output to avoid leaking internal details while
    // still giving enough information for debugging.
    const status =
      typeof error.status === 'number' && error.status >= 400
        ? error.status
        : 502;

    let message = 'Failed to query AI assistant';
    
    if (error.code === 'LIGHTRAG_TIMEOUT') {
      message = 'Upstream LightRAG request timed out';
    } else if (error.status === 401) {
      message = 'LightRAG authentication failed. Please check your LIGHTRAG_API_KEY in .env';
    } else if (error.status === 404) {
      message = 'LightRAG endpoint not found. Please verify LIGHTRAG_BASE_URL and LIGHTRAG_QUERY_STREAM_PATH';
    }

    console.error('[POST /api/ai/query] LightRAG error:', {
      message: error.message,
      code: error.code,
      status: error.status,
      config: error.config,
      body: error.body
    });

    return res.status(status).json({
      error: message,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Orchestrated AI Architecting Assistant endpoint (LiteLLM + LightRAG)
app.post('/api/ai/architect-assistant', async (req, res) => {
  if (!ENABLE_AI_ASSISTANT) {
    return res.status(503).json({
      error: 'AI assistant is disabled',
      code: 'AI_DISABLED'
    });
  }

  try {
    const { question, diagramMetadata, sessionId } = req.body ?? {};
    const result = await runArchitectAssistant({
      question,
      diagramMetadata,
      sessionId
    });
    return res.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/ai/architect-assistant] Error:', error);

    const code = error.code || 'AI_INTERNAL_ERROR';
    const statusCode =
      code === 'INVALID_REQUEST'
        ? 400
        : code === 'AI_DISABLED' || code === 'AI_NOT_CONFIGURED'
        ? 503
        : 500;

    return res.status(statusCode).json({
      error: 'AI assistant request failed',
      code,
      message: error.message
    });
  }
});

// Only enable storage endpoints if storage is enabled
if (STORAGE_ENABLED) {
  // Ensure storage directory exists
  async function ensureStorageDir() {
    try {
      await fs.access(STORAGE_PATH);
      console.log(`Storage directory exists: ${STORAGE_PATH}`);

      // Log current files
      const files = await fs.readdir(STORAGE_PATH);
      console.log(`Current files in storage: ${files.length} files`);
      if (files.length > 0) {
        console.log('Files:', files.join(', '));
      }
    } catch {
      console.log(`Creating storage directory: ${STORAGE_PATH}`);
      await fs.mkdir(STORAGE_PATH, { recursive: true });
      console.log(`Created storage directory: ${STORAGE_PATH}`);
    }
  }

  // Initialize storage
  ensureStorageDir().catch((err) => {
    console.error('Failed to initialize storage:', err);
  });

  // List all diagrams
  app.get('/api/diagrams', async (req, res) => {
    try {
      // First check if storage directory exists
      try {
        await fs.access(STORAGE_PATH);
      } catch (err) {
        console.error(`Storage directory does not exist: ${STORAGE_PATH}`);
        return res.json([]); // Return empty array if directory doesn't exist
      }

      const files = await fs.readdir(STORAGE_PATH);
      console.log(`Found ${files.length} files in ${STORAGE_PATH}:`, files);
      const diagrams = [];

      for (const file of files) {
        if (file.endsWith('.json') && file !== 'metadata.json') {
          try {
            const filePath = path.join(STORAGE_PATH, file);
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);

            // Extract name from various possible locations
            const name = data.name || data.title || 'Untitled Diagram';

            console.log(`Successfully read diagram: ${file} (name: ${name})`);

            diagrams.push({
              id: file.replace('.json', ''),
              name: name,
              lastModified: stats.mtime,
              size: stats.size
            });
          } catch (fileError) {
            console.error(`Error reading diagram file ${file}:`, fileError.message);
            // Skip this file and continue with others
            continue;
          }
        }
      }

      console.log(`Returning ${diagrams.length} diagrams`);
      res.json(diagrams);
    } catch (error) {
      console.error('Error listing diagrams:', error);
      res.status(500).json({ error: 'Failed to list diagrams', details: error.message });
    }
  });

  // Get specific diagram
  app.get('/api/diagrams/:id', async (req, res) => {
    const diagramId = req.params.id;
    console.log(`[GET /api/diagrams/${diagramId}] Loading diagram...`);

    try {
      const filePath = path.join(STORAGE_PATH, `${diagramId}.json`);
      console.log(`[GET /api/diagrams/${diagramId}] Reading from: ${filePath}`);

      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      console.log(`[GET /api/diagrams/${diagramId}] Successfully loaded, size: ${content.length} bytes, items: ${data.items?.length || 0}`);
      res.json(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(`[GET /api/diagrams/${diagramId}] Diagram not found`);
        res.status(404).json({ error: 'Diagram not found' });
      } else {
        console.error(`[GET /api/diagrams/${diagramId}] Error reading diagram:`, error);
        res.status(500).json({ error: 'Failed to read diagram' });
      }
    }
  });

  // Save or update diagram
  app.put('/api/diagrams/:id', async (req, res) => {
    const diagramId = req.params.id;
    console.log(`[PUT /api/diagrams/${diagramId}] Saving diagram...`);

    try {
      const filePath = path.join(STORAGE_PATH, `${diagramId}.json`);
      const data = {
        ...req.body,
        id: diagramId,
        lastModified: new Date().toISOString()
      };

      const iconCount = data.icons?.length || 0;
      const importedIconCount = (data.icons || []).filter(icon => icon.collection === 'imported').length;
      console.log(`[PUT /api/diagrams/${diagramId}] Writing to: ${filePath}`);
      console.log(`[PUT /api/diagrams/${diagramId}]   Items: ${data.items?.length || 0}, Icons: ${iconCount} (${importedIconCount} imported)`);

      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`[PUT /api/diagrams/${diagramId}] Successfully saved`);

      // Git backup if enabled
      if (ENABLE_GIT_BACKUP) {
        // TODO: Implement git commit
        console.log('[PUT] Git backup not yet implemented');
      }

      res.json({ success: true, id: diagramId });
    } catch (error) {
      console.error(`[PUT /api/diagrams/${diagramId}] Error saving diagram:`, error);
      res.status(500).json({ error: 'Failed to save diagram' });
    }
  });

  // Delete diagram
  app.delete('/api/diagrams/:id', async (req, res) => {
    try {
      const filePath = path.join(STORAGE_PATH, `${req.params.id}.json`);
      await fs.unlink(filePath);
      
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Diagram not found' });
      } else {
        console.error('Error deleting diagram:', error);
        res.status(500).json({ error: 'Failed to delete diagram' });
      }
    }
  });

  // Create a new diagram
  app.post('/api/diagrams', async (req, res) => {
    try {
      const id = req.body.id || `diagram_${Date.now()}`;
      const filePath = path.join(STORAGE_PATH, `${id}.json`);
      
      // Check if already exists
      try {
        await fs.access(filePath);
        return res.status(409).json({ error: 'Diagram already exists' });
      } catch {
        // File doesn't exist, proceed
      }
      
      const data = {
        ...req.body,
        id,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };
      
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      res.status(201).json({ success: true, id });
    } catch (error) {
      console.error('Error creating diagram:', error);
      res.status(500).json({ error: 'Failed to create diagram' });
    }
  });

} else {
  // Storage disabled - return appropriate responses
  app.get('/api/diagrams', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
  
  app.get('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
  
  app.put('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
  
  app.delete('/api/diagrams/:id', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
  
  app.post('/api/diagrams', (req, res) => {
    res.status(503).json({ error: 'Server storage is disabled' });
  });
}

// Health check proxy endpoint - bypasses CORS and mixed content restrictions
app.get('/api/proxy/health-check', async (req, res) => {
  const { url, responseField = 'auto' } = req.query;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required parameter: url' });
  }
  
  // Validate URL format
  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  
  // Only allow http and https protocols for security
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are allowed' });
  }
  
  const timeoutMs = 5000; // 5 seconds default timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // Make the actual HTTP request server-side
    const fetchResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'FossFLOW-HealthCheck/1.0'
      },
      signal: controller.signal,
      // Server-side fetch doesn't have CORS restrictions
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId);
    
    // For synthetic mode, just return success if connection was established
    // We don't check response body or status code - only connectivity matters
    if (responseField === 'synthetic') {
      // If we got here, the connection was successful (even if status is 404, 500, etc.)
      return res.json({
        success: true,
        proxied: true,
        status: fetchResponse.status,
        reachable: true,
        message: 'Connectivity verified (synthetic mode)'
      });
    }
    
    // Get response body
    const contentType = fetchResponse.headers.get('content-type') || '';
    let body;
    
    if (contentType.includes('application/json')) {
      try {
        body = await fetchResponse.json();
      } catch {
        // If JSON parsing fails, treat as text
        body = await fetchResponse.text();
      }
    } else {
      body = await fetchResponse.text();
    }
    
    // Check health based on responseField
    let healthy = false;
    let usedField;
    
    if (responseField === 'auto' || responseField === 'success' || responseField === 'status') {
      if (typeof body === 'object' && body !== null) {
        const response = body;
        
        if (responseField === 'success' || responseField === 'auto') {
          if ('success' in response && response.success === true) {
            healthy = true;
            usedField = 'success';
          }
        }
        
        if (!healthy && (responseField === 'status' || responseField === 'auto')) {
          if ('status' in response) {
            const statusValue = response.status;
            if (
              statusValue === true ||
              statusValue === 'healthy' ||
              statusValue === 'ok'
            ) {
              healthy = true;
              usedField = 'status';
            }
          }
        }
      }
    }
    
    // If response field check didn't determine health, use HTTP status code
    if (!healthy && fetchResponse.status >= 200 && fetchResponse.status < 400) {
      healthy = true;
    }
    
    return res.json({
      success: healthy,
      proxied: true,
      status: fetchResponse.status,
      body: body,
      usedField: usedField,
      contentType: contentType
    });
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      // Handle timeout
      if (error.name === 'AbortError') {
        return res.status(504).json({
          error: 'Request timed out',
          proxied: true
        });
      }
      
      // Handle network errors
      return res.status(502).json({
        error: error.message || 'Network error',
        proxied: true
      });
    }
    
    return res.status(500).json({
      error: 'Unknown error occurred',
      proxied: true
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`FossFLOW Backend Server running on port ${PORT}`);
  console.log(`Server storage: ${STORAGE_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (STORAGE_ENABLED) {
    console.log(`Storage path: ${STORAGE_PATH}`);
    console.log(`Git backup: ${ENABLE_GIT_BACKUP ? 'ENABLED' : 'DISABLED'}`);
  }
});