// KACHERI FRONTEND/src/components/studio/PropertyEditors.tsx
// Individual property editor components for each PropertyType in Edit Mode.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 6, Slice F2

import { useState, useCallback, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import type { EditableProperty } from '../../kcl/types';

// ── Shared Interface ──

export interface PropertyEditorProps {
  schema: EditableProperty;
  onChange: (value: unknown) => void;
}

// ── Text Editor ──

function TextEditor({ schema, onChange }: PropertyEditorProps) {
  const [value, setValue] = useState(String(schema.currentValue ?? ''));
  const isMultiline = value.length > 80 || value.includes('\n');

  // Sync external changes
  useEffect(() => {
    setValue(String(schema.currentValue ?? ''));
  }, [schema.currentValue]);

  const commit = useCallback(() => {
    onChange(value);
  }, [onChange, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !isMultiline) {
        e.preventDefault();
        commit();
      }
    },
    [commit, isMultiline],
  );

  if (isMultiline) {
    return (
      <textarea
        className="properties-editor-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        rows={4}
        spellCheck={false}
      />
    );
  }

  return (
    <input
      type="text"
      className="properties-editor-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      spellCheck={false}
    />
  );
}

// ── Color Editor ──

const PRESET_SWATCHES = [
  '#1a1a2e', '#16213e', '#0f3460', '#e94560',
  '#3b82f6', '#10b981', '#f59e0b', '#ffffff',
];

function ColorEditor({ schema, onChange }: PropertyEditorProps) {
  const [color, setColor] = useState(String(schema.currentValue ?? '#000000'));
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setColor(String(schema.currentValue ?? '#000000'));
  }, [schema.currentValue]);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  const handleChange = useCallback(
    (newColor: string) => {
      setColor(newColor);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(newColor), 50);
    },
    [onChange],
  );

  const handleHexInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setColor(val);
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onChange(val), 50);
      }
    },
    [onChange],
  );

  return (
    <div className="properties-editor-color" ref={containerRef}>
      <div className="properties-editor-color-row">
        <button
          className="properties-editor-color-swatch"
          style={{ background: color }}
          onClick={() => setPickerOpen((p) => !p)}
          aria-label="Open color picker"
          title={color}
        />
        <input
          type="text"
          className="properties-editor-input properties-editor-color-hex"
          value={color}
          onChange={handleHexInput}
          maxLength={7}
          spellCheck={false}
        />
      </div>

      {pickerOpen && (
        <div className="properties-editor-color-picker">
          <HexColorPicker color={color} onChange={handleChange} />
          <div className="properties-editor-color-presets">
            {PRESET_SWATCHES.map((sw) => (
              <button
                key={sw}
                className={
                  'properties-editor-color-preset' +
                  (color.toLowerCase() === sw.toLowerCase() ? ' active' : '')
                }
                style={{ background: sw }}
                onClick={() => handleChange(sw)}
                aria-label={`Color ${sw}`}
                title={sw}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Select Editor ──

function SelectEditor({ schema, onChange }: PropertyEditorProps) {
  const value = String(schema.currentValue ?? schema.defaultValue ?? '');

  return (
    <select
      className="properties-editor-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {(schema.options ?? []).map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// ── Number Editor ──

function NumberEditor({ schema, onChange }: PropertyEditorProps) {
  const min = schema.min ?? 0;
  const max = schema.max ?? 999;
  const step = schema.step ?? 1;
  const numValue = Number(schema.currentValue ?? schema.defaultValue ?? min);
  const [localValue, setLocalValue] = useState(String(numValue));

  useEffect(() => {
    setLocalValue(String(Number(schema.currentValue ?? schema.defaultValue ?? min)));
  }, [schema.currentValue, schema.defaultValue, min]);

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      setLocalValue(String(v));
      onChange(v);
    },
    [onChange],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value);
    },
    [],
  );

  const commitInput = useCallback(() => {
    let v = Number(localValue);
    if (isNaN(v)) v = min;
    v = Math.min(max, Math.max(min, v));
    setLocalValue(String(v));
    onChange(v);
  }, [localValue, onChange, min, max]);

  return (
    <div className="properties-editor-number">
      <input
        type="number"
        className="properties-editor-input properties-editor-number-input"
        value={localValue}
        onChange={handleInput}
        onBlur={commitInput}
        min={min}
        max={max}
        step={step}
      />
      <input
        type="range"
        className="properties-editor-number-slider"
        value={numValue}
        onChange={handleSlider}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

// ── Image Editor ──

function ImageEditor({ schema, onChange }: PropertyEditorProps) {
  const [value, setValue] = useState(String(schema.currentValue ?? ''));

  useEffect(() => {
    setValue(String(schema.currentValue ?? ''));
  }, [schema.currentValue]);

  const commit = useCallback(() => {
    onChange(value);
  }, [onChange, value]);

  return (
    <div className="properties-editor-image">
      <input
        type="text"
        className="properties-editor-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="Image URL..."
        spellCheck={false}
      />
      {value && (
        <div className="properties-editor-image-preview">
          <img
            src={value}
            alt="Preview"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Boolean Editor ──

function BooleanEditor({ schema, onChange }: PropertyEditorProps) {
  const checked = Boolean(schema.currentValue);

  return (
    <label className="properties-editor-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="properties-editor-toggle-slider" />
      <span className="properties-editor-toggle-label">
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  );
}

// ── JSON Editor (delegates to DataGridEditor or textarea fallback) ──

import { DataGridEditor } from './DataGridEditor';

function JsonEditor({ schema, onChange }: PropertyEditorProps) {
  const value = schema.currentValue;

  // Determine if value is structured enough for DataGridEditor
  const isStructured =
    Array.isArray(value) ||
    (value && typeof value === 'object' && !Array.isArray(value));

  if (isStructured) {
    return <DataGridEditor value={value} onChange={onChange} />;
  }

  // Fallback: raw JSON textarea
  return <JsonTextareaEditor value={value} onChange={onChange} />;
}

function JsonTextareaEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? '');
    }
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setText(JSON.stringify(value, null, 2));
      setError(null);
    } catch {
      // Keep current text on external update failure
    }
  }, [value]);

  const commit = useCallback(() => {
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onChange(parsed);
    } catch (e: any) {
      setError(e.message);
    }
  }, [text, onChange]);

  return (
    <div className="properties-editor-json-raw">
      <textarea
        className="properties-editor-textarea properties-editor-json-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        rows={6}
        spellCheck={false}
      />
      {error && (
        <div className="properties-editor-json-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Dispatch Function ──

export function renderPropertyEditor(
  schema: EditableProperty,
  onChange: (value: unknown) => void,
): React.ReactNode {
  const props: PropertyEditorProps = { schema, onChange };

  switch (schema.type) {
    case 'text':
      return <TextEditor {...props} />;
    case 'color':
      return <ColorEditor {...props} />;
    case 'select':
      return <SelectEditor {...props} />;
    case 'number':
      return <NumberEditor {...props} />;
    case 'image':
      return <ImageEditor {...props} />;
    case 'json':
      return <JsonEditor {...props} />;
    case 'boolean':
      return <BooleanEditor {...props} />;
    default:
      return <TextEditor {...props} />;
  }
}
