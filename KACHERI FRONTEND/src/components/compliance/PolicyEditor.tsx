// KACHERI FRONTEND/src/components/compliance/PolicyEditor.tsx
// Modal form for creating / editing a workspace compliance policy.
// Follows the same pattern as StandardRuleEditor.tsx.
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice A11

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { compliancePoliciesApi } from '../../api/compliance';
import type {
  CompliancePolicy,
  CompliancePolicyTemplate,
  PolicyCategory,
  PolicyRuleType,
  PolicySeverity,
  CreatePolicyParams,
  UpdatePolicyParams,
} from '../../types/compliance';
import './compliance.css';

/* ---------- Types ---------- */

interface PolicyEditorProps {
  workspaceId: string;
  existing?: CompliancePolicy;        // undefined = create mode
  onSaved: () => void;
  onClose: () => void;
}

/* ---------- Constants ---------- */

const CATEGORIES: { value: PolicyCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'legal', label: 'Legal' },
  { value: 'financial', label: 'Financial' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'custom', label: 'Custom' },
];

const RULE_TYPES: { value: PolicyRuleType; label: string; description: string }[] = [
  { value: 'text_match', label: 'Text Match', description: 'Check if document contains/starts with specific text' },
  { value: 'regex_pattern', label: 'Regex Pattern', description: 'Match document content against a regular expression' },
  { value: 'required_section', label: 'Required Section', description: 'Require a specific heading/section in the document' },
  { value: 'forbidden_term', label: 'Forbidden Term', description: 'Flag usage of specific words or phrases' },
  { value: 'numeric_constraint', label: 'Numeric Constraint', description: 'Enforce numeric limits on extracted fields' },
  { value: 'ai_check', label: 'AI Check', description: 'Use AI to evaluate a compliance question' },
];

const SEVERITIES: { value: PolicySeverity; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

const MATCH_TYPES = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact match' },
  { value: 'startsWith', label: 'Starts with' },
];

const OPERATORS = [
  { value: 'lt', label: '< Less than' },
  { value: 'lte', label: '<= Less or equal' },
  { value: 'gt', label: '> Greater than' },
  { value: 'gte', label: '>= Greater or equal' },
  { value: 'eq', label: '= Equal' },
];

/* ---------- Component ---------- */

export default function PolicyEditor({
  workspaceId,
  existing,
  onSaved,
  onClose,
}: PolicyEditorProps) {
  const isEdit = !!existing;

  // Core form state
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState<PolicyCategory>(existing?.category ?? 'general');
  const [ruleType, setRuleType] = useState<PolicyRuleType>(existing?.ruleType ?? 'text_match');
  const [severity, setSeverity] = useState<PolicySeverity>(existing?.severity ?? 'warning');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [autoCheck, setAutoCheck] = useState(existing?.autoCheck ?? true);

  // text_match config
  const [tmPattern, setTmPattern] = useState('');
  const [tmMatchType, setTmMatchType] = useState('contains');
  const [tmCaseSensitive, setTmCaseSensitive] = useState(false);

  // regex_pattern config
  const [rpPattern, setRpPattern] = useState('');
  const [rpFlags, setRpFlags] = useState('i');
  const [rpMustMatch, setRpMustMatch] = useState(true);

  // required_section config
  const [rsHeading, setRsHeading] = useState('');
  const [rsMinWords, setRsMinWords] = useState('');

  // forbidden_term config
  const [ftTerms, setFtTerms] = useState('');
  const [ftCaseSensitive, setFtCaseSensitive] = useState(false);

  // numeric_constraint config
  const [ncFieldPath, setNcFieldPath] = useState('');
  const [ncOperator, setNcOperator] = useState('lte');
  const [ncValue, setNcValue] = useState('');

  // ai_check config
  const [acInstruction, setAcInstruction] = useState('');
  const [acFailIf, setAcFailIf] = useState<'yes' | 'no'>('yes');

  // Templates
  const [templates, setTemplates] = useState<CompliancePolicyTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate config fields from existing policy
  useEffect(() => {
    if (!existing) return;
    const c = existing.ruleConfig as Record<string, unknown>;

    switch (existing.ruleType) {
      case 'text_match':
        setTmPattern(typeof c.pattern === 'string' ? c.pattern : '');
        setTmMatchType(typeof c.matchType === 'string' ? c.matchType : 'contains');
        setTmCaseSensitive(typeof c.caseSensitive === 'boolean' ? c.caseSensitive : false);
        break;
      case 'regex_pattern':
        setRpPattern(typeof c.pattern === 'string' ? c.pattern : '');
        setRpFlags(typeof c.flags === 'string' ? c.flags : 'i');
        setRpMustMatch(typeof c.mustMatch === 'boolean' ? c.mustMatch : true);
        break;
      case 'required_section':
        setRsHeading(typeof c.heading === 'string' ? c.heading : '');
        setRsMinWords(typeof c.minWords === 'number' ? String(c.minWords) : '');
        break;
      case 'forbidden_term':
        if (Array.isArray(c.terms)) {
          setFtTerms((c.terms as string[]).join(', '));
        }
        setFtCaseSensitive(typeof c.caseSensitive === 'boolean' ? c.caseSensitive : false);
        break;
      case 'numeric_constraint':
        setNcFieldPath(typeof c.fieldPath === 'string' ? c.fieldPath : '');
        setNcOperator(typeof c.operator === 'string' ? c.operator : 'lte');
        setNcValue(typeof c.value === 'number' ? String(c.value) : '');
        break;
      case 'ai_check':
        setAcInstruction(typeof c.instruction === 'string' ? c.instruction : '');
        setAcFailIf(c.failIf === 'no' ? 'no' : 'yes');
        break;
    }
  }, [existing]);

  // Fetch templates (create mode only)
  useEffect(() => {
    if (isEdit) return;
    let mounted = true;
    setTemplatesLoading(true);
    compliancePoliciesApi.getTemplates(workspaceId)
      .then((res) => {
        if (mounted) setTemplates(res.templates);
      })
      .catch(() => { /* templates are optional — silently skip */ })
      .finally(() => { if (mounted) setTemplatesLoading(false); });
    return () => { mounted = false; };
  }, [workspaceId, isEdit]);

  // Apply a template
  const applyTemplate = useCallback((tpl: CompliancePolicyTemplate) => {
    setName(tpl.name);
    setDescription(tpl.description);
    setCategory(tpl.category);
    setRuleType(tpl.ruleType);
    setSeverity(tpl.severity);

    const c = tpl.defaultConfig as Record<string, unknown>;

    // Reset all config fields first
    setTmPattern(''); setTmMatchType('contains'); setTmCaseSensitive(false);
    setRpPattern(''); setRpFlags('i'); setRpMustMatch(true);
    setRsHeading(''); setRsMinWords('');
    setFtTerms(''); setFtCaseSensitive(false);
    setNcFieldPath(''); setNcOperator('lte'); setNcValue('');
    setAcInstruction(''); setAcFailIf('yes');

    switch (tpl.ruleType) {
      case 'text_match':
        setTmPattern(typeof c.pattern === 'string' ? c.pattern : '');
        setTmMatchType(typeof c.matchType === 'string' ? c.matchType : 'contains');
        setTmCaseSensitive(typeof c.caseSensitive === 'boolean' ? c.caseSensitive : false);
        break;
      case 'regex_pattern':
        setRpPattern(typeof c.pattern === 'string' ? c.pattern : '');
        setRpFlags(typeof c.flags === 'string' ? c.flags : 'i');
        setRpMustMatch(typeof c.mustMatch === 'boolean' ? c.mustMatch : true);
        break;
      case 'required_section':
        setRsHeading(typeof c.heading === 'string' ? c.heading : '');
        setRsMinWords(typeof c.minWords === 'number' ? String(c.minWords) : '');
        break;
      case 'forbidden_term':
        if (Array.isArray(c.terms)) setFtTerms((c.terms as string[]).join(', '));
        setFtCaseSensitive(typeof c.caseSensitive === 'boolean' ? c.caseSensitive : false);
        break;
      case 'numeric_constraint':
        setNcFieldPath(typeof c.fieldPath === 'string' ? c.fieldPath : '');
        setNcOperator(typeof c.operator === 'string' ? c.operator : 'lte');
        setNcValue(typeof c.value === 'number' ? String(c.value) : '');
        break;
      case 'ai_check':
        setAcInstruction(typeof c.instruction === 'string' ? c.instruction : '');
        setAcFailIf(c.failIf === 'no' ? 'no' : 'yes');
        break;
    }
  }, []);

  // Build config object from form fields
  function buildConfig(): Record<string, unknown> {
    switch (ruleType) {
      case 'text_match':
        return { pattern: tmPattern.trim(), matchType: tmMatchType, caseSensitive: tmCaseSensitive };
      case 'regex_pattern':
        return { pattern: rpPattern.trim(), flags: rpFlags.trim(), mustMatch: rpMustMatch };
      case 'required_section': {
        const cfg: Record<string, unknown> = { heading: rsHeading.trim() };
        if (rsMinWords !== '') cfg.minWords = Number(rsMinWords);
        return cfg;
      }
      case 'forbidden_term':
        return {
          terms: ftTerms.split(',').map((t) => t.trim()).filter(Boolean),
          caseSensitive: ftCaseSensitive,
        };
      case 'numeric_constraint':
        return { fieldPath: ncFieldPath.trim(), operator: ncOperator, value: Number(ncValue) };
      case 'ai_check':
        return { instruction: acInstruction.trim(), failIf: acFailIf };
      default:
        return {};
    }
  }

  // Client-side validation (mirrors backend validateRuleConfig)
  function validate(): string | null {
    if (!name.trim()) return 'Policy name is required';

    switch (ruleType) {
      case 'text_match':
        if (!tmPattern.trim()) return 'Pattern is required for Text Match rules';
        break;
      case 'regex_pattern':
        if (!rpPattern.trim()) return 'Pattern is required for Regex Pattern rules';
        try { new RegExp(rpPattern.trim(), rpFlags.trim()); } catch {
          return 'Invalid regex pattern';
        }
        break;
      case 'required_section':
        if (!rsHeading.trim()) return 'Heading is required for Required Section rules';
        if (rsMinWords !== '' && (isNaN(Number(rsMinWords)) || Number(rsMinWords) < 0))
          return 'Min words must be a positive number';
        break;
      case 'forbidden_term': {
        const terms = ftTerms.split(',').map((t) => t.trim()).filter(Boolean);
        if (terms.length === 0) return 'At least one term is required for Forbidden Term rules';
        break;
      }
      case 'numeric_constraint':
        if (!ncFieldPath.trim()) return 'Field path is required for Numeric Constraint rules';
        if (ncValue === '' || isNaN(Number(ncValue))) return 'Value must be a number';
        break;
      case 'ai_check':
        if (!acInstruction.trim()) return 'Instruction is required for AI Check rules';
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
      const ruleConfig = buildConfig();

      if (isEdit && existing) {
        const params: UpdatePolicyParams = {
          name: name.trim(),
          description: description.trim() || null,
          category,
          ruleType,
          ruleConfig,
          severity,
          enabled,
          autoCheck,
        };
        await compliancePoliciesApi.update(workspaceId, existing.id, params);
      } else {
        const params: CreatePolicyParams = {
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          ruleType,
          ruleConfig,
          severity,
          enabled,
          autoCheck,
        };
        await compliancePoliciesApi.create(workspaceId, params);
      }

      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save policy';
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
      <div className="policy-editor" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="policy-editor-title" ref={dialogRef}>
        {/* Header */}
        <div className="policy-editor-header">
          <h2 id="policy-editor-title">{isEdit ? 'Edit Compliance Policy' : 'Create Compliance Policy'}</h2>
          <p>
            {isEdit
              ? 'Modify this workspace compliance policy.'
              : 'Define a policy rule to check documents against.'}
          </p>
        </div>

        {/* Templates (create mode only) */}
        {!isEdit && templates.length > 0 && (
          <div className="policy-editor-templates">
            <div className="policy-editor-templates-label">Built-in Templates</div>
            <div className="policy-editor-templates-grid">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="policy-editor-template-btn"
                  onClick={() => applyTemplate(tpl)}
                  title={tpl.description}
                >
                  {tpl.name}
                  <span className="policy-editor-template-category">{tpl.category}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!isEdit && templatesLoading && (
          <div className="policy-editor-templates" style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
            Loading templates...
          </div>
        )}

        {/* Body */}
        <div className="policy-editor-body">
          {error && <div className="policy-editor-error">{error}</div>}

          {/* Policy Name */}
          <div className="policy-editor-field">
            <label className="policy-editor-label">Policy Name</label>
            <input
              className="policy-editor-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. No unlimited liability"
            />
          </div>

          {/* Description */}
          <div className="policy-editor-field">
            <label className="policy-editor-label">Description (optional)</label>
            <input
              className="policy-editor-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Prevents documents from offering unlimited liability"
            />
          </div>

          {/* Category */}
          <div className="policy-editor-field">
            <label className="policy-editor-label">Category</label>
            <select
              className="policy-editor-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as PolicyCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Rule Type */}
          <div className="policy-editor-field">
            <label className="policy-editor-label">Rule Type</label>
            <select
              className="policy-editor-select"
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as PolicyRuleType)}
            >
              {RULE_TYPES.map((rt) => (
                <option key={rt.value} value={rt.value}>{rt.label}</option>
              ))}
            </select>
            <div className="policy-editor-hint">
              {RULE_TYPES.find((rt) => rt.value === ruleType)?.description}
            </div>
          </div>

          {/* Dynamic config fields per rule type */}

          {ruleType === 'text_match' && (
            <>
              <div className="policy-editor-field">
                <label className="policy-editor-label">Pattern</label>
                <input
                  className="policy-editor-input"
                  type="text"
                  value={tmPattern}
                  onChange={(e) => setTmPattern(e.target.value)}
                  placeholder="e.g. CONFIDENTIAL"
                />
              </div>
              <div className="policy-editor-input-row">
                <div className="policy-editor-field">
                  <label className="policy-editor-label">Match Type</label>
                  <select
                    className="policy-editor-select"
                    value={tmMatchType}
                    onChange={(e) => setTmMatchType(e.target.value)}
                  >
                    {MATCH_TYPES.map((mt) => (
                      <option key={mt.value} value={mt.value}>{mt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="policy-editor-field">
                  <label className="policy-editor-toggle">
                    <input
                      type="checkbox"
                      checked={tmCaseSensitive}
                      onChange={(e) => setTmCaseSensitive(e.target.checked)}
                    />
                    Case Sensitive
                  </label>
                </div>
              </div>
            </>
          )}

          {ruleType === 'regex_pattern' && (
            <>
              <div className="policy-editor-field">
                <label className="policy-editor-label">Regex Pattern</label>
                <input
                  className="policy-editor-input"
                  type="text"
                  value={rpPattern}
                  onChange={(e) => setRpPattern(e.target.value)}
                  placeholder="e.g. [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
                  style={{ fontFamily: 'monospace' }}
                />
                <div className="policy-editor-hint">
                  Enter a valid JavaScript regular expression.
                </div>
              </div>
              <div className="policy-editor-input-row">
                <div className="policy-editor-field">
                  <label className="policy-editor-label">Flags</label>
                  <input
                    className="policy-editor-input"
                    type="text"
                    value={rpFlags}
                    onChange={(e) => setRpFlags(e.target.value)}
                    placeholder="e.g. i, gi, gm"
                    style={{ fontFamily: 'monospace', maxWidth: 100 }}
                  />
                </div>
                <div className="policy-editor-field">
                  <label className="policy-editor-toggle">
                    <input
                      type="checkbox"
                      checked={rpMustMatch}
                      onChange={(e) => setRpMustMatch(e.target.checked)}
                    />
                    Must Match
                  </label>
                  <div className="policy-editor-hint">
                    If checked, pattern must be found. If unchecked, pattern must NOT be found.
                  </div>
                </div>
              </div>
            </>
          )}

          {ruleType === 'required_section' && (
            <>
              <div className="policy-editor-field">
                <label className="policy-editor-label">Required Heading</label>
                <input
                  className="policy-editor-input"
                  type="text"
                  value={rsHeading}
                  onChange={(e) => setRsHeading(e.target.value)}
                  placeholder="e.g. Terms and Conditions"
                />
                <div className="policy-editor-hint">
                  The document must contain a heading matching this text (case-insensitive).
                </div>
              </div>
              <div className="policy-editor-field">
                <label className="policy-editor-label">Minimum Words (optional)</label>
                <input
                  className="policy-editor-input"
                  type="number"
                  value={rsMinWords}
                  onChange={(e) => setRsMinWords(e.target.value)}
                  placeholder="Leave empty for no minimum"
                  min={0}
                />
                <div className="policy-editor-hint">
                  Minimum number of words the section must contain.
                </div>
              </div>
            </>
          )}

          {ruleType === 'forbidden_term' && (
            <>
              <div className="policy-editor-field">
                <label className="policy-editor-label">Forbidden Terms</label>
                <textarea
                  className="policy-editor-textarea"
                  value={ftTerms}
                  onChange={(e) => setFtTerms(e.target.value)}
                  placeholder="Enter terms separated by commas, e.g.:&#10;unlimited liability, no liability cap, uncapped liability"
                  rows={3}
                />
                <div className="policy-editor-hint">
                  Comma-separated list of terms to flag in the document.
                </div>
              </div>
              <div className="policy-editor-field">
                <label className="policy-editor-toggle">
                  <input
                    type="checkbox"
                    checked={ftCaseSensitive}
                    onChange={(e) => setFtCaseSensitive(e.target.checked)}
                  />
                  Case Sensitive
                </label>
              </div>
            </>
          )}

          {ruleType === 'numeric_constraint' && (
            <>
              <div className="policy-editor-field">
                <label className="policy-editor-label">Field Path</label>
                <input
                  className="policy-editor-input"
                  type="text"
                  value={ncFieldPath}
                  onChange={(e) => setNcFieldPath(e.target.value)}
                  placeholder="e.g. sla.uptimePercentage"
                />
                <div className="policy-editor-hint">
                  Path to the numeric field in extracted document metadata. Dot notation for nested fields.
                </div>
              </div>
              <div className="policy-editor-input-row">
                <div className="policy-editor-field">
                  <label className="policy-editor-label">Operator</label>
                  <select
                    className="policy-editor-select"
                    value={ncOperator}
                    onChange={(e) => setNcOperator(e.target.value)}
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                <div className="policy-editor-field">
                  <label className="policy-editor-label">Value</label>
                  <input
                    className="policy-editor-input"
                    type="number"
                    value={ncValue}
                    onChange={(e) => setNcValue(e.target.value)}
                    placeholder="e.g. 99.9"
                    step="any"
                  />
                </div>
              </div>
            </>
          )}

          {ruleType === 'ai_check' && (
            <>
              <div className="policy-editor-field">
                <label className="policy-editor-label">Compliance Question</label>
                <textarea
                  className="policy-editor-textarea"
                  value={acInstruction}
                  onChange={(e) => setAcInstruction(e.target.value)}
                  placeholder="e.g. Does this document promise unlimited liability?"
                  rows={3}
                />
                <div className="policy-editor-hint">
                  AI will answer YES or NO to this question about the document content.
                </div>
              </div>
              <div className="policy-editor-field">
                <label className="policy-editor-label">Fail If Answer Is</label>
                <select
                  className="policy-editor-select"
                  value={acFailIf}
                  onChange={(e) => setAcFailIf(e.target.value as 'yes' | 'no')}
                >
                  <option value="yes">YES — fail if AI answers yes</option>
                  <option value="no">NO — fail if AI answers no</option>
                </select>
                <div className="policy-editor-hint">
                  The check fails when the AI's answer matches this value.
                </div>
              </div>
            </>
          )}

          {/* Severity */}
          <div className="policy-editor-field">
            <label className="policy-editor-label">Severity</label>
            <select
              className="policy-editor-select"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as PolicySeverity)}
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Enabled */}
          <div className="policy-editor-field">
            <label className="policy-editor-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enabled
            </label>
          </div>

          {/* Auto-check */}
          <div className="policy-editor-field">
            <label className="policy-editor-toggle">
              <input
                type="checkbox"
                checked={autoCheck}
                onChange={(e) => setAutoCheck(e.target.checked)}
              />
              Auto-check on save
            </label>
            <div className="policy-editor-hint">
              When enabled, this policy is automatically checked when a document is saved.
            </div>
          </div>
        </div>

        {/* Footer / Actions */}
        <div className="policy-editor-actions">
          <button
            type="button"
            className="compliance-btn ghost"
            onClick={onClose}
            disabled={saving}
            style={{ width: 'auto' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="compliance-btn primary"
            onClick={handleSave}
            disabled={saving}
            style={{ width: 'auto' }}
          >
            {saving ? 'Saving...' : isEdit ? 'Update Policy' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}
