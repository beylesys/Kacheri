import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

const sampleData = {
  events: [
    { date: '2025-01', title: 'Phase 1', description: 'Foundation' },
    { date: '2025-06', title: 'Phase 2', description: 'Growth' },
    { date: '2025-12', title: 'Phase 3', description: 'Scale' },
  ],
};

describe('kcl-timeline', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders correct number of events', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const events = el.querySelectorAll('.kcl-timeline-event');
    expect(events.length).toBe(3);
  });

  it('renders event title and date', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const title = el.querySelector('.kcl-timeline-title');
    expect(title?.textContent).toBe('Phase 1');
    const time = el.querySelector('time');
    expect(time?.textContent).toBe('2025-01');
  });

  it('renders optional description', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const desc = el.querySelector('.kcl-timeline-desc');
    expect(desc?.textContent).toBe('Foundation');
  });

  it('renders vertical layout by default', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    expect(el.querySelector('.kcl-timeline--vertical')).toBeTruthy();
  });

  it('renders horizontal layout when direction="horizontal"', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('direction', 'horizontal');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    expect(el.querySelector('.kcl-timeline--horizontal')).toBeTruthy();
  });

  it('renders connector elements between events', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const connector = el.querySelector('.kcl-timeline-v-connector');
    expect(connector).toBeTruthy();
  });

  it('renders horizontal connectors in horizontal mode', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('direction', 'horizontal');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const connectors = el.querySelectorAll('.kcl-timeline-h-connector');
    expect(connectors.length).toBe(2); // between 3 events = 2 connectors
  });

  it('renders icon in dot when provided', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({
      events: [{ date: '2025', title: 'Start', icon: 'check' }],
    });
    await tick();
    const dot = el.querySelector('.kcl-timeline-dot');
    expect(dot?.querySelector('svg')).toBeTruthy();
  });

  it('applies custom color to dot', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({
      events: [{ date: '2025', title: 'Test', color: '#ff0000' }],
    });
    await tick();
    const dot = el.querySelector('.kcl-timeline-dot') as HTMLElement;
    expect(dot.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('shows empty state when no events', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ events: [] });
    await tick();
    expect(el.querySelector('.kcl-timeline-empty')).toBeTruthy();
  });

  it('has list role and listitem roles', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const list = el.querySelector('[role="list"]');
    expect(list).toBeTruthy();
    const items = el.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(3);
  });

  it('uses <time> element with datetime attribute', async () => {
    const el = document.createElement('kcl-timeline') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const time = el.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2025-01');
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-timeline') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
