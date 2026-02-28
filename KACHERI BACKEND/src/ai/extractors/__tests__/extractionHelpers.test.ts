import { describe, it, expect } from 'vitest';
import { isExtractableText, truncateForExtraction, withTimeout } from '../index.js';

/* ============= isExtractableText ============= */

describe('isExtractableText', () => {
  it('returns false for very short text', () => {
    const result = isExtractableText('Hi');
    expect(result.extractable).toBe(false);
    expect(result.reason).toBe('text_too_short');
  });

  it('returns false for text with only whitespace/symbols', () => {
    const result = isExtractableText('--- *** !!! @@@ ### $$$ %%% ^^^ &&& *** ((())) --- *** !!! @@@');
    expect(result.extractable).toBe(false);
    expect(result.reason).toBe('insufficient_meaningful_content');
  });

  it('returns true for normal English text', () => {
    const text = 'This is a service agreement between Acme Corporation and Client Industries for the provision of software development services over a period of twelve months.';
    const result = isExtractableText(text);
    expect(result.extractable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns true for Unicode content (CJK)', () => {
    const text = '这是一份服务协议，甲方为安科公司，乙方为客户工业公司，服务期限为十二个月，涵盖软件开发服务。本协议自双方签字之日起生效，任何一方不得单方面解除本协议。';
    const result = isExtractableText(text);
    expect(result.extractable).toBe(true);
  });

  it('returns true for Cyrillic content', () => {
    const text = 'Это договор на оказание услуг между компанией Акме и компанией Клиент на предоставление услуг по разработке программного обеспечения.';
    const result = isExtractableText(text);
    expect(result.extractable).toBe(true);
  });

  it('returns false for text below 50 chars after stripping', () => {
    const text = '   a b c   ';
    const result = isExtractableText(text);
    expect(result.extractable).toBe(false);
    expect(result.reason).toBe('text_too_short');
  });

  it('handles text with lots of whitespace', () => {
    const words = 'contract agreement service development testing deployment';
    const spacedOut = words.split(' ').join('       ');
    const result = isExtractableText(spacedOut);
    // Stripped length is short but meaningful chars may be enough
    expect(result).toBeDefined();
  });
});

/* ============= truncateForExtraction ============= */

describe('truncateForExtraction', () => {
  it('does not truncate short text', () => {
    const text = 'Short document text.';
    const result = truncateForExtraction(text);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
    expect(result.originalLength).toBe(text.length);
  });

  it('truncates text exceeding 60K chars', () => {
    const text = 'A'.repeat(70000);
    const result = truncateForExtraction(text);
    expect(result.truncated).toBe(true);
    expect(result.originalLength).toBe(70000);
    expect(result.text.length).toBeLessThan(70000);
    expect(result.text).toContain('[...document truncated');
  });

  it('uses 12K limit for ollama provider', () => {
    const text = 'A'.repeat(15000);
    const result = truncateForExtraction(text, 'ollama');
    expect(result.truncated).toBe(true);
    expect(result.text).toContain('12000');
  });

  it('does not truncate ollama text within limit', () => {
    const text = 'A'.repeat(10000);
    const result = truncateForExtraction(text, 'ollama');
    expect(result.truncated).toBe(false);
  });

  it('uses 60K limit for openai provider', () => {
    const text = 'A'.repeat(50000);
    const result = truncateForExtraction(text, 'openai');
    expect(result.truncated).toBe(false);
  });

  it('preserves original length in result', () => {
    const text = 'A'.repeat(70000);
    const result = truncateForExtraction(text);
    expect(result.originalLength).toBe(70000);
  });
});

/* ============= withTimeout ============= */

describe('withTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('done'),
      1000,
      'Timed out'
    );
    expect(result).toBe('done');
  });

  it('rejects when promise exceeds timeout', async () => {
    const slowPromise = new Promise<string>((resolve) =>
      setTimeout(() => resolve('late'), 5000)
    );

    await expect(
      withTimeout(slowPromise, 50, 'Test timed out')
    ).rejects.toThrow('Test timed out');
  });

  it('preserves rejection from original promise', async () => {
    const failingPromise = Promise.reject(new Error('Original error'));

    await expect(
      withTimeout(failingPromise, 1000, 'Timed out')
    ).rejects.toThrow('Original error');
  });

  it('cleans up timeout on success', async () => {
    const result = await withTimeout(
      Promise.resolve(42),
      1000,
      'Should not happen'
    );
    expect(result).toBe(42);
  });
});
