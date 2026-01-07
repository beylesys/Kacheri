// KACHERI FRONTEND/src/components/ComposeBar.tsx
import { useState } from 'react';
import type { ComposeRequest } from '../api';
import ProviderModelPicker, { type ProviderModelSeed } from './ProviderModelPicker';

type Props = {
  docId: string;
  workspaceId?: string;  // <— pass from EditorPage (defaults to "default")
  userId?: string;       // <— pass from EditorPage (defaults to "user:local")
  /** When provided, ComposeBar will NOT render a local preview and will call this instead. */
  onResult?: (text: string, meta: { provider: string; model: string }) => void;
};

// Resolve API base in the same way as the unified client does.
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (import.meta as any).env?.VITE_API_URL ??
  "/api";

export default function ComposeBar({ docId, workspaceId, userId, onResult }: Props) {
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');

  // Only used if no onResult is provided (not our case in EditorPage)
  const [result, setResult] = useState<string>('');
  const [meta, setMeta] = useState<{ provider?: string; model?: string }>({});

  const [pms, setPms] = useState<ProviderModelSeed>(() => ({
    provider: (localStorage.getItem('aiProvider') as any) || 'openai',
    model:
      localStorage.getItem('aiModel') ||
      ((localStorage.getItem('aiProvider') || 'openai') === 'anthropic'
        ? 'claude-sonnet-4-5-20250929'
        : 'gpt-4o-mini'),
    seed: localStorage.getItem('aiSeed') || '',
  }));

  async function run() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    if (!onResult) setResult('');

    try {
      const body: ComposeRequest = {
        prompt,
        systemPrompt: systemPrompt || undefined,
        provider: pms.provider,
        model: pms.model,
        seed: pms.seed || undefined,
        maxTokens: 600,
      };

      // Use API_BASE so Vite proxies to :4000; include workspace headers for WS broadcasts.
      const res = await fetch(
        `${API_BASE}/docs/${encodeURIComponent(docId)}/ai/compose`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workspace-id': (workspaceId || localStorage.getItem('workspaceId') || 'default'),
            'x-user-id': (userId || localStorage.getItem('userId') || 'user:local'),
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`${res.status} ${txt || 'compose failed'}`);
      }

      const r = await res.json();
      const text = r?.proposalText ?? '';

      if (onResult) {
        onResult(text, { provider: r.provider, model: r.model });
      } else {
        setResult(text);
        setMeta({ provider: r.provider, model: r.model });
      }
    } catch (e: any) {
      setError(e?.message || 'Propose failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 8 }}>
      {/* Row 1: prompt + propose */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          placeholder="Describe what you want drafted or improved…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); }}
        />
        <button onClick={run} disabled={busy || !prompt.trim()}>
          {busy ? 'Proposing…' : 'Propose'}
        </button>
      </div>

      {/* Row 2: provider/model/seed picker */}
      <div style={{ marginTop: 8 }}>
        <ProviderModelPicker
          value={pms}
          onChange={(next) => {
            setPms(next);
            localStorage.setItem('aiProvider', next.provider);
            localStorage.setItem('aiModel', next.model);
            localStorage.setItem('aiSeed', next.seed || '');
          }}
          compact
        />
      </div>

      {/* Optional system prompt (advanced) */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer' }}>Advanced: system prompt</summary>
        <textarea
          style={{ width: '100%', minHeight: 60, marginTop: 6, padding: 8 }}
          placeholder="You are concise and factual…"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </details>

      {error && <div style={{ color: '#b91c1c', marginTop: 8 }}>{error}</div>}

      {/* Fallback preview only if no onResult (not used in EditorPage) */}
      {!onResult && result && (
        <div style={{ marginTop: 8, padding: 8, background: '#fafafa', whiteSpace: 'pre-wrap' }}>
          {result}
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
            Generated via <b>{meta.provider}</b> · <code>{meta.model}</code>
          </div>
        </div>
      )}

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
        Press ⌘/Ctrl+Enter to propose.
      </div>
    </div>
  );
}
