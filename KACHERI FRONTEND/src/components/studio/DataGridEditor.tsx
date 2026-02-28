// KACHERI FRONTEND/src/components/studio/DataGridEditor.tsx
// Spreadsheet-like grid editor for json-type KCL properties (chart datasets,
// table rows/columns, list items, timeline events).
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 6, Slice F2

import { useState, useCallback, useRef, useEffect } from 'react';

interface DataGridEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
}

// ── Shape Detection ──

type GridShape =
  | { kind: 'chart'; labels: string[]; datasets: { label: string; values: number[]; color?: string }[] }
  | { kind: 'table'; rows: Record<string, unknown>[] }
  | { kind: 'list'; items: unknown[] }
  | { kind: 'raw' };

function detectShape(value: unknown): GridShape {
  if (!value || typeof value !== 'object') return { kind: 'raw' };

  // Chart data: { labels: string[], datasets: [...] }
  if (
    'labels' in (value as any) &&
    'datasets' in (value as any) &&
    Array.isArray((value as any).labels) &&
    Array.isArray((value as any).datasets)
  ) {
    return {
      kind: 'chart',
      labels: (value as any).labels,
      datasets: (value as any).datasets,
    };
  }

  // Array of objects → table rows
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
    return { kind: 'table', rows: value as Record<string, unknown>[] };
  }

  // Array of primitives → simple list
  if (Array.isArray(value)) {
    return { kind: 'list', items: value };
  }

  return { kind: 'raw' };
}

// ── Chart Grid ──

function ChartGrid({
  labels,
  datasets,
  onChange,
}: {
  labels: string[];
  datasets: { label: string; values: number[]; color?: string }[];
  onChange: (value: unknown) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const emit = useCallback(
    (newLabels: string[], newDatasets: typeof datasets) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => onChange({ labels: newLabels, datasets: newDatasets }),
        200,
      );
    },
    [onChange],
  );

  const handleLabelChange = useCallback(
    (idx: number, val: string) => {
      const next = [...labels];
      next[idx] = val;
      emit(next, datasets);
    },
    [labels, datasets, emit],
  );

  const handleValueChange = useCallback(
    (dsIdx: number, valIdx: number, val: string) => {
      const next = datasets.map((ds, i) =>
        i === dsIdx
          ? { ...ds, values: ds.values.map((v, j) => (j === valIdx ? Number(val) || 0 : v)) }
          : ds,
      );
      emit(labels, next);
    },
    [labels, datasets, emit],
  );

  const handleDatasetLabelChange = useCallback(
    (dsIdx: number, val: string) => {
      const next = datasets.map((ds, i) =>
        i === dsIdx ? { ...ds, label: val } : ds,
      );
      emit(labels, next);
    },
    [labels, datasets, emit],
  );

  const addLabel = useCallback(() => {
    const newLabels = [...labels, `Label ${labels.length + 1}`];
    const newDs = datasets.map((ds) => ({
      ...ds,
      values: [...ds.values, 0],
    }));
    emit(newLabels, newDs);
  }, [labels, datasets, emit]);

  const removeLabel = useCallback(
    (idx: number) => {
      if (labels.length <= 1) return;
      const newLabels = labels.filter((_, i) => i !== idx);
      const newDs = datasets.map((ds) => ({
        ...ds,
        values: ds.values.filter((_, i) => i !== idx),
      }));
      emit(newLabels, newDs);
    },
    [labels, datasets, emit],
  );

  const addDataset = useCallback(() => {
    const newDs = [
      ...datasets,
      { label: `Series ${datasets.length + 1}`, values: labels.map(() => 0) },
    ];
    emit(labels, newDs);
  }, [labels, datasets, emit]);

  const removeDataset = useCallback(
    (idx: number) => {
      if (datasets.length <= 1) return;
      emit(labels, datasets.filter((_, i) => i !== idx));
    },
    [labels, datasets, emit],
  );

  return (
    <div className="datagrid">
      <table className="datagrid-table">
        <thead>
          <tr>
            <th className="datagrid-th datagrid-corner" />
            {labels.map((label, i) => (
              <th key={i} className="datagrid-th">
                <input
                  className="datagrid-cell-input"
                  value={label}
                  onChange={(e) => handleLabelChange(i, e.target.value)}
                />
                <button
                  className="datagrid-remove-btn"
                  onClick={() => removeLabel(i)}
                  title="Remove column"
                  aria-label={`Remove ${label}`}
                  disabled={labels.length <= 1}
                >
                  &#x2715;
                </button>
              </th>
            ))}
            <th className="datagrid-th datagrid-add-col">
              <button
                className="datagrid-add-btn"
                onClick={addLabel}
                title="Add column"
                aria-label="Add label"
              >
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((ds, dsIdx) => (
            <tr key={dsIdx}>
              <td className="datagrid-td datagrid-row-label">
                <input
                  className="datagrid-cell-input datagrid-dataset-label"
                  value={ds.label}
                  onChange={(e) => handleDatasetLabelChange(dsIdx, e.target.value)}
                />
                <button
                  className="datagrid-remove-btn"
                  onClick={() => removeDataset(dsIdx)}
                  title="Remove row"
                  aria-label={`Remove ${ds.label}`}
                  disabled={datasets.length <= 1}
                >
                  &#x2715;
                </button>
              </td>
              {ds.values.map((val, valIdx) => (
                <td key={valIdx} className="datagrid-td">
                  <input
                    className="datagrid-cell-input datagrid-cell-number"
                    type="number"
                    value={val}
                    onChange={(e) =>
                      handleValueChange(dsIdx, valIdx, e.target.value)
                    }
                  />
                </td>
              ))}
              <td className="datagrid-td" />
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="datagrid-add-row-btn"
        onClick={addDataset}
        title="Add dataset"
      >
        + Add Series
      </button>
    </div>
  );
}

// ── Table Grid (array of objects) ──

function TableGrid({
  rows,
  onChange,
}: {
  rows: Record<string, unknown>[];
  onChange: (value: unknown) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const columns = Object.keys(rows[0] || {});

  const emit = useCallback(
    (newRows: Record<string, unknown>[]) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(newRows), 200);
    },
    [onChange],
  );

  const handleCellChange = useCallback(
    (rowIdx: number, col: string, val: string) => {
      const next = rows.map((row, i) =>
        i === rowIdx ? { ...row, [col]: val } : row,
      );
      emit(next);
    },
    [rows, emit],
  );

  const addRow = useCallback(() => {
    const empty: Record<string, unknown> = {};
    columns.forEach((c) => (empty[c] = ''));
    emit([...rows, empty]);
  }, [rows, columns, emit]);

  const removeRow = useCallback(
    (idx: number) => {
      if (rows.length <= 1) return;
      emit(rows.filter((_, i) => i !== idx));
    },
    [rows, emit],
  );

  const addColumn = useCallback(() => {
    const colName = `col${columns.length + 1}`;
    const next = rows.map((row) => ({ ...row, [colName]: '' }));
    emit(next);
  }, [rows, columns, emit]);

  const removeColumn = useCallback(
    (col: string) => {
      if (columns.length <= 1) return;
      const next = rows.map((row) => {
        const { [col]: _, ...rest } = row;
        return rest;
      });
      emit(next);
    },
    [rows, columns, emit],
  );

  return (
    <div className="datagrid">
      <table className="datagrid-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} className="datagrid-th">
                <span className="datagrid-col-label">{col}</span>
                <button
                  className="datagrid-remove-btn"
                  onClick={() => removeColumn(col)}
                  title={`Remove ${col}`}
                  aria-label={`Remove column ${col}`}
                  disabled={columns.length <= 1}
                >
                  &#x2715;
                </button>
              </th>
            ))}
            <th className="datagrid-th datagrid-add-col">
              <button
                className="datagrid-add-btn"
                onClick={addColumn}
                title="Add column"
                aria-label="Add column"
              >
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {columns.map((col) => (
                <td key={col} className="datagrid-td">
                  <input
                    className="datagrid-cell-input"
                    value={String(row[col] ?? '')}
                    onChange={(e) =>
                      handleCellChange(rowIdx, col, e.target.value)
                    }
                  />
                </td>
              ))}
              <td className="datagrid-td datagrid-row-actions">
                <button
                  className="datagrid-remove-btn"
                  onClick={() => removeRow(rowIdx)}
                  title="Remove row"
                  aria-label={`Remove row ${rowIdx + 1}`}
                  disabled={rows.length <= 1}
                >
                  &#x2715;
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="datagrid-add-row-btn" onClick={addRow} title="Add row">
        + Add Row
      </button>
    </div>
  );
}

// ── List Grid (array of primitives) ──

function ListGrid({
  items,
  onChange,
}: {
  items: unknown[];
  onChange: (value: unknown) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const emit = useCallback(
    (newItems: unknown[]) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(newItems), 200);
    },
    [onChange],
  );

  const handleChange = useCallback(
    (idx: number, val: string) => {
      const next = items.map((item, i) => (i === idx ? val : item));
      emit(next);
    },
    [items, emit],
  );

  const addItem = useCallback(() => {
    emit([...items, '']);
  }, [items, emit]);

  const removeItem = useCallback(
    (idx: number) => {
      if (items.length <= 1) return;
      emit(items.filter((_, i) => i !== idx));
    },
    [items, emit],
  );

  const moveItem = useCallback(
    (idx: number, direction: -1 | 1) => {
      const target = idx + direction;
      if (target < 0 || target >= items.length) return;
      const next = [...items];
      [next[idx], next[target]] = [next[target], next[idx]];
      emit(next);
    },
    [items, emit],
  );

  return (
    <div className="datagrid datagrid-list">
      {items.map((item, idx) => (
        <div key={idx} className="datagrid-list-row">
          <div className="datagrid-list-order">
            <button
              className="datagrid-order-btn"
              onClick={() => moveItem(idx, -1)}
              disabled={idx === 0}
              aria-label="Move up"
              title="Move up"
            >
              &#x25B2;
            </button>
            <button
              className="datagrid-order-btn"
              onClick={() => moveItem(idx, 1)}
              disabled={idx === items.length - 1}
              aria-label="Move down"
              title="Move down"
            >
              &#x25BC;
            </button>
          </div>
          <input
            className="datagrid-cell-input"
            value={String(item ?? '')}
            onChange={(e) => handleChange(idx, e.target.value)}
          />
          <button
            className="datagrid-remove-btn"
            onClick={() => removeItem(idx)}
            title="Remove item"
            disabled={items.length <= 1}
          >
            &#x2715;
          </button>
        </div>
      ))}
      <button className="datagrid-add-row-btn" onClick={addItem} title="Add item">
        + Add Item
      </button>
    </div>
  );
}

// ── Main DataGridEditor ──

export function DataGridEditor({ value, onChange }: DataGridEditorProps) {
  const shape = detectShape(value);

  switch (shape.kind) {
    case 'chart':
      return (
        <ChartGrid
          labels={shape.labels}
          datasets={shape.datasets}
          onChange={onChange}
        />
      );
    case 'table':
      return <TableGrid rows={shape.rows} onChange={onChange} />;
    case 'list':
      return <ListGrid items={shape.items} onChange={onChange} />;
    default:
      return null;
  }
}
