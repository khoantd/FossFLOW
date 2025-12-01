import { runArchitectAssistant } from './aiArchitectAssistantService.js';
import * as aiConfig from './aiConfig.js';
import * as aiClients from './aiClients.js';

describe('runArchitectAssistant', () => {
  it('throws when feature flag is disabled', async () => {
    jest.spyOn(aiConfig, 'getAiConfigStatus').mockReturnValue({
      enabled: false,
      featureFlagEnabled: false,
      hasLiteLLM: false,
      hasLightRAG: false
    });

    await expect(
      runArchitectAssistant({ question: 'Test' })
    ).rejects.toHaveProperty('code', 'AI_DISABLED');
  });

  it('calls LightRAG and LiteLLM when configured', async () => {
    jest.spyOn(aiConfig, 'getAiConfigStatus').mockReturnValue({
      enabled: true,
      featureFlagEnabled: true,
      hasLiteLLM: true,
      hasLightRAG: true
    });

    jest.spyOn(aiClients, 'queryLightRAG').mockResolvedValue([
      { snippet: 'context snippet', title: 'T1', source: 'S1' }
    ]);

    jest.spyOn(aiClients, 'callLiteLLM').mockResolvedValue({
      text: 'assistant answer',
      raw: { usage: { total_tokens: 42 }, choices: [], created: 0 }
    });

    const result = await runArchitectAssistant({
      question: 'How can I improve this flow?'
    });

    expect(result.answer).toBe('assistant answer');
    expect(result.contexts?.[0].snippet).toBe('context snippet');
    expect(result.meta?.intent).toBe('improve');
  });
});


