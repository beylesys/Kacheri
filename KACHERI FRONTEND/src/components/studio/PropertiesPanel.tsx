// KACHERI FRONTEND/src/components/studio/PropertiesPanel.tsx
// Properties Panel for Edit Mode — renders grouped property editors for the
// selected KCL element, or an empty state when nothing is selected.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 6, Slice F2

import { useState, useCallback, useMemo } from 'react';
import type { KCLEditableSchema, EditableProperty } from '../../kcl/types';
import { renderPropertyEditor } from './PropertyEditors';
import './propertiesPanel.css';

interface PropertiesPanelProps {
  selectedElement: KCLEditableSchema | null;
  onPropertyChange: (property: string, value: unknown) => void;
  /** When true, the Content group text editors are disabled (inline editing active in viewport) */
  inlineEditingActive?: boolean;
}

/** Ordering for property groups */
const GROUP_ORDER: Record<string, number> = {
  content: 0,
  typography: 1,
  layout: 2,
  appearance: 3,
  animation: 4,
  integration: 5,
};

const GROUP_LABELS: Record<string, string> = {
  content: 'Content',
  typography: 'Typography',
  layout: 'Layout',
  appearance: 'Appearance',
  animation: 'Animation',
  integration: 'Integration',
};

function groupProperties(
  properties: EditableProperty[],
): { group: string; label: string; items: EditableProperty[] }[] {
  const map = new Map<string, EditableProperty[]>();

  for (const prop of properties) {
    const group = prop.group || 'content';
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(prop);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99))
    .map(([group, items]) => ({
      group,
      label: GROUP_LABELS[group] || group.charAt(0).toUpperCase() + group.slice(1),
      items,
    }));
}

// ── Collapsible Section ──

function PropertySection({
  group,
  label,
  items,
  onPropertyChange,
  disabled,
}: {
  group: string;
  label: string;
  items: EditableProperty[];
  onPropertyChange: (property: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => setCollapsed((p) => !p), []);

  return (
    <div className="properties-section" data-group={group}>
      <button
        className="properties-section-header"
        onClick={toggle}
        aria-expanded={!collapsed}
      >
        <span className="properties-section-arrow">
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span className="properties-section-label">{label}</span>
        <span className="properties-section-count">{items.length}</span>
      </button>

      {!collapsed && (
        <div
          className={
            'properties-section-body' + (disabled ? ' properties-section-disabled' : '')
          }
        >
          {disabled && (
            <div className="properties-section-disabled-overlay">
              Editing inline...
            </div>
          )}
          {items.map((prop) => (
            <div key={prop.name} className="properties-item">
              <label className="properties-item-label" htmlFor={`prop-${prop.name}`}>
                {prop.label}
              </label>
              <div className="properties-item-editor" id={`prop-${prop.name}`}>
                {renderPropertyEditor(prop, (value) =>
                  onPropertyChange(prop.name, value),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ──

export function PropertiesPanel({
  selectedElement,
  onPropertyChange,
  inlineEditingActive,
}: PropertiesPanelProps) {
  const groups = useMemo(
    () => (selectedElement ? groupProperties(selectedElement.properties) : []),
    [selectedElement],
  );

  // Empty state
  if (!selectedElement) {
    return (
      <div className="properties-panel">
        <div className="properties-empty">
          <div className="properties-empty-icon" aria-hidden="true">
            &#x1F4CB;
          </div>
          <div className="properties-empty-title">No selection</div>
          <div className="properties-empty-desc">
            Click an element in the viewport to edit its properties.
          </div>
        </div>
      </div>
    );
  }

  // Component tag name for display (strip kcl- prefix)
  const displayName = selectedElement.component.replace(/^kcl-/, '');

  return (
    <div className="properties-panel">
      {/* Header */}
      <div className="properties-header">
        <span className="properties-header-component">{selectedElement.component}</span>
        {selectedElement.elementId && (
          <span className="properties-header-id">#{selectedElement.elementId}</span>
        )}
      </div>

      {/* Grouped property editors */}
      <div className="properties-content">
        {groups.map(({ group, label, items }) => (
          <PropertySection
            key={group}
            group={group}
            label={label}
            items={items}
            onPropertyChange={onPropertyChange}
            disabled={inlineEditingActive && group === 'content'}
          />
        ))}
      </div>
    </div>
  );
}
