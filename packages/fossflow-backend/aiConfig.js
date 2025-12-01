import dotenv from 'dotenv';

// Ensure env vars are loaded when this module is imported
dotenv.config();

// Feature flag to enable/disable AI assistant functionality
export const ENABLE_AI_ASSISTANT = process.env.ENABLE_AI_ASSISTANT === 'true';

// LiteLLM configuration
export const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || '';
export const LITELLM_API_KEY = process.env.LITELLM_API_KEY || '';
export const LITELLM_TIMEOUT_MS = Number(process.env.LITELLM_TIMEOUT_MS || 20000);

// Model + defaults
export const AI_ASSISTANT_MODEL =
  process.env.AI_ASSISTANT_MODEL || 'gpt-4.1-mini';

/**
 * Simple runtime validation so we can decide whether the AI assistant is
 * fully configured. The assistant can still be disabled if `ENABLE_AI_ASSISTANT`
 * is false even when config is present.
 */
export function getAiConfigStatus() {
  const hasLiteLLM = Boolean(LITELLM_BASE_URL && LITELLM_API_KEY);
  // LightRAG configuration is owned by `lightragClient`.
  const hasLightRAG = Boolean(process.env.LIGHTRAG_BASE_URL);

  return {
    enabled: ENABLE_AI_ASSISTANT && hasLiteLLM && hasLightRAG,
    featureFlagEnabled: ENABLE_AI_ASSISTANT,
    hasLiteLLM,
    hasLightRAG
  };
}


