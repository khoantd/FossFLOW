import { useState } from 'react';
import { callAiArchitectAssistant } from '../services/aiAssistantService';

interface AiArchitectHelperProps {
  readonlyMode: boolean;
  diagramId?: string;
  diagramName?: string;
}

const ENABLE_AI_ASSISTANT_UI =
  import.meta.env.VITE_ENABLE_AI_ASSISTANT === 'true';

export function AiArchitectHelper({
  readonlyMode,
  diagramId,
  diagramName
}: AiArchitectHelperProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ENABLE_AI_ASSISTANT_UI) {
    return null;
  }

  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setAnswer('');

    try {
      const response = await callAiArchitectAssistant({
        question: trimmed,
        diagramMetadata: {
          id: diagramId,
          name: diagramName,
          readonly: readonlyMode
        }
      });
      setAnswer(response.answer);
    } catch (err: any) {
      console.error('AI assistant error:', err);
      setError(
        'AI assistant is currently unavailable. Please try again later or check server configuration.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ai-helper-panel">
      <div className="ai-helper-header">
        <span role="img" aria-label="assistant">
          🤖
        </span>{' '}
        <span>AI Architecting Assistant</span>
      </div>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask about this flow, architecture, or improvements..."
        rows={3}
      />
      <div className="ai-helper-actions">
        <button onClick={handleAsk} disabled={isLoading || !question.trim()}>
          {isLoading ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {error && <div className="ai-helper-error">{error}</div>}
      {answer && !error && (
        <div className="ai-helper-answer">
          <div className="ai-helper-answer-label">Assistant</div>
          <div className="ai-helper-answer-body">{answer}</div>
        </div>
      )}
    </div>
  );
}


