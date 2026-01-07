// src/ai/rewriters/selection.ts
import { extract } from '../../text/selectionUtils';
import { createHash } from 'crypto';
// Use the canonical model router; composeText returns { text, provider, model, ... }
import * as modelRouter from '../modelRouter';

export interface SelectionRewriteParams {
  fullText: string;
  start: number;
  end: number;
  instructions: string;
  model?: string;
  // we accept these as plain strings to avoid tight coupling to router types
  provider?: string;
  seed?: string | number;
}

export interface SelectionRewriteResult {
  rewritten: string;
  beforeHash: string;
  afterHash: string;
  usedModel?: string;
}

function sha256(s: string) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export async function proposeSelectionRewrite(
  params: SelectionRewriteParams
): Promise<SelectionRewriteResult> {
  const { fullText, start, end, instructions, model, provider, seed } = params;
  const selected = extract(fullText, { start, end });

  const prompt = [
    "You are rewriting a *selected span* inside a longer document.",
    "",
    "Rules:",
    "1. Only modify the selected span.",
    "2. Keep the overall meaning and tone unless the instructions say otherwise.",
    "3. Do not drop concrete facts unless explicitly told to.",
    "",
    "INSTRUCTIONS:",
    instructions,
    "",
    "--- SELECTION START ---",
    selected,
    "--- SELECTION END ---",
  ].join("\n");

  const anyRouter: any = modelRouter as any;
  const compose =
    anyRouter.composeText ?? anyRouter.textComplete;

  if (!compose) {
    throw new Error(
      "Model router entry point not found. Please expose composeText/textComplete in src/ai/modelRouter.ts"
    );
  }

  const maxTokens = Math.min(
    2048,
    Math.max(256, Math.ceil(selected.length * 1.5))
  );

  // Call the canonical compose API; this returns a ComposeResult-like object.
  const result: any = await compose(prompt, {
    model,
    provider,
    seed,
    maxTokens,
    temperature: 0.3,
  });

  let text: string;
  let usedModel: string | undefined;

  if (typeof result === "string") {
    text = result;
  } else if (result && typeof result.text === "string") {
    text = result.text;
    if (typeof result.model === "string") usedModel = result.model;
  } else {
    // Fallback: at least surface *something* rather than "[object Object]"
    text = JSON.stringify(result);
  }

  const rewritten = text.trim();

  return {
    rewritten,
    beforeHash: sha256(selected),
    afterHash: sha256(rewritten),
    usedModel: usedModel ?? model,
  };
}
