import {
  LITELLM_BASE_URL,
  LITELLM_API_KEY,
  LITELLM_TIMEOUT_MS
} from './aiConfig.js';
import {
  LIGHTRAG_BASE_URL,
  LIGHTRAG_API_KEY,
  LIGHTRAG_TIMEOUT_MS
} from './lightragClient.js';

/**
 * Call LiteLLM proxy for chat completion.
 *
 * @param {Object} params
 * @param {string} params.model
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {number} [params.temperature]
 * @param {Array<any>} [params.tools]
 * @returns {Promise<{ text: string, raw: any }>}
 */
export async function callLiteLLM({ model, messages, temperature, tools }) {
  if (!LITELLM_BASE_URL || !LITELLM_API_KEY) {
    throw new Error('LiteLLM is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LITELLM_TIMEOUT_MS || 20000
  );

  try {
    const response = await fetch(`${LITELLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        tools
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `LiteLLM request failed: ${response.status} ${response.statusText} ${text}`
      );
    }

    const data = await response.json();
    const text =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.delta?.content ||
      '';

    return { text, raw: data };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call LightRAG service for retrieval.
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {number} [params.topK]
 * @param {Object} [params.diagramContext] - Optional diagram context (nodes, edges, etc.)
 * @returns {Promise<Array<{ title?: string, source?: string, snippet: string }>>}
 */
export async function queryLightRAG({ query, topK = 8, diagramContext }) {
  if (!LIGHTRAG_BASE_URL) {
    throw new Error('LightRAG is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LIGHTRAG_TIMEOUT_MS || 10000
  );

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (LIGHTRAG_API_KEY) {
      // Assuming standard bearer token; adjust easily if your deployment differs
      headers.Authorization = `Bearer ${LIGHTRAG_API_KEY}`;
    }

    const body = { query, top_k: topK };
    if (diagramContext) {
      body.context = diagramContext;
    }

    const response = await fetch(`${LIGHTRAG_BASE_URL}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `LightRAG request failed: ${response.status} ${response.statusText} ${text}`
      );
    }

    const data = await response.json();

    // Normalize a few common LightRAG response shapes
    const items = Array.isArray(data.results || data) ? data.results || data : [];

    return items.map((item) => ({
      title: item.title || item.metadata?.title,
      source: item.source || item.metadata?.source,
      snippet: item.snippet || item.text || item.content || ''
    }));
  } finally {
    clearTimeout(timeout);
  }
}


