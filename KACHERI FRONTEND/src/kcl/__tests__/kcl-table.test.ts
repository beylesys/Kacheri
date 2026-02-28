import { describe, it, expect, beforeEach } from 'vitest';
import '../kcl.ts';

function tick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('kcl-table', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  const sampleData = {
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'age', label: 'Age', align: 'right' as const },
      { key: 'city', label: 'City' },
    ],
    rows: [
      { name: 'Alice', age: 30, city: 'NYC' },
      { name: 'Bob', age: 25, city: 'LA' },
      { name: 'Charlie', age: 35, city: 'Chicago' },
    ],
  };

  it('renders table with correct column headers', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const headers = el.querySelectorAll('th');
    expect(headers.length).toBe(3);
    expect(headers[0].textContent).toBe('Name');
    expect(headers[1].textContent).toBe('Age');
    expect(headers[2].textContent).toBe('City');
  });

  it('renders correct number of rows', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('renders cell values using column keys', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const firstRowCells = el.querySelectorAll('tbody tr:first-child td');
    expect(firstRowCells[0].textContent).toBe('Alice');
    expect(firstRowCells[1].textContent).toBe('30');
    expect(firstRowCells[2].textContent).toBe('NYC');
  });

  it('shows empty state when no data', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData({ columns: [], rows: [] });
    await tick();
    expect(el.querySelector('.kcl-table-empty')).toBeTruthy();
    expect(el.querySelector('.kcl-table-empty')?.textContent).toBe('No data');
  });

  it('renders sort buttons when sortable attribute set', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('sortable', '');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const buttons = el.querySelectorAll('.kcl-table-sort-btn');
    expect(buttons.length).toBe(3);
  });

  it('sorts ascending then descending on header click', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('sortable', '');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();

    // Click Age header to sort ascending
    const ageBtn = el.querySelectorAll('.kcl-table-sort-btn')[1] as HTMLButtonElement;
    ageBtn.click();
    await tick();

    let firstCell = el.querySelector('tbody tr:first-child td:nth-child(2)');
    expect(firstCell?.textContent).toBe('25'); // Bob (youngest)

    // Click again to sort descending
    const ageBtnAgain = el.querySelectorAll('.kcl-table-sort-btn')[1] as HTMLButtonElement;
    ageBtnAgain.click();
    await tick();

    firstCell = el.querySelector('tbody tr:first-child td:nth-child(2)');
    expect(firstCell?.textContent).toBe('35'); // Charlie (oldest)
  });

  it('applies striped class to even rows', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('striped', '');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const rows = el.querySelectorAll('tbody tr');
    expect(rows[0].classList.contains('kcl-table-row--striped')).toBe(false);
    expect(rows[1].classList.contains('kcl-table-row--striped')).toBe(true);
    expect(rows[2].classList.contains('kcl-table-row--striped')).toBe(false);
  });

  it('applies compact class', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('compact', '');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    expect(el.querySelector('.kcl-table--compact')).toBeTruthy();
  });

  it('sets max-height on wrapper', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    el.setAttribute('max-height', '300');
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const wrapper = el.querySelector('.kcl-table-wrapper') as HTMLElement;
    expect(wrapper.style.maxHeight).toBe('300px');
  });

  it('applies column alignment', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const ageTh = el.querySelectorAll('th')[1] as HTMLElement;
    const ageTd = el.querySelector('tbody tr:first-child td:nth-child(2)') as HTMLElement;
    expect(ageTh.style.textAlign).toBe('right');
    expect(ageTd.style.textAlign).toBe('right');
  });

  it('has th with scope="col"', async () => {
    const el = document.createElement('kcl-table') as HTMLElement & { bindData(d: unknown): void };
    document.body.appendChild(el);
    el.bindData(sampleData);
    await tick();
    const headers = el.querySelectorAll('th');
    for (const th of headers) {
      expect(th.getAttribute('scope')).toBe('col');
    }
  });

  it('exposes editableProperties', () => {
    const Ctor = customElements.get('kcl-table') as unknown as { editableProperties: unknown[] };
    expect(Ctor.editableProperties.length).toBeGreaterThan(0);
  });
});
