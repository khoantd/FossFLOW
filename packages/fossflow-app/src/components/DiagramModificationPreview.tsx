import { useState } from 'react';
import { DiagramModification } from '../services/aiAssistantService';
import './DiagramModificationPreview.css';

interface DiagramModificationPreviewProps {
  modifications: DiagramModification[];
  onApply: (modifications: DiagramModification[]) => void;
  onReject: () => void;
}

export function DiagramModificationPreview({
  modifications,
  onApply,
  onReject
}: DiagramModificationPreviewProps) {
  const [selectedMods, setSelectedMods] = useState<Set<number>>(
    new Set(modifications.map((_, index) => index))
  );

  const toggleModification = (index: number) => {
    const newSelected = new Set(selectedMods);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedMods(newSelected);
  };

  const handleApplySelected = () => {
    const modsToApply = modifications.filter((_, index) => selectedMods.has(index));
    onApply(modsToApply);
  };

  const handleApplyAll = () => {
    onApply(modifications);
  };

  const handleRejectAll = () => {
    onReject();
  };

  // Group modifications by type
  const additions = modifications.filter(
    (m) => m.type === 'addNode' || m.type === 'addEdge'
  );
  const removals = modifications.filter(
    (m) => m.type === 'removeNode' || m.type === 'removeEdge'
  );
  const modifications_list = modifications.filter((m) => m.type === 'modifyNode');

  const getModificationDescription = (mod: DiagramModification, index: number): string => {
    switch (mod.type) {
      case 'addNode':
        return `Add node "${mod.name || mod.id || 'unnamed'}"${mod.position ? ` at (${mod.position.x}, ${mod.position.y})` : ''}`;
      case 'removeNode':
        return `Remove node "${mod.id || 'unknown'}"`;
      case 'modifyNode':
        const updates = Object.keys(mod.updates || {}).join(', ');
        return `Modify node "${mod.id || 'unknown'}": ${updates}`;
      case 'addEdge':
        return `Add edge from "${mod.sourceId}" to "${mod.targetId}"${mod.label ? ` (${mod.label})` : ''}`;
      case 'removeEdge':
        return `Remove edge "${mod.id || 'unknown'}"`;
      default:
        return `Unknown modification: ${mod.type}`;
    }
  };

  const getModificationIcon = (type: string): string => {
    switch (type) {
      case 'addNode':
      case 'addEdge':
        return '➕';
      case 'removeNode':
      case 'removeEdge':
        return '➖';
      case 'modifyNode':
        return '✏️';
      default:
        return '•';
    }
  };

  return (
    <div className="diagram-modification-preview">
      <div className="modification-preview-header">
        <h3>Proposed Diagram Modifications</h3>
        <div className="modification-summary">
          {additions.length > 0 && (
            <span className="summary-item additions">
              {additions.length} addition{additions.length !== 1 ? 's' : ''}
            </span>
          )}
          {removals.length > 0 && (
            <span className="summary-item removals">
              {removals.length} removal{removals.length !== 1 ? 's' : ''}
            </span>
          )}
          {modifications_list.length > 0 && (
            <span className="summary-item modifications">
              {modifications_list.length} modification{modifications_list.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="modification-list">
        {modifications.map((mod, index) => {
          const isSelected = selectedMods.has(index);
          return (
            <div
              key={index}
              className={`modification-item ${mod.type} ${isSelected ? 'selected' : ''}`}
            >
              <label className="modification-checkbox">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleModification(index)}
                />
                <span className="modification-icon">{getModificationIcon(mod.type)}</span>
                <span className="modification-description">
                  {getModificationDescription(mod, index)}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      <div className="modification-actions">
        <button
          className="action-button apply-all"
          onClick={handleApplyAll}
          title="Apply all modifications"
        >
          Apply All
        </button>
        <button
          className="action-button apply-selected"
          onClick={handleApplySelected}
          disabled={selectedMods.size === 0}
          title={`Apply ${selectedMods.size} selected modification(s)`}
        >
          Apply Selected ({selectedMods.size})
        </button>
        <button
          className="action-button reject-all"
          onClick={handleRejectAll}
          title="Reject all modifications"
        >
          Reject All
        </button>
      </div>
    </div>
  );
}

