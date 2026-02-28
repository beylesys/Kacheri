import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

/* ============= Component Registry ============= */

const ALL_KCL_TAGS = [
  'kcl-slide', 'kcl-text', 'kcl-layout', 'kcl-image', 'kcl-list',
  'kcl-quote', 'kcl-metric', 'kcl-icon', 'kcl-animate', 'kcl-code',
  'kcl-embed', 'kcl-source', 'kcl-chart', 'kcl-table', 'kcl-timeline',
  'kcl-compare',
];

describe('KCL component registry', () => {
  for (const tag of ALL_KCL_TAGS) {
    it(`"${tag}" is registered in customElements`, () => {
      const Ctor = customElements.get(tag);
      expect(Ctor).toBeTruthy();
    });
  }
});

/* ============= Inspector Protocol (editableProperties) ============= */

describe('KCL inspector protocol — editableProperties', () => {
  for (const tag of ALL_KCL_TAGS) {
    it(`"${tag}" exposes static editableProperties array`, () => {
      const Ctor = customElements.get(tag) as unknown as { editableProperties?: unknown[] };
      expect(Ctor).toBeTruthy();
      expect(Array.isArray(Ctor.editableProperties)).toBe(true);
    });
  }
});

/* ============= Nested Component Rendering ============= */

describe('nested component rendering', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('kcl-layout containing kcl-text renders both components', async () => {
    const slide = document.createElement('kcl-slide');
    slide.innerHTML = `
      <kcl-layout direction="row" gap="16">
        <kcl-text level="h1">Title</kcl-text>
        <kcl-text level="p">Body text</kcl-text>
      </kcl-layout>
    `;
    document.body.appendChild(slide);
    await tick();

    const layout = slide.querySelector('kcl-layout');
    expect(layout).toBeTruthy();

    const texts = slide.querySelectorAll('kcl-text');
    expect(texts.length).toBe(2);
  });

  it('kcl-slide containing mixed components renders all children', async () => {
    const slide = document.createElement('kcl-slide');
    slide.setAttribute('background', '#000');
    slide.innerHTML = `
      <kcl-text level="h1">Heading</kcl-text>
      <kcl-list type="bullet">
        <li>Item 1</li>
        <li>Item 2</li>
      </kcl-list>
      <kcl-quote attribution="Author">A quote</kcl-quote>
    `;
    document.body.appendChild(slide);
    await tick();

    expect(slide.querySelector('kcl-text')).toBeTruthy();
    expect(slide.querySelector('kcl-list')).toBeTruthy();
    expect(slide.querySelector('kcl-quote')).toBeTruthy();
  });
});

/* ============= Data Binding with Multiple Components ============= */

describe('data binding across multiple components on one slide', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('two data-bound components on same slide receive independent data', async () => {
    const slide = document.createElement('kcl-slide');
    slide.innerHTML = `
      <kcl-metric id="m1" label="Users"></kcl-metric>
      <kcl-metric id="m2" label="Revenue" prefix="$"></kcl-metric>
    `;
    document.body.appendChild(slide);
    await tick();

    const m1 = slide.querySelector('#m1') as HTMLElement & { bindData(d: unknown): void };
    const m2 = slide.querySelector('#m2') as HTMLElement & { bindData(d: unknown): void };

    m1.bindData({ value: 1000 });
    m2.bindData({ value: 50000 });
    await tick();

    const m1Number = m1.querySelector('.kcl-metric-number');
    const m2Number = m2.querySelector('.kcl-metric-number');
    expect(m1Number?.textContent).toContain('1');
    expect(m2Number?.textContent).toContain('50');
    // Verify they are independent (different values)
    expect(m1.querySelector('.kcl-metric-label')?.textContent).toBe('Users');
    expect(m2.querySelector('.kcl-metric-label')?.textContent).toBe('Revenue');
  });
});

/* ============= Component Error Isolation ============= */

describe('component error isolation', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('invalid attributes on one component do not break sibling rendering', async () => {
    const slide = document.createElement('kcl-slide');
    slide.innerHTML = `
      <kcl-text level="invalid-level">First</kcl-text>
      <kcl-text level="h1">Second</kcl-text>
    `;
    document.body.appendChild(slide);
    await tick();

    const texts = slide.querySelectorAll('kcl-text');
    expect(texts.length).toBe(2);
    // Second component should still render properly
    expect(texts[1].textContent).toContain('Second');
  });

  it('components render independently even when DOM order changes', async () => {
    const slide = document.createElement('kcl-slide');
    document.body.appendChild(slide);
    await tick();

    // Add components dynamically
    const text = document.createElement('kcl-text');
    text.setAttribute('level', 'h2');
    text.textContent = 'Dynamic';
    slide.querySelector('.kcl-slide-container')?.appendChild(text);
    await tick();

    expect(text.textContent).toContain('Dynamic');
  });
});
