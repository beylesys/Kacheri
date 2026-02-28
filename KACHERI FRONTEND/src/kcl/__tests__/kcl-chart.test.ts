import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

const barData = {
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  datasets: [{ label: 'Sales', values: [120, 190, 300, 250] }],
};

const multiData = {
  labels: ['Q1', 'Q2', 'Q3'],
  datasets: [
    { label: 'Revenue', values: [100, 200, 150] },
    { label: 'Expenses', values: [80, 120, 100] },
  ],
};

const pieData = {
  labels: ['A', 'B', 'C'],
  datasets: [{ label: 'Distribution', values: [40, 35, 25] }],
};

describe('kcl-chart', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders bar chart with correct number of rects', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'bar');
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    const rects = el.querySelectorAll('rect');
    expect(rects.length).toBe(4);
  });

  it('renders line chart with polyline element', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'line');
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    const polylines = el.querySelectorAll('polyline');
    expect(polylines.length).toBe(1);
  });

  it('renders pie chart with path elements', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'pie');
    document.body.appendChild(el);
    el.bindData(pieData);
    await tick();
    const paths = el.querySelectorAll('path');
    expect(paths.length).toBe(3);
  });

  it('renders donut chart with path elements', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'donut');
    document.body.appendChild(el);
    el.bindData(pieData);
    await tick();
    const paths = el.querySelectorAll('path');
    expect(paths.length).toBe(3);
  });

  it('renders scatter chart with circle elements', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'scatter');
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    const circles = el.querySelectorAll('circle');
    expect(circles.length).toBe(4);
  });

  it('renders area chart with path and polyline', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'area');
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    expect(el.querySelector('path')).toBeTruthy();
    expect(el.querySelector('polyline')).toBeTruthy();
  });

  it('shows empty state when no data', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ labels: [], datasets: [] });
    await tick();
    expect(el.querySelector('.kcl-chart-empty')).toBeTruthy();
  });

  it('renders legend for multiple datasets', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'bar');
    el.setAttribute('legend', '');
    document.body.appendChild(el);
    el.bindData(multiData);
    await tick();
    const legendItems = el.querySelectorAll('.kcl-chart-legend-item');
    expect(legendItems.length).toBe(2);
  });

  it('renders legend for pie chart labels', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'pie');
    el.setAttribute('legend', '');
    document.body.appendChild(el);
    el.bindData(pieData);
    await tick();
    const legendItems = el.querySelectorAll('.kcl-chart-legend-item');
    expect(legendItems.length).toBe(3);
  });

  it('renders accessible summary table (visually hidden)', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    const srTable = el.querySelector('.kcl-sr-only table');
    expect(srTable).toBeTruthy();
    const rows = srTable!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(4);
  });

  it('renders axis labels when attribute present', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'bar');
    el.setAttribute('axis-labels', '');
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    const textEls = el.querySelectorAll('text');
    expect(textEls.length).toBeGreaterThan(0);
  });

  it('does not render axis labels without attribute', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'bar');
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    const textEls = el.querySelectorAll('text');
    expect(textEls.length).toBe(0);
  });

  it('handles zero values without crashing', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'bar');
    document.body.appendChild(el);
    el.bindData({ labels: ['A', 'B'], datasets: [{ label: 'X', values: [0, 0] }] });
    await tick();
    expect(el.querySelector('svg')).toBeTruthy();
  });

  it('defaults to bar chart when type is unrecognized', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('type', 'invalid');
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    const rects = el.querySelectorAll('rect');
    expect(rects.length).toBe(4);
  });

  it('has SVG with role=img and aria-hidden', async () => {
    const el = document.createElement('kcl-chart') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(barData);
    await tick();
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-chart') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
