export interface AiAssistantRequest {
  question: string;
  diagramMetadata?: Record<string, any>;
  sessionId?: string;
}

export interface AiAssistantContextItem {
  title?: string;
  source?: string;
  snippet: string;
}

export interface DiagramModification {
  type: 'addNode' | 'removeNode' | 'modifyNode' | 'addEdge' | 'removeEdge';
  id?: string;
  name?: string;
  description?: string;
  icon?: string;
  position?: { x: number; y: number };
  sourceId?: string;
  targetId?: string;
  label?: string;
  tags?: string[];
  updates?: {
    name?: string;
    description?: string;
    icon?: string;
    tags?: string[];
  };
}

export interface AiAssistantResponse {
  answer: string;
  contexts?: AiAssistantContextItem[];
  meta?: {
    model?: string;
    hasContexts?: boolean;
  };
  modifications?: DiagramModification[];
}

function getBackendBaseUrl() {
  const isDevelopment =
    window.location.hostname === 'localhost' &&
    window.location.port === '3000';
  return isDevelopment ? 'http://localhost:3001' : '';
}

export async function callAiArchitectAssistant(
  payload: AiAssistantRequest
): Promise<AiAssistantResponse> {
  const baseUrl = getBackendBaseUrl();

  const response = await fetch(
    `${baseUrl}/api/ai/architect-assistant`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `AI assistant error: ${response.status} ${response.statusText} ${text}`
    );
  }

  return response.json();
}


