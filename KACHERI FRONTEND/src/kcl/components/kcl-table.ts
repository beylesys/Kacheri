/* === kcl-table — Data Table v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, TableData, TableColumn } from '../types.ts';
import { getIconSvg } from '../icons.ts';

export class KCLTable extends KCLBaseElement {
  private _sortKey: string | null = null;
  private _sortDir: 'asc' | 'desc' | null = null;

  static get observedAttributes(): string[] {
    return ['sortable', 'striped', 'compact', 'max-height', 'sticky-column'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'columns', label: 'Columns', type: 'json', isAttribute: false, group: 'content' },
      { name: 'rows', label: 'Rows', type: 'json', isAttribute: false, group: 'content' },
      { name: 'sortable', label: 'Sortable', type: 'boolean', isAttribute: true, group: 'behavior', defaultValue: false },
      { name: 'striped', label: 'Striped Rows', type: 'boolean', isAttribute: true, group: 'appearance', defaultValue: false },
      { name: 'compact', label: 'Compact', type: 'boolean', isAttribute: true, group: 'appearance', defaultValue: false },
      { name: 'max-height', label: 'Max Height (px)', type: 'number', min: 0, max: 2000, step: 50, isAttribute: true, group: 'layout' },
      { name: 'sticky-column', label: 'Sticky First Column', type: 'boolean', isAttribute: true, group: 'layout', defaultValue: false },
    ];
  }

  protected render(): void {
    const sortable = this.boolAttr('sortable');
    const striped = this.boolAttr('striped');
    const compact = this.boolAttr('compact');
    const maxHeight = this.numAttr('max-height', 0);
    const stickyColumn = this.boolAttr('sticky-column');

    const data = this.data as TableData | undefined;

    if (!data?.columns?.length || !data?.rows?.length) {
      this.innerHTML = '<div class="kcl-table-empty">No data</div>';
      return;
    }

    this.innerHTML = '';

    // Wrapper for overflow
    const wrapper = document.createElement('div');
    wrapper.className = 'kcl-table-wrapper';
    if (maxHeight > 0) {
      wrapper.style.maxHeight = `${maxHeight}px`;
      wrapper.style.overflowY = 'auto';
    }

    // Table
    const table = document.createElement('table');
    table.className = 'kcl-table';
    if (compact) table.classList.add('kcl-table--compact');
    table.setAttribute('role', 'table');

    // Head
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    for (let ci = 0; ci < data.columns.length; ci++) {
      const col = data.columns[ci];
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      if (col.align) th.style.textAlign = col.align;
      if (col.width) th.style.width = col.width;
      if (stickyColumn && ci === 0) th.classList.add('kcl-table-sticky-col');

      if (sortable) {
        const btn = document.createElement('button');
        btn.className = 'kcl-table-sort-btn';
        btn.type = 'button';
        btn.textContent = col.label;

        const sortState = this._sortKey === col.key ? this._sortDir : null;
        const ariaSort = sortState === 'asc' ? 'ascending' : sortState === 'desc' ? 'descending' : 'none';
        btn.setAttribute('aria-sort', ariaSort);
        btn.setAttribute('aria-label', `Sort by ${col.label}, currently ${ariaSort}`);

        // Sort indicator
        const iconSpan = document.createElement('span');
        const isActive = this._sortKey === col.key && this._sortDir !== null;
        iconSpan.className = isActive ? 'kcl-table-sort-icon kcl-table-sort-icon--active' : 'kcl-table-sort-icon';
        const iconName = this._sortDir === 'desc' && this._sortKey === col.key ? 'chevron-down' : 'chevron-up';
        iconSpan.innerHTML = getIconSvg(iconName, 14, 2) ?? '';
        btn.appendChild(iconSpan);

        btn.addEventListener('click', () => this.handleSort(col.key));
        th.appendChild(btn);
      } else {
        th.textContent = col.label;
      }

      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Sort rows
    const rows = this.getSortedRows(data.rows, data.columns);

    // Body
    const tbody = document.createElement('tbody');
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const tr = document.createElement('tr');
      if (striped && ri % 2 === 1) tr.classList.add('kcl-table-row--striped');

      for (let ci = 0; ci < data.columns.length; ci++) {
        const col = data.columns[ci];
        const td = document.createElement('td');
        if (col.align) td.style.textAlign = col.align;
        if (stickyColumn && ci === 0) td.classList.add('kcl-table-sticky-col');
        td.textContent = row[col.key] != null ? String(row[col.key]) : '';
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrapper.appendChild(table);
    this.appendChild(wrapper);
  }

  private handleSort(key: string): void {
    if (this._sortKey === key) {
      if (this._sortDir === 'asc') this._sortDir = 'desc';
      else if (this._sortDir === 'desc') { this._sortKey = null; this._sortDir = null; }
      else this._sortDir = 'asc';
    } else {
      this._sortKey = key;
      this._sortDir = 'asc';
    }
    this.scheduleRender();
  }

  private getSortedRows(
    rows: Record<string, unknown>[],
    _columns: TableColumn[],
  ): Record<string, unknown>[] {
    if (!this._sortKey || !this._sortDir) return rows;
    const key = this._sortKey;
    const dir = this._sortDir === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return dir;
      if (vb == null) return -dir;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }
}

customElements.define('kcl-table', KCLTable);
