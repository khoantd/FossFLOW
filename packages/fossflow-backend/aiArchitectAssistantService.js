import { AI_ASSISTANT_MODEL, getAiConfigStatus } from './aiConfig.js';
import { callLiteLLM, queryLightRAG } from './aiClients.js';

/**
 * @typedef {Object} ArchitectAssistantRequest
 * @property {string} question - User's natural language question.
 * @property {Object} [diagramMetadata] - Optional diagram context (e.g. id, name, tags).
 * @property {string} [sessionId] - Optional session identifier.
 */

/**
 * @typedef {Object} ArchitectAssistantResponse
 * @property {string} answer - Assistant answer text.
 * @property {Array<{ title?: string, source?: string, snippet: string }>} [contexts] - Retrieved context snippets.
 * @property {Object} [meta] - Optional metadata (e.g. model name, usage, debug flags).
 * @property {Array<DiagramModification>} [modifications] - Proposed diagram modifications.
 */

/**
 * @typedef {Object} DiagramModification
 * @property {string} type - Modification type: 'addNode' | 'removeNode' | 'modifyNode' | 'addEdge' | 'removeEdge'
 * @property {string} [id] - Node or edge ID (required for remove, modify operations)
 * @property {string} [name] - Node name (for addNode, modifyNode)
 * @property {string} [description] - Node description (for addNode, modifyNode)
 * @property {string} [icon] - Icon identifier (for addNode, modifyNode)
 * @property {Object} [position] - Position {x, y} for new nodes (for addNode)
 * @property {string} [sourceId] - Source node ID (for addEdge)
 * @property {string} [targetId] - Target node ID (for addEdge)
 * @property {string} [label] - Edge label (for addEdge)
 * @property {Array<string>} [tags] - Node tags (for addNode, modifyNode)
 * @property {Object} [updates] - Updates object for modifyNode {name?, description?, icon?, tags?}
 */

// Phase 0 – Guardrails and basic validation
function ensureAiConfigured() {
  const configStatus = getAiConfigStatus();

  if (!configStatus.featureFlagEnabled) {
    const error = new Error('AI assistant is disabled');
    error.code = 'AI_DISABLED';
    throw error;
  }

  if (!configStatus.enabled) {
    const error = new Error(
      'AI assistant is not fully configured (LiteLLM/LightRAG missing)'
    );
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  return configStatus;
}

// Phase 1 – Interpret request into a simple intent structure
function interpretRequest(payload) {
  const { question, diagramMetadata, sessionId } = payload || {};

  if (!question || typeof question !== 'string') {
    const error = new Error('Question is required');
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  const lower = question.toLowerCase();
  let intent = 'general';

  if (lower.includes('improve') || lower.includes('optimiz')) {
    intent = 'improve';
  } else if (lower.includes('migrate') || lower.includes('refactor')) {
    intent = 'migrate';
  } else if (lower.includes('explain') || lower.includes('what does')) {
    intent = 'explain';
  }

  // Detect if question is about the current diagram vs general knowledge
  const isAboutCurrentDiagram = detectIfAboutCurrentDiagram(lower, diagramMetadata);
  
  // Detect if user is requesting modifications
  const isModificationRequest = detectModificationRequest(lower);

  return {
    question,
    diagramMetadata,
    sessionId,
    intent,
    isAboutCurrentDiagram,
    isModificationRequest
  };
}

/**
 * Detect if the question is about the current diagram or general knowledge/research.
 * Questions about the current diagram should skip LightRAG and use diagram context directly.
 */
function detectIfAboutCurrentDiagram(questionLower, diagramMetadata) {
  // If no diagram metadata/structure, it's not about current diagram
  if (!diagramMetadata) {
    return false;
  }

  // Check if diagram has actual structure (nodes/edges)
  const hasDiagramStructure =
    (Array.isArray(diagramMetadata.nodes) && diagramMetadata.nodes.length > 0) ||
    (Array.isArray(diagramMetadata.edges) && diagramMetadata.edges.length > 0) ||
    diagramMetadata.summary ||
    diagramMetadata.rawItems ||
    diagramMetadata.rawViews;

  if (!hasDiagramStructure) {
    return false;
  }

  // Keywords that indicate question is about current diagram
  const diagramKeywords = [
    'this diagram',
    'this flow',
    'this architecture',
    'current diagram',
    'my diagram',
    'the diagram',
    'these nodes',
    'these connections',
    'this process',
    'the flow',
    'the nodes',
    'the edges',
    'what is in',
    'what are the',
    'show me',
    'list the',
    'explain this',
    'describe this',
    'how does this',
    'what does this',
    'improve this',
    'optimize this',
    'fix this',
    'change this',
    'modify this'
  ];

  // Keywords that indicate general knowledge/research (should use LightRAG)
  const researchKeywords = [
    'what is',
    'what are',
    'define',
    'definition',
    'explain',
    'research',
    'best practice',
    'best practices',
    'how to',
    'guide',
    'tutorial',
    'example',
    'examples',
    'pattern',
    'patterns',
    'architecture pattern',
    'design pattern'
  ];

  // Check for research keywords first (higher priority)
  const hasResearchKeyword = researchKeywords.some((keyword) =>
    questionLower.includes(keyword)
  );

  // Check for diagram-specific keywords
  const hasDiagramKeyword = diagramKeywords.some((keyword) =>
    questionLower.includes(keyword)
  );

  // If it has research keywords and no diagram keywords, it's general knowledge
  if (hasResearchKeyword && !hasDiagramKeyword) {
    return false;
  }

  // If it has diagram keywords, it's about current diagram
  if (hasDiagramKeyword) {
    return true;
  }

  // Default: if diagram structure exists and question doesn't clearly indicate research,
  // assume it's about the current diagram
  return true;
}

/**
 * Detect if the question is requesting diagram modifications.
 */
function detectModificationRequest(questionLower) {
  const modificationKeywords = [
    'add',
    'remove',
    'delete',
    'modify',
    'change',
    'update',
    'create',
    'improve',
    'fix',
    'insert',
    'insert a',
    'insert an',
    'add a',
    'add an',
    'remove the',
    'delete the',
    'modify the',
    'change the',
    'update the',
    'create a',
    'create an',
    'improve the',
    'fix the',
    // Edge/connection-specific keywords
    'connect',
    'link',
    'relationship',
    'connection',
    'connect to',
    'link to',
    'draw edge',
    'add connection',
    'create edge',
    'add relationship',
    'create connection',
    'draw connection',
    'make connection',
    'establish connection',
    'add link',
    'create link'
  ];

  return modificationKeywords.some((keyword) =>
    questionLower.includes(keyword)
  );
}

// Phase 2 – Knowledge retrieval with LightRAG (multi-query + simple re-ranking)
async function retrieveKnowledgeWithLightRAG(interpreted) {
  const queries = buildLightRagQueries(interpreted);

  // Extract diagram context from metadata if available
  const diagramContext = interpreted.diagramMetadata?.nodes ||
    interpreted.diagramMetadata?.edges ||
    interpreted.diagramMetadata?.rawItems ||
    interpreted.diagramMetadata?.rawViews
    ? {
        nodes: interpreted.diagramMetadata.nodes,
        edges: interpreted.diagramMetadata.edges,
        rawItems: interpreted.diagramMetadata.rawItems,
        rawViews: interpreted.diagramMetadata.rawViews,
        summary: interpreted.diagramMetadata.summary
      }
    : null;

  const allContexts = [];

  for (const q of queries) {
    try {
      const results = await queryLightRAG({
        query: q.query,
        topK: q.topK,
        diagramContext
      });
      for (const item of results) {
        allContexts.push({
          ...item,
          _queryLabel: q.label
        });
      }
    } catch (error) {
      // Log and continue – we want partial results rather than failing hard here.
      console.error('LightRAG query failed:', error);
    }
  }

  // Simple relevance scoring: overlap of question tokens with snippet text
  const questionTokens = new Set(
    (interpreted.question || '')
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean)
  );

  const scored = allContexts.map((c, index) => {
    const text = (c.snippet || '').toLowerCase();
    let score = 0;
    questionTokens.forEach((t) => {
      if (text.includes(t)) score += 1;
    });
    // Small bias toward earlier results
    return { ctx: c, score: score - index * 0.01 };
  });

  scored.sort((a, b) => b.score - a.score);

  // Keep only the top N contexts and roughly limit total text length
  const MAX_ITEMS = 10;
  const MAX_CHARS = 8000;
  const selected = [];
  let totalChars = 0;

  for (const { ctx } of scored) {
    const snippet = ctx.snippet || '';
    if (!snippet) continue;
    if (selected.length >= MAX_ITEMS) break;
    if (totalChars + snippet.length > MAX_CHARS) break;
    selected.push(ctx);
    totalChars += snippet.length;
  }

  return selected;
}

// Phase 3 – Prompt construction for LiteLLM
function buildMessagesForLiteLLM(interpreted, contexts) {
  const isAboutCurrentDiagram = interpreted.isAboutCurrentDiagram;
  const isModificationRequest = interpreted.isModificationRequest;
  
  let systemPrompt;
  if (isAboutCurrentDiagram) {
    systemPrompt =
      'You are the FossFLOW AI Architecting Assistant. ' +
      'The user is asking about their CURRENT diagram displayed in the editor. ' +
      'You have access to the complete diagram structure (nodes, edges, connections) provided below. ' +
      'Answer based on the actual diagram structure provided, referencing specific nodes and connections by name. ' +
      'Be specific and concrete about what is in their diagram.';
  } else {
    systemPrompt =
      'You are the FossFLOW AI Architecting Assistant. ' +
      'You help users design, analyze, and improve isometric diagrams, ' +
      'payment and architecture flows using FossFLOW. ' +
      'The user is asking about general knowledge, definitions, or research topics. ' +
      'You MUST ground your answers in the retrieved references when possible, ' +
      'and clearly mark any general advice that is not backed by a reference.';
  }
  
  // Add modification instructions if this is a modification request
  if (isModificationRequest && isAboutCurrentDiagram) {
    systemPrompt +=
      '\n\nIMPORTANT: The user is requesting modifications to their diagram. ' +
      'You MUST provide a structured JSON response with both an answer and a modifications array. ' +
      'Format your response as JSON with this structure:\n' +
      '{\n' +
      '  "answer": "Your natural language explanation of the changes",\n' +
      '  "modifications": [\n' +
      '    { "type": "addNode", "id": "node1", "name": "Node Name", "description": "...", "icon": "block", "position": {"x": 0, "y": 0} },\n' +
      '    { "type": "removeNode", "id": "node2" },\n' +
      '    { "type": "modifyNode", "id": "node3", "updates": {"name": "New Name"} },\n' +
      '    { "type": "addEdge", "id": "edge1", "sourceId": "node1", "targetId": "node2", "label": "connects to" },\n' +
      '    { "type": "removeEdge", "id": "edge2" }\n' +
      '  ]\n' +
      '}\n\n' +
      'Modification types:\n' +
      '- addNode: Add a new node. Requires: id (or generate one), name, position {x, y}. Optional: description, icon, tags\n' +
      '  IMPORTANT: When adding a new node, consider how it relates to existing nodes in the diagram. ' +
      '  If the new node should be connected to existing nodes (which is usually the case in flow diagrams), ' +
      '  you MUST also include addEdge modifications to connect it. For example, if adding a "Payment Gateway" ' +
      '  node between "User" and "Database", include both the addNode and addEdge modifications.\n' +
      '- removeNode: Remove a node. Requires: id\n' +
      '- modifyNode: Modify node properties. Requires: id, updates object with fields to change\n' +
      '- addEdge: Add connection (edge) between nodes. Requires: id (or generate), sourceId, targetId. Optional: label\n' +
      '  The label field (if provided) will be displayed as a center label on the edge, showing the relationship or flow direction. ' +
      '  Examples: "connects to", "sends data to", "authenticates with", "processes via", etc.\n' +
      '  When creating edges:\n' +
      '  - Use sourceId and targetId to reference nodes by their IDs from the diagram\n' +
      '  - If connecting a newly added node, use the ID you generated for that node\n' +
      '  - Always include meaningful labels that describe the relationship or data flow\n' +
      '  - Consider the flow direction: sourceId is the origin, targetId is the destination\n' +
      '- removeEdge: Remove a connection. Requires: id\n\n' +
      'Use existing node IDs from the diagram when referencing them. Generate new IDs for new nodes/edges (e.g., "node_new_1", "edge_new_1"). ' +
      'For positions, use grid coordinates (x, y) where each unit represents one tile. Place new nodes near related existing nodes.\n\n' +
      'Best practices:\n' +
      '- When adding a new node, almost always add edges to connect it to relevant existing nodes\n' +
      '- If the user asks to "add a node between X and Y", create the node AND edges from X to new node AND from new node to Y\n' +
      '- If the user asks to "connect A to B", create an addEdge modification with sourceId=A and targetId=B\n' +
      '- Always provide descriptive labels for edges to clarify relationships';
  }

  const contextText =
    contexts && contexts.length
      ? contexts
          .map((c, idx) => {
            const title = c.title || `Reference ${idx + 1}`;
            const source = c.source ? ` (source: ${c.source})` : '';
            const label = `[R${idx + 1}]`;
            const queryLabel = c._queryLabel ? ` via ${c._queryLabel}` : '';
            return `${label} ${title}${source}${queryLabel}\n${c.snippet}`;
          })
          .join('\n\n')
      : isAboutCurrentDiagram
      ? 'No external knowledge base references were retrieved. Focus on the diagram structure provided.'
      : 'No additional retrieved context was available for this question.';

  let structureInstructions;
  if (isAboutCurrentDiagram) {
    if (isModificationRequest) {
      structureInstructions =
        'The user wants to modify their diagram. ' +
        'Provide a natural language explanation in the "answer" field, then include a "modifications" array with the structured changes. ' +
        'Reference specific nodes by their IDs from the diagram structure provided. ' +
        'Be specific about what you\'re adding, removing, or modifying.';
    } else {
      structureInstructions =
        'Answer the user\'s question about their current diagram. ' +
        'Reference specific nodes, edges, and connections by their actual names/labels from the diagram. ' +
        'Be direct and specific. If the user asks about something not in the diagram, say so clearly.';
    }
  } else {
    structureInstructions =
      'Respond in the following structure:\n' +
      '1. Summary\n' +
      '2. Risks and trade-offs (reference items like [R1], [R2] when relevant)\n' +
      '3. Suggested changes to the FossFLOW diagram (concrete node/connector/label ideas)\n' +
      '4. Implementation notes / next steps\n\n' +
      'If you cannot find relevant references, say so explicitly and answer based on general best practices.';
  }

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Only include LightRAG context if we retrieved any
  if (contexts && contexts.length > 0) {
    messages.push({
      role: 'system',
      content:
        'Retrieved references from the Knowledge Assistant (LightRAG):\n\n' +
        contextText
    });
  }

  messages.push(
    {
      role: 'system',
      content: structureInstructions
    },
    {
      role: 'user',
      content: buildUserMessage(
        interpreted.question,
        interpreted.diagramMetadata,
        interpreted.sessionId
      )
    }
  );

  return messages;
}

// Phase 4 – Orchestration entry point
/**
 * Orchestrate LightRAG retrieval + LiteLLM completion for the AI Architecting Assistant.
 * 
 * Logic:
 * - If question is about current diagram: Skip LightRAG, use diagram context directly
 * - If question is about general knowledge/research: Use LightRAG for knowledge retrieval
 *
 * @param {ArchitectAssistantRequest} payload
 * @returns {Promise<ArchitectAssistantResponse>}
 */
export async function runArchitectAssistant(payload) {
  ensureAiConfigured();

  const interpreted = interpretRequest(payload);
  
  // Only use LightRAG if question is NOT about current diagram (general knowledge/research)
  let contexts = [];
  if (!interpreted.isAboutCurrentDiagram) {
    contexts = await retrieveKnowledgeWithLightRAG(interpreted);
  } else {
    // For current diagram questions, skip LightRAG but log it
    if (process.env.NODE_ENV === 'development') {
      console.log('[AI Assistant] Skipping LightRAG - question is about current diagram');
    }
  }
  
  const messages = buildMessagesForLiteLLM(interpreted, contexts);

  const { text, raw } = await callLiteLLM({
    model: AI_ASSISTANT_MODEL,
    messages,
    temperature: 0.2
  });

  // Strip internal helper fields before returning contexts
  const publicContexts = contexts.map(
    ({ _queryLabel, ...rest }) => rest
  );

  // Parse modifications from response if this was a modification request
  let modifications = null;
  if (interpreted.isModificationRequest) {
    const parsedMods = parseModificationsFromResponse(text);
    if (parsedMods) {
      modifications = validateAndSanitizeModifications(parsedMods);
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[AI Assistant] Parsed ${modifications.length} modifications from response`
        );
      }
    }
  }

  // Extract answer text (remove JSON if present, keep natural language)
  let answerText = text;
  if (interpreted.isModificationRequest && modifications && modifications.length > 0) {
    // Try to extract just the natural language answer, removing JSON blocks
    const jsonBlockRegex = /```(?:json)?\s*\{[\s\S]*?\}\s*```/g;
    answerText = text.replace(jsonBlockRegex, '').trim();
    // If answer is empty after removing JSON, use a default message
    if (!answerText || answerText.length < 10) {
      answerText =
        `I've prepared ${modifications.length} modification(s) for your diagram. ` +
        'Please review and approve the changes below.';
    }
  }

  return {
    answer: answerText,
    contexts: publicContexts,
    modifications: modifications && modifications.length > 0 ? modifications : undefined,
    meta: {
      model: AI_ASSISTANT_MODEL,
      hasContexts: Boolean(publicContexts?.length),
      usage: raw?.usage,
      intent: interpreted.intent,
      isAboutCurrentDiagram: interpreted.isAboutCurrentDiagram,
      isModificationRequest: interpreted.isModificationRequest,
      rawLiteLLMResponseSummary: {
        choices: Array.isArray(raw?.choices) ? raw.choices.length : undefined,
        created: raw?.created
      }
    }
  };
}

function buildSearchQuery(question, diagramMetadata) {
  if (!diagramMetadata) return question;

  const parts = [question];

  if (diagramMetadata.name) {
    parts.push(`Diagram name: ${diagramMetadata.name}`);
  }

  if (diagramMetadata.tags && Array.isArray(diagramMetadata.tags)) {
    parts.push(`Tags: ${diagramMetadata.tags.join(', ')}`);
  }

  if (diagramMetadata.id) {
    parts.push(`Diagram ID: ${diagramMetadata.id}`);
  }

  return parts.join('\n');
}

function buildLightRagQueries(interpreted) {
  const base = buildSearchQuery(
    interpreted.question,
    interpreted.diagramMetadata
  );

  const queries = [
    {
      label: 'direct-question',
      query: base,
      topK: 6
    }
  ];

  if (interpreted.intent === 'improve') {
    queries.push({
      label: 'best-practices',
      query:
        base +
        '\n\nFocus on best practices to improve reliability, scalability, security, and observability of this kind of architecture.',
      topK: 6
    });
  } else if (interpreted.intent === 'migrate') {
    queries.push({
      label: 'migration-patterns',
      query:
        base +
        '\n\nFocus on migration patterns, strangler fig, strangler pattern, incremental rollout, and risk mitigation for this architecture.',
      topK: 6
    });
  } else if (interpreted.intent === 'explain') {
    queries.push({
      label: 'explanation',
      query:
        base +
        '\n\nFocus on clear explanations, conceptual overviews, and simple examples for this kind of architecture.',
      topK: 6
    });
  }

  return queries;
}

/**
 * Parse modifications from AI response text.
 * Handles both pure JSON responses and JSON embedded in markdown code blocks or text.
 */
function parseModificationsFromResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return null;
  }

  try {
    // Try to parse as direct JSON first
    const directParse = JSON.parse(responseText.trim());
    if (directParse.modifications && Array.isArray(directParse.modifications)) {
      return directParse.modifications;
    }
    if (Array.isArray(directParse)) {
      return directParse;
    }
  } catch {
    // Not direct JSON, continue to search for JSON blocks
  }

  // Look for JSON code blocks (```json ... ``` or ``` ... ```)
  const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
  let match;
  while ((match = jsonBlockRegex.exec(responseText)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.modifications && Array.isArray(parsed.modifications)) {
        return parsed.modifications;
      }
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue searching
    }
  }

  // Look for JSON object in the text (less strict, finds { ... } patterns)
  const jsonObjectRegex = /\{[\s\S]*?"modifications"[\s\S]*?\}/;
  const objectMatch = responseText.match(jsonObjectRegex);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (parsed.modifications && Array.isArray(parsed.modifications)) {
        return parsed.modifications;
      }
    } catch {
      // Continue searching
    }
  }

  // Look for standalone modifications array
  const arrayRegex = /\[[\s\S]*?\{[\s\S]*?"type"[\s\S]*?\}[\s\S]*?\]/;
  const arrayMatch = responseText.match(arrayRegex);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
        return parsed;
      }
    } catch {
      // Not valid JSON array
    }
  }

  return null;
}

/**
 * Validate a single modification object.
 */
function validateModification(mod) {
  if (!mod || typeof mod !== 'object') {
    return false;
  }

  const validTypes = ['addNode', 'removeNode', 'modifyNode', 'addEdge', 'removeEdge'];
  if (!validTypes.includes(mod.type)) {
    return false;
  }

  // Validate based on type
  switch (mod.type) {
    case 'addNode':
      return (
        (mod.id || mod.name) && // Either id or name required
        mod.position &&
        typeof mod.position.x === 'number' &&
        typeof mod.position.y === 'number'
      );
    case 'removeNode':
    case 'removeEdge':
      return Boolean(mod.id);
    case 'modifyNode':
      return Boolean(mod.id && mod.updates && typeof mod.updates === 'object');
    case 'addEdge':
      return Boolean(mod.sourceId && mod.targetId);
    default:
      return false;
  }
}

/**
 * Validate and sanitize modifications array.
 */
function validateAndSanitizeModifications(modifications) {
  if (!Array.isArray(modifications)) {
    return [];
  }

  const valid = [];
  for (const mod of modifications) {
    if (validateModification(mod)) {
      // Sanitize: ensure required fields and remove extra fields
      const sanitized = { type: mod.type };

      if (mod.id) sanitized.id = String(mod.id);
      if (mod.name) sanitized.name = String(mod.name);
      if (mod.description) sanitized.description = String(mod.description);
      if (mod.icon) sanitized.icon = String(mod.icon);
      if (mod.position) {
        sanitized.position = {
          x: Number(mod.position.x) || 0,
          y: Number(mod.position.y) || 0
        };
      }
      if (mod.sourceId) sanitized.sourceId = String(mod.sourceId);
      if (mod.targetId) sanitized.targetId = String(mod.targetId);
      if (mod.label) sanitized.label = String(mod.label);
      if (Array.isArray(mod.tags)) {
        sanitized.tags = mod.tags.map((t) => String(t));
      }
      if (mod.updates && typeof mod.updates === 'object') {
        sanitized.updates = {};
        if (mod.updates.name) sanitized.updates.name = String(mod.updates.name);
        if (mod.updates.description)
          sanitized.updates.description = String(mod.updates.description);
        if (mod.updates.icon) sanitized.updates.icon = String(mod.updates.icon);
        if (Array.isArray(mod.updates.tags)) {
          sanitized.updates.tags = mod.updates.tags.map((t) => String(t));
        }
      }

      valid.push(sanitized);
    }
  }

  return valid;
}

function buildUserMessage(question, diagramMetadata, sessionId) {
  const metaLines = [];

  if (sessionId) {
    metaLines.push(`Session ID: ${sessionId}`);
  }

  if (diagramMetadata) {
    // Include basic metadata
    if (diagramMetadata.id || diagramMetadata.name) {
      metaLines.push('Diagram:');
      if (diagramMetadata.name) {
        metaLines.push(`  Name: ${diagramMetadata.name}`);
      }
      if (diagramMetadata.id) {
        metaLines.push(`  ID: ${diagramMetadata.id}`);
      }
    }

    // Include diagram structure if available (nodes, edges, summary)
    if (diagramMetadata.summary) {
      metaLines.push('\nDiagram Structure:');
      metaLines.push(diagramMetadata.summary);
    } else if (diagramMetadata.nodes || diagramMetadata.edges) {
      metaLines.push('\nDiagram Structure:');
      if (diagramMetadata.nodes && Array.isArray(diagramMetadata.nodes)) {
        metaLines.push(`Nodes (${diagramMetadata.nodes.length}):`);
        diagramMetadata.nodes.slice(0, 20).forEach((node) => {
          const label = node.label || node.id || 'unnamed';
          const type = node.type ? ` (${node.type})` : '';
          metaLines.push(`  - ${label}${type}`);
        });
        if (diagramMetadata.nodes.length > 20) {
          metaLines.push(`  ... and ${diagramMetadata.nodes.length - 20} more nodes`);
        }
      }
      if (diagramMetadata.edges && Array.isArray(diagramMetadata.edges)) {
        metaLines.push(`\nEdges (${diagramMetadata.edges.length}):`);
        diagramMetadata.edges.slice(0, 20).forEach((edge) => {
          const label = edge.label ? ` [${edge.label}]` : '';
          metaLines.push(`  - ${edge.sourceId} -> ${edge.targetId}${label}`);
        });
        if (diagramMetadata.edges.length > 20) {
          metaLines.push(`  ... and ${diagramMetadata.edges.length - 20} more edges`);
        }
      }
    }
  }

  const metaBlock = metaLines.length
    ? `\n\n---\n\nDiagram Information:\n${metaLines.join('\n')}`
    : '';

  return `User question:\n${question}${metaBlock}`;
}


