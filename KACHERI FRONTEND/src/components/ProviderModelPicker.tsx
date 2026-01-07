// src/components/ProviderModelPicker.tsx
import React from 'react';
import { OPENAI_MODELS, ANTHROPIC_MODELS, DEFAULT_PROVIDER, DEFAULT_OPENAI_MODEL, DEFAULT_ANTHROPIC_MODEL } from '../constants/models';

export type ProviderChoice = 'openai' | 'anthropic' | 'dev';

export type ProviderModelSeed = {
  provider: ProviderChoice;
  model: string;
  seed?: string;
};

type Props = {
  value?: ProviderModelSeed;
  onChange: (next: ProviderModelSeed) => void;
  compact?: boolean; // if true, render in 1 row
};

const lsGet = (k: string) => {
  try { return localStorage.getItem(k) ?? undefined; } catch { return undefined; }
};
const lsSet = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch {}
};

export default function ProviderModelPicker({ value, onChange, compact }: Props) {
  const [provider, setProvider] = React.useState<ProviderChoice>(() => (value?.provider ?? (lsGet('aiProvider') as ProviderChoice) ?? DEFAULT_PROVIDER));
  const [model, setModel] = React.useState<string>(() => value?.model ?? lsGet('aiModel') ?? (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL));
  const [seed, setSeed] = React.useState<string>(() => value?.seed ?? (lsGet('aiSeed') ?? ''));

  React.useEffect(() => { onChange({ provider, model, seed: seed || undefined }); }, [provider, model, seed]);

  const modelSuggestions = provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS;

  const Row = ({ children }: { children: React.ReactNode }) =>
    <div style={{ display: compact ? 'inline-flex' : 'flex', gap: 8, alignItems: 'center', margin: compact ? '0' : '6px 0' }}>{children}</div>;

  return (
    <div className="provider-model-picker" style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', gap: compact ? 8 : 12 }}>
      <Row>
        <label style={{ minWidth: 72 }}>Provider</label>
        <select
          value={provider}
          onChange={(e) => {
            const p = e.target.value as ProviderChoice;
            setProvider(p);
            const nextModel = p === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL;
            setModel(nextModel);
            lsSet('aiProvider', p);
            lsSet('aiModel', nextModel);
          }}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="dev">Dev stub</option>
        </select>
      </Row>

      <Row>
        <label style={{ minWidth: 72 }}>Model</label>
        <input
          list="model-suggestions"
          value={model}
          onChange={(e) => { setModel(e.target.value); lsSet('aiModel', e.target.value); }}
          placeholder={provider === 'anthropic' ? 'claude-sonnet-4-5-YYYYMMDD' : 'gpt-4o-mini'}
          style={{ width: 300 }}
        />
        <datalist id="model-suggestions">
          {modelSuggestions.map((m) => <option key={m} value={m} />)}
        </datalist>
      </Row>

      <Row>
        <label style={{ minWidth: 72 }}>Seed</label>
        <input
          value={seed}
          onChange={(e) => { setSeed(e.target.value); lsSet('aiSeed', e.target.value); }}
          placeholder="(optional; OpenAI only)"
          style={{ width: 160 }}
        />
      </Row>
    </div>
  );
}
