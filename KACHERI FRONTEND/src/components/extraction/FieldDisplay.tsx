// KACHERI FRONTEND/src/components/extraction/FieldDisplay.tsx
// Renders a single extracted field with label, value, and optional confidence badge.
//
// Handles: string, number, boolean, arrays, nested objects.
// Null/undefined renders as em-dash.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 9

import ConfidenceBadge from './ConfidenceBadge.tsx';

type Props = {
  label: string;
  value: unknown;
  confidence?: number;
  depth?: number;
};

const MAX_DEPTH = 3;

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
}

function renderValue(value: unknown, depth: number): JSX.Element {
  if (value === null || value === undefined || value === '') {
    return <span className="field-value empty">{'\u2014'}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="field-value">{value ? 'Yes' : 'No'}</span>;
  }

  if (typeof value === 'number') {
    return <span className="field-value">{String(value)}</span>;
  }

  if (typeof value === 'string') {
    return <span className="field-value">{value}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="field-value empty">{'\u2014'}</span>;
    }
    // Array of primitives → comma-joined list
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return (
        <ul className="field-value-list">
          {value.map((item, i) => (
            <li key={i}>{String(item)}</li>
          ))}
        </ul>
      );
    }
    // Array of objects → render each as nested
    if (depth < MAX_DEPTH) {
      return (
        <div className="field-nested">
          {value.map((item, i) => (
            <div key={i} style={{ marginBottom: i < value.length - 1 ? 6 : 0 }}>
              {typeof item === 'object' && item !== null
                ? renderObject(item as Record<string, unknown>, depth + 1)
                : <span className="field-value">{String(item)}</span>}
            </div>
          ))}
        </div>
      );
    }
    return <span className="field-value">{`[${value.length} items]`}</span>;
  }

  if (typeof value === 'object' && depth < MAX_DEPTH) {
    return (
      <div className="field-nested">
        {renderObject(value as Record<string, unknown>, depth + 1)}
      </div>
    );
  }

  return <span className="field-value">{String(value)}</span>;
}

function renderObject(obj: Record<string, unknown>, depth: number): JSX.Element {
  const entries = Object.entries(obj).filter(
    ([key]) => key !== 'documentType'
  );
  return (
    <>
      {entries.map(([key, val]) => (
        <FieldDisplay key={key} label={key} value={val} depth={depth} />
      ))}
    </>
  );
}

export default function FieldDisplay({ label, value, confidence, depth = 0 }: Props) {
  return (
    <div className="field-display">
      <div className="field-display-row">
        <span className="field-label">{formatLabel(label)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {renderValue(value, depth)}
          {confidence !== undefined && <ConfidenceBadge confidence={confidence} />}
        </div>
      </div>
    </div>
  );
}
