// KACHERI BACKEND/src/jaal/llmService.ts
// JAAL LLM Service: Orchestrates LLM calls for Guide mode actions.
// Prompts ported from BEYLE JAAL/renderer.js — Slice S5
//
// Uses the existing modelRouter.composeText() for all AI calls.
// Supports dev/openai/anthropic/ollama providers automatically.

import { composeText } from "../ai/modelRouter";

/* ---------- Types ---------- */

export interface LlmResult {
  result: string;
  provider: string;
  model: string;
}

export interface LlmLinkResult {
  result: string;
}

/* ---------- Summarize ---------- */

/**
 * AI-summarize page content.
 * System prompt ported from BEYLE JAAL/renderer.js (line 5669).
 */
export async function summarize(
  content: string,
  url: string,
): Promise<LlmResult> {
  const systemPrompt =
    "You are a precise summarizer. Produce 5 bullet points capturing the core facts. No fluff.";

  // Cap content to avoid exceeding LLM context limits
  const capped = content.slice(0, 12_000);

  const result = await composeText(capped, {
    systemPrompt,
    maxTokens: 400,
  });

  return {
    result: result.text,
    provider: result.provider,
    model: result.model,
  };
}

/* ---------- Extract Links ---------- */

/**
 * Extract links from page content.
 * Uses local regex extraction — no LLM call needed for basic link extraction.
 */
export function extractLinks(
  content: string,
  _url: string,
): LlmLinkResult {
  const linkSet = new Map<string, string>();

  // Match standalone URLs
  const urlRegex = /https?:\/\/[^\s"'<>\])}]+/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(content)) !== null) {
    const href = match[0].replace(/[.,;:!?)]+$/, ""); // strip trailing punctuation
    if (!linkSet.has(href)) {
      linkSet.set(href, href);
    }
  }

  // Match href="..." patterns
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  while ((match = hrefRegex.exec(content)) !== null) {
    const href = match[1];
    if (href.startsWith("http") && !linkSet.has(href)) {
      linkSet.set(href, href);
    }
  }

  const links = Array.from(linkSet.entries()).map(([href]) => ({
    url: href,
    text: href,
  }));

  return { result: JSON.stringify(links) };
}

/* ---------- Compare ---------- */

/**
 * AI-compare two pages.
 * System prompt ported from BEYLE JAAL/renderer.js (line 5698).
 */
export async function compare(
  contentA: string,
  urlA: string,
  contentB: string,
  urlB: string,
): Promise<LlmResult> {
  const systemPrompt =
    "You compare two sources fairly and concisely. Use bullet points; cite [A] or [B] on each claim.";

  // Cap each page to avoid exceeding LLM context limits
  const cappedA = contentA.slice(0, 6_000);
  const cappedB = contentB.slice(0, 6_000);

  const prompt = `[Page A: ${urlA}]\n${cappedA}\n\n[Page B: ${urlB}]\n${cappedB}`;

  const result = await composeText(prompt, {
    systemPrompt,
    maxTokens: 600,
  });

  return {
    result: result.text,
    provider: result.provider,
    model: result.model,
  };
}
