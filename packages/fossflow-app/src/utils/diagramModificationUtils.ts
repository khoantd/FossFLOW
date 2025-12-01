import { DiagramData } from '../diagramUtils';
import { DiagramModification } from '../services/aiAssistantService';

/**
 * Generate a unique ID for new nodes/edges.
 */
function generateId(prefix: string, existingIds: Set<string>): string {
  let counter = 1;
  let id = `${prefix}_${counter}`;
  while (existingIds.has(id)) {
    counter++;
    id = `${prefix}_${counter}`;
  }
  return id;
}

/**
 * Get all existing IDs from the diagram.
 */
function getAllIds(diagram: DiagramData): Set<string> {
  const ids = new Set<string>();
  
  // Collect item IDs
  if (Array.isArray(diagram.items)) {
    diagram.items.forEach((item: any) => {
      if (item.id) ids.add(String(item.id));
    });
  }
  
  // Collect view IDs and connector IDs
  if (Array.isArray(diagram.views)) {
    diagram.views.forEach((view: any) => {
      if (view.id) ids.add(String(view.id));
      if (Array.isArray(view.connectors)) {
        view.connectors.forEach((connector: any) => {
          if (connector.id) ids.add(String(connector.id));
        });
      }
    });
  }
  
  return ids;
}

/**
 * Find the view that contains a specific node (by item ID).
 */
function findViewForNode(diagram: DiagramData, nodeId: string): any {
  if (!Array.isArray(diagram.views)) return null;
  
  for (const view of diagram.views) {
    if (Array.isArray(view.items)) {
      const hasNode = view.items.some((item: any) => String(item.id) === String(nodeId));
      if (hasNode) return view;
    }
  }
  
  return null;
}

/**
 * Find connector by ID across all views.
 */
function findConnector(diagram: DiagramData, connectorId: string): { view: any; connector: any } | null {
  if (!Array.isArray(diagram.views)) return null;
  
  for (const view of diagram.views) {
    if (Array.isArray(view.connectors)) {
      for (const connector of view.connectors) {
        if (String(connector.id) === String(connectorId)) {
          return { view, connector };
        }
      }
    }
  }
  
  return null;
}

/**
 * Calculate a reasonable position for a new node.
 * Places it near existing nodes or at a default position.
 */
function calculateNewNodePosition(diagram: DiagramData, suggestedPosition?: { x: number; y: number }): { x: number; y: number } {
  if (suggestedPosition) {
    return { x: suggestedPosition.x, y: suggestedPosition.y };
  }
  
  // Find the first view and calculate position based on existing nodes
  if (Array.isArray(diagram.views) && diagram.views.length > 0) {
    const firstView = diagram.views[0];
    if (Array.isArray(firstView.items) && firstView.items.length > 0) {
      // Find max x and y
      let maxX = 0;
      let maxY = 0;
      firstView.items.forEach((item: any) => {
        if (item.tile) {
          maxX = Math.max(maxX, item.tile.x || 0);
          maxY = Math.max(maxY, item.tile.y || 0);
        }
      });
      // Place new node to the right and slightly below
      return { x: maxX + 2, y: maxY + 2 };
    }
  }
  
  // Default position
  return { x: 0, y: 0 };
}

/**
 * Apply modifications to a diagram and return the updated diagram.
 */
export function applyModifications(
  diagram: DiagramData,
  modifications: DiagramModification[]
): DiagramData {
  if (!modifications || modifications.length === 0) {
    return diagram;
  }

  // Create a deep copy to avoid mutating the original
  const updated: DiagramData = {
    title: diagram.title,
    version: diagram.version,
    description: diagram.description,
    icons: Array.isArray(diagram.icons) ? [...diagram.icons] : [],
    colors: Array.isArray(diagram.colors) ? [...diagram.colors] : [],
    items: Array.isArray(diagram.items) ? diagram.items.map((item: any) => ({ ...item })) : [],
    views: Array.isArray(diagram.views)
      ? diagram.views.map((view: any) => ({
          ...view,
          items: Array.isArray(view.items) ? view.items.map((item: any) => ({ ...item })) : [],
          connectors: Array.isArray(view.connectors)
            ? view.connectors.map((conn: any) => ({ ...conn }))
            : []
        }))
      : [],
    fitToScreen: diagram.fitToScreen
  };

  const existingIds = getAllIds(updated);

  // Process modifications in order: removals first, then modifications, then additions
  const removals = modifications.filter((m) => m.type === 'removeNode' || m.type === 'removeEdge');
  const modifications_list = modifications.filter((m) => m.type === 'modifyNode');
  const additions = modifications.filter(
    (m) => m.type === 'addNode' || m.type === 'addEdge'
  );

  // 1. Apply removals
  for (const mod of removals) {
    if (mod.type === 'removeNode' && mod.id) {
      const nodeId = String(mod.id);
      
      // Remove the item
      updated.items = updated.items.filter((item: any) => String(item.id) !== nodeId);
      
      // Remove from all views
      updated.views.forEach((view: any) => {
        if (Array.isArray(view.items)) {
          view.items = view.items.filter((item: any) => String(item.id) !== nodeId);
        }
        
        // Remove connectors that reference this node
        if (Array.isArray(view.connectors)) {
          view.connectors = view.connectors.filter((connector: any) => {
            if (!Array.isArray(connector.anchors)) return true;
            return !connector.anchors.some((anchor: any) => {
              const refId =
                anchor.ref?.item || anchor.ref?.id || anchor.item || anchor.id;
              return String(refId) === nodeId;
            });
          });
        }
      });
    } else if (mod.type === 'removeEdge' && mod.id) {
      const connectorId = String(mod.id);
      const found = findConnector(updated, connectorId);
      if (found && Array.isArray(found.view.connectors)) {
        found.view.connectors = found.view.connectors.filter(
          (conn: any) => String(conn.id) !== connectorId
        );
      }
    }
  }

  // 2. Apply modifications
  for (const mod of modifications_list) {
    if (mod.type === 'modifyNode' && mod.id && mod.updates) {
      const nodeId = String(mod.id);
      
      // Update the item
      const item = updated.items.find((item) => String(item.id) === nodeId);
      if (item) {
        if (mod.updates.name !== undefined) item.name = mod.updates.name;
        if (mod.updates.description !== undefined)
          item.description = mod.updates.description;
        if (mod.updates.icon !== undefined) item.icon = mod.updates.icon;
        if (mod.updates.tags !== undefined) item.tags = mod.updates.tags;
      }
    }
  }

  // 3. Apply additions
  for (const mod of additions) {
    if (mod.type === 'addNode') {
      // Generate ID if not provided
      const nodeId = mod.id || generateId('node_new', existingIds);
      existingIds.add(nodeId);
      
      // Calculate position
      const position = calculateNewNodePosition(updated, mod.position);
      
      // Create new item
      const newItem: any = {
        id: nodeId,
        name: mod.name || 'New Node',
        description: mod.description,
        icon: mod.icon || 'block'
      };
      if (mod.tags) newItem.tags = mod.tags;
      
      updated.items.push(newItem);
      
      // Add to first view (or create a view if none exists)
      if (updated.views.length === 0) {
        updated.views.push({
          id: 'view1',
          name: 'View1',
          items: [],
          connectors: []
        });
      }
      
      const firstView = updated.views[0];
      if (!Array.isArray(firstView.items)) {
        firstView.items = [];
      }
      
      firstView.items.push({
        id: nodeId,
        tile: position
      });
    } else if (mod.type === 'addEdge') {
      if (!mod.sourceId || !mod.targetId) continue;
      
      const sourceId = String(mod.sourceId);
      const targetId = String(mod.targetId);
      
      // Verify both nodes exist
      const sourceExists = updated.items.some((item: any) => String(item.id) === sourceId);
      const targetExists = updated.items.some((item: any) => String(item.id) === targetId);
      
      if (!sourceExists || !targetExists) {
        console.warn(
          `Cannot add edge: source or target node does not exist (${sourceId} -> ${targetId})`
        );
        continue;
      }
      
      // Find a view that contains both nodes (prefer first view)
      let targetView: any = null;
      for (const view of updated.views) {
        if (Array.isArray(view.items)) {
          const hasSource = view.items.some((item: any) => String(item.id) === sourceId);
          const hasTarget = view.items.some((item: any) => String(item.id) === targetId);
          if (hasSource && hasTarget) {
            targetView = view;
            break;
          }
        }
      }
      
      // If no view has both nodes, use first view
      if (!targetView && updated.views.length > 0) {
        targetView = updated.views[0];
      }
      
      // Create view if none exists
      if (!targetView) {
        targetView = {
          id: 'view1',
          name: 'View1',
          items: [],
          connectors: []
        };
        updated.views.push(targetView);
      }
      
      // Generate connector ID
      const connectorId = mod.id || generateId('edge_new', existingIds);
      existingIds.add(connectorId);
      
      // Create connector
      if (!Array.isArray(targetView.connectors)) {
        targetView.connectors = [];
      }
      
      const newConnector: any = {
        id: connectorId,
        anchors: [
          { id: `${connectorId}_anchor1`, ref: { item: sourceId } },
          { id: `${connectorId}_anchor2`, ref: { item: targetId } }
        ]
      };
      
      // Add label using modern labels array format if provided
      if (mod.label && mod.label.trim().length > 0) {
        const labelId = generateId('label_', existingIds);
        existingIds.add(labelId);
        newConnector.labels = [
          {
            id: labelId,
            text: mod.label.trim(),
            position: 50, // Center position, standard for single labels
            line: '1' // Default line
          }
        ];
      }
      
      targetView.connectors.push(newConnector);
    }
  }

  return updated;
}

