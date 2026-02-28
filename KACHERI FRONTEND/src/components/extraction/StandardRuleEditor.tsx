// KACHERI FRONTEND/src/components/extraction/StandardRuleEditor.tsx
// Modal form for creating / editing a workspace extraction standard rule.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 15

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { extractionStandardsApi } from '../../api/extraction';
import type {
  ExtractionStandard,
  DocumentType,
  RuleType,
  AnomalySeverity,
  CreateStandardParams,
  UpdateStandardParams,
} from '../../types/extraction';
import './extraction.css';

/* ---------- Types ---------- */

interface StandardRuleEditorProps {
  workspaceId: string;
  existing?: ExtractionStandard;   // undefined = create mode
  onSaved: () => void;
  onClose: () => void;
}

interface RuleTemplate {
  label: string;
  documentType: DocumentType;
  ruleType: RuleType;
  config: Record<string, unknown>;
  severity: AnomalySeverity;
}

/* ---------- Constants ---------- */

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'contract', label: 'Contract' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'meeting_notes', label: 'Meeting Notes' },
  { value: 'report', label: 'Report' },
  { value: 'other', label: 'Other / All' },
];

const RULE_TYPES: { value: RuleType; label: string }[] = [
  { value: 'required_field', label: 'Required Field' },
  { value: 'value_range', label: 'Value Range' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'custom', label: 'Custom' },
];

const SEVERITIES: { value: AnomalySeverity; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

const OPERATORS = [
  { value: 'lt', label: '< Less than' },
  { value: 'lte', label: '<= Less or equal' },
  { value: 'gt', label: '> Greater than' },
  { value: 'gte', label: '>= Greater or equal' },
  { value: 'eq', label: '= Equal' },
];

const TEMPLATES: RuleTemplate[] = [
  {
    label: 'Require termination clause',
    documentType: 'contract',
    ruleType: 'required_field',
    config: { fieldPath: 'terminationClause', description: 'Contracts must include a termination clause' },
    severity: 'warning',
  },
  {
    label: 'Payment terms < 90 days',
    documentType: 'contract',
    ruleType: 'value_range',
    config: { fieldPath: 'paymentTerms.netDays', max: 90, description: 'Payment terms should not exceed 90 days' },
    severity: 'warning',
  },
  {
    label: 'Require invoice number',
    documentType: 'invoice',
    ruleType: 'required_field',
    config: { fieldPath: 'invoiceNumber', description: 'Invoices must have an invoice number' },
    severity: 'error',
  },
  {
    label: 'Require action items',
    documentType: 'meeting_notes',
    ruleType: 'required_field',
    config: { fieldPath: 'actionItems', description: 'Meeting notes should include action items' },
    severity: 'warning',
  },
  {
    label: 'Require scope definition',
    documentType: 'proposal',
    ruleType: 'required_field',
    config: { fieldPath: 'scope', description: 'Proposals must define the scope of work' },
    severity: 'error',
  },
  {
    label: 'Liability limit required',
    documentType: 'contract',
    ruleType: 'required_field',
    config: { fieldPath: 'liabilityLimit', description: 'Contracts should specify a liability limit' },
    severity: 'warning',
  },
];

/* ---------- Component ---------- */

export default function StandardRuleEditor({
  workspaceId,
  existing,
  onSaved,
  onClose,
}: StandardRuleEditorProps) {
  const isEdit = !!existing;

  // Form state
  const [documentType, setDocumentType] = useState<DocumentType>(existing?.documentType ?? 'contract');
  const [ruleType, setRuleType] = useState<RuleType>(existing?.ruleType ?? 'required_field');
  const [severity, setSeverity] = useState<AnomalySeverity>(existing?.severity ?? 'warning');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);

  // Config fields (dynamic per ruleType)
  const [fieldPath, setFieldPath] = useState('');
  const [description, setDescription] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [field1, setField1] = useState('');
  const [field2, setField2] = useState('');
  const [operator, setOperator] = useState('lt');
  const [customExpression, setCustomExpression] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate config fields from existing standard
  useEffect(() => {
    if (!existing) return;
    const c = existing.config as Record<string, unknown>;

    setFieldPath(typeof c.fieldPath === 'string' ? c.fieldPath : '');
    setDescription(typeof c.description === 'string' ? c.description : '');

    if (existing.ruleType === 'value_range') {
      setMin(typeof c.min === 'number' ? String(c.min) : '');
      setMax(typeof c.max === 'number' ? String(c.max) : '');
    }

    if (existing.ruleType === 'comparison') {
      setField1(typeof c.field1 === 'string' ? c.field1 : '');
      setField2(typeof c.field2 === 'string' ? c.field2 : '');
      setOperator(typeof c.operator === 'string' ? c.operator : 'lt');
    }

    if (existing.ruleType === 'custom') {
      setCustomExpression(typeof c.expression === 'string' ? c.expression : '');
      setDescription(typeof c.description === 'string' ? c.description : '');
    }
  }, [existing]);

  // Apply a template
  const applyTemplate = useCallback((tpl: RuleTemplate) => {
    setDocumentType(tpl.documentType);
    setRuleType(tpl.ruleType);
    setSeverity(tpl.severity);

    const c = tpl.config;
    setFieldPath(typeof c.fieldPath === 'string' ? c.fieldPath : '');
    setDescription(typeof c.description === 'string' ? c.description : '');
    setMin(typeof c.min === 'number' ? String(c.min) : '');
    setMax(typeof c.max === 'number' ? String(c.max) : '');
    setField1(typeof c.field1 === 'string' ? c.field1 : '');
    setField2(typeof c.field2 === 'string' ? c.field2 : '');
    setOperator(typeof c.operator === 'string' ? c.operator : 'lt');
    setCustomExpression(typeof c.expression === 'string' ? c.expression : '');
  }, []);

  // Build config object from form fields
  function buildConfig(): Record<string, unknown> {
    switch (ruleType) {
      case 'required_field': {
        const cfg: Record<string, unknown> = { fieldPath: fieldPath.trim() };
        if (description.trim()) cfg.description = description.trim();
        return cfg;
      }
      case 'value_range': {
        const cfg: Record<string, unknown> = { fieldPath: fieldPath.trim() };
        if (min !== '') cfg.min = Number(min);
        if (max !== '') cfg.max = Number(max);
        if (description.trim()) cfg.description = description.trim();
        return cfg;
      }
      case 'comparison': {
        const cfg: Record<string, unknown> = {
          field1: field1.trim(),
          field2: field2.trim(),
          operator,
        };
        if (description.trim()) cfg.description = description.trim();
        return cfg;
      }
      case 'custom': {
        const cfg: Record<string, unknown> = {};
        if (description.trim()) cfg.description = description.trim();
        if (customExpression.trim()) cfg.expression = customExpression.trim();
        return cfg;
      }
      default:
        return {};
    }
  }

  // Client-side validation (mirrors backend validateRuleConfig)
  function validate(): string | null {
    switch (ruleType) {
      case 'required_field':
        if (!fieldPath.trim()) return 'Field path is required for "Required Field" rules';
        break;
      case 'value_range':
        if (!fieldPath.trim()) return 'Field path is required for "Value Range" rules';
        if (min === '' && max === '') return 'At least one of min or max is required';
        if (min !== '' && isNaN(Number(min))) return 'Min must be a number';
        if (max !== '' && isNaN(Number(max))) return 'Max must be a number';
        if (min !== '' && max !== '' && Number(min) > Number(max)) return 'Min cannot be greater than max';
        break;
      case 'comparison':
        if (!field1.trim()) return 'Field 1 is required for "Comparison" rules';
        if (!field2.trim()) return 'Field 2 is required for "Comparison" rules';
        break;
      case 'custom':
        // Custom rules are flexible
        break;
    }
    return null;
  }

  // Save handler
  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const config = buildConfig();

      if (isEdit && existing) {
        const params: UpdateStandardParams = {
          documentType,
          ruleType,
          config,
          severity,
          enabled,
        };
        await extractionStandardsApi.update(workspaceId, existing.id, params);
      } else {
        const params: CreateStandardParams = {
          documentType,
          ruleType,
          config,
          severity,
          enabled,
        };
        await extractionStandardsApi.create(workspaceId, params);
      }

      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save rule';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="bk-modal-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="standard-rule-editor" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="standard-rule-title" ref={dialogRef}>
        {/* Header */}
        <div className="standard-rule-editor-header">
          <h2 id="standard-rule-title">{isEdit ? 'Edit Standard Rule' : 'Create Standard Rule'}</h2>
          <p>
            {isEdit
              ? 'Modify this workspace extraction standard.'
              : 'Define a custom anomaly detection rule for this workspace.'}
          </p>
        </div>

        {/* Templates (create mode only) */}
        {!isEdit && (
          <div className="standard-rule-templates">
            <div className="standard-rule-templates-label">Quick Templates</div>
            <div className="standard-rule-templates-grid">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  className="standard-rule-template-btn"
                  onClick={() => applyTemplate(tpl)}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="standard-rule-editor-body">
          {error && <div className="standard-rule-error">{error}</div>}

          {/* Document Type */}
          <div className="standard-rule-field">
            <label className="standard-rule-label">Document Type</label>
            <select
              className="standard-rule-select"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>{dt.label}</option>
              ))}
            </select>
            <div className="standard-rule-hint">
              Select "Other / All" to apply this rule to all document types.
            </div>
          </div>

          {/* Rule Type */}
          <div className="standard-rule-field">
            <label className="standard-rule-label">Rule Type</label>
            <select
              className="standard-rule-select"
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as RuleType)}
            >
              {RULE_TYPES.map((rt) => (
                <option key={rt.value} value={rt.value}>{rt.label}</option>
              ))}
            </select>
          </div>

          {/* Dynamic config fields based on ruleType */}
          {ruleType === 'required_field' && (
            <>
              <div className="standard-rule-field">
                <label className="standard-rule-label">Field Path</label>
                <input
                  className="standard-rule-input"
                  type="text"
                  value={fieldPath}
                  onChange={(e) => setFieldPath(e.target.value)}
                  placeholder="e.g. terminationClause, paymentTerms.netDays"
                />
                <div className="standard-rule-hint">
                  Dot notation for nested fields (e.g. paymentTerms.netDays)
                </div>
              </div>
              <div className="standard-rule-field">
                <label className="standard-rule-label">Description (optional)</label>
                <input
                  className="standard-rule-input"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Contracts must include a termination clause"
                />
              </div>
            </>
          )}

          {ruleType === 'value_range' && (
            <>
              <div className="standard-rule-field">
                <label className="standard-rule-label">Field Path</label>
                <input
                  className="standard-rule-input"
                  type="text"
                  value={fieldPath}
                  onChange={(e) => setFieldPath(e.target.value)}
                  placeholder="e.g. paymentTerms.netDays"
                />
              </div>
              <div className="standard-rule-input-row">
                <div className="standard-rule-field">
                  <label className="standard-rule-label">Min</label>
                  <input
                    className="standard-rule-input"
                    type="number"
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                    placeholder="Leave empty for no minimum"
                  />
                </div>
                <div className="standard-rule-field">
                  <label className="standard-rule-label">Max</label>
                  <input
                    className="standard-rule-input"
                    type="number"
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                    placeholder="Leave empty for no maximum"
                  />
                </div>
              </div>
              <div className="standard-rule-field">
                <label className="standard-rule-label">Description (optional)</label>
                <input
                  className="standard-rule-input"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Payment terms should not exceed 90 days"
                />
              </div>
            </>
          )}

          {ruleType === 'comparison' && (
            <>
              <div className="standard-rule-input-row">
                <div className="standard-rule-field">
                  <label className="standard-rule-label">Field 1</label>
                  <input
                    className="standard-rule-input"
                    type="text"
                    value={field1}
                    onChange={(e) => setField1(e.target.value)}
                    placeholder="e.g. effectiveDate"
                  />
                </div>
                <div className="standard-rule-field">
                  <label className="standard-rule-label">Operator</label>
                  <select
                    className="standard-rule-select"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                <div className="standard-rule-field">
                  <label className="standard-rule-label">Field 2</label>
                  <input
                    className="standard-rule-input"
                    type="text"
                    value={field2}
                    onChange={(e) => setField2(e.target.value)}
                    placeholder="e.g. expirationDate"
                  />
                </div>
              </div>
              <div className="standard-rule-field">
                <label className="standard-rule-label">Description (optional)</label>
                <input
                  className="standard-rule-input"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Effective date must be before expiration date"
                />
              </div>
            </>
          )}

          {ruleType === 'custom' && (
            <>
              <div className="standard-rule-field">
                <label className="standard-rule-label">Description</label>
                <input
                  className="standard-rule-input"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this rule checks"
                />
              </div>
              <div className="standard-rule-field">
                <label className="standard-rule-label">Expression (optional)</label>
                <textarea
                  className="standard-rule-textarea"
                  value={customExpression}
                  onChange={(e) => setCustomExpression(e.target.value)}
                  placeholder="Custom rule expression or notes"
                  rows={3}
                />
                <div className="standard-rule-hint">
                  Free-form expression for custom rule logic.
                </div>
              </div>
            </>
          )}

          {/* Severity */}
          <div className="standard-rule-field">
            <label className="standard-rule-label">Severity</label>
            <select
              className="standard-rule-select"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as AnomalySeverity)}
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Enabled */}
          <div className="standard-rule-field">
            <label className="standard-rule-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enabled
            </label>
          </div>
        </div>

        {/* Footer / Actions */}
        <div className="standard-rule-actions">
          <button
            type="button"
            className="extraction-btn ghost"
            onClick={onClose}
            disabled={saving}
            style={{ width: 'auto' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="extraction-btn primary"
            onClick={handleSave}
            disabled={saving}
            style={{ width: 'auto' }}
          >
            {saving ? 'Saving...' : isEdit ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
