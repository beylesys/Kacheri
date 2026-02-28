/* === kcl-chart — Data Charts v1.0.0 === */

import { KCLBaseElement } from '../base.ts';
import type { PropertySchema, ChartData } from '../types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

const FALLBACK_PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
];

interface PlotArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export class KCLChart extends KCLBaseElement {
  private _resizeObserver: ResizeObserver | null = null;
  private _width = 0;
  private _height = 0;

  static get observedAttributes(): string[] {
    return ['type', 'palette', 'animate', 'legend', 'axis-labels'];
  }

  static override get editableProperties(): PropertySchema[] {
    return [
      { name: 'labels', label: 'Labels', type: 'json', isAttribute: false, group: 'content' },
      { name: 'datasets', label: 'Datasets', type: 'json', isAttribute: false, group: 'content' },
      { name: 'type', label: 'Chart Type', type: 'select', options: ['bar', 'line', 'pie', 'donut', 'scatter', 'area'], isAttribute: true, group: 'appearance', defaultValue: 'bar' },
      { name: 'palette', label: 'Color Palette', type: 'text', isAttribute: true, group: 'appearance' },
      { name: 'animate', label: 'Animate', type: 'boolean', isAttribute: true, group: 'animation', defaultValue: true },
      { name: 'legend', label: 'Show Legend', type: 'boolean', isAttribute: true, group: 'appearance', defaultValue: true },
      { name: 'axis-labels', label: 'Show Axis Labels', type: 'boolean', isAttribute: true, group: 'appearance', defaultValue: true },
    ];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (Math.abs(width - this._width) > 1 || Math.abs(height - this._height) > 1) {
          this._width = width;
          this._height = height;
          this.scheduleRender();
        }
      }
    });
    this._resizeObserver.observe(this);
  }

  protected override onDisconnect(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
  }

  protected render(): void {
    const type = this.attr('type', 'bar');
    const shouldAnimate = this.boolAttr('animate') && !this.prefersReducedMotion;
    const showLegend = this.boolAttr('legend');
    const showAxisLabels = this.boolAttr('axis-labels');
    const data = this.data as ChartData | undefined;

    if (!data?.labels?.length || !data?.datasets?.length) {
      this.innerHTML = '<div class="kcl-chart-empty">No chart data</div>';
      return;
    }

    // Measure
    const rect = this.getBoundingClientRect();
    this._width = rect.width || 300;
    this._height = rect.height || 200;

    this.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'kcl-chart-container';

    const isCartesian = ['bar', 'line', 'area', 'scatter'].includes(type);

    if (isCartesian) {
      const svg = this.createSvg();
      const area = this.computePlotArea(showAxisLabels);

      switch (type) {
        case 'line': this.renderLine(svg, data, area, shouldAnimate); break;
        case 'area': this.renderArea(svg, data, area, shouldAnimate); break;
        case 'scatter': this.renderScatter(svg, data, area, shouldAnimate); break;
        default: this.renderBar(svg, data, area, shouldAnimate); break;
      }

      if (showAxisLabels) {
        this.renderAxes(svg, data, area);
      }

      container.appendChild(svg);
    } else {
      const svg = this.createSvg();
      const cx = this._width / 2;
      const cy = this._height / 2;
      const radius = Math.min(cx, cy) - 20;

      if (type === 'donut') {
        this.renderDonut(svg, data, cx, cy, radius, radius * 0.6, shouldAnimate);
      } else {
        this.renderPie(svg, data, cx, cy, radius, shouldAnimate);
      }

      container.appendChild(svg);
    }

    // Legend
    if (showLegend) {
      this.renderLegend(container, data, isCartesian);
    }

    // Accessible summary table (visually hidden)
    this.renderAccessibleTable(container, data);

    this.appendChild(container);
  }

  // --- SVG helpers ---

  private createSvg(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${this._width} ${this._height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'block';
    return svg;
  }

  private svgEl(tag: string): SVGElement {
    return document.createElementNS(SVG_NS, tag);
  }

  private computePlotArea(showAxisLabels: boolean): PlotArea {
    const left = showAxisLabels ? 50 : 10;
    const right = 10;
    const top = 10;
    const bottom = showAxisLabels ? 30 : 10;
    return {
      left,
      right,
      top,
      bottom,
      width: this._width - left - right,
      height: this._height - top - bottom,
    };
  }

  private getColor(index: number, dataset?: { color?: string }): string {
    if (dataset?.color) return dataset.color;
    // Custom palette override (Phase 6 — F1)
    const paletteAttr = this.attr('palette');
    if (paletteAttr) {
      const custom = paletteAttr.split(',').map(c => c.trim()).filter(Boolean);
      if (custom.length > 0) return custom[index % custom.length];
    }
    return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
  }

  private getMaxValue(data: ChartData): number {
    let max = 0;
    for (const ds of data.datasets) {
      for (const v of ds.values) {
        if (v > max) max = v;
      }
    }
    return max || 1;
  }

  private formatAxisValue(val: number): string {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
    return val % 1 === 0 ? String(val) : val.toFixed(1);
  }

  // --- Bar chart ---

  private renderBar(svg: SVGSVGElement, data: ChartData, area: PlotArea, animate: boolean): void {
    const maxVal = this.getMaxValue(data);
    const groupWidth = area.width / data.labels.length;
    const barGap = 4;
    const barWidth = (groupWidth - barGap * 2) / data.datasets.length;

    for (let di = 0; di < data.datasets.length; di++) {
      const ds = data.datasets[di];
      const color = this.getColor(di, ds);

      for (let li = 0; li < data.labels.length; li++) {
        const val = ds.values[li] ?? 0;
        const barH = (val / maxVal) * area.height;
        const x = area.left + li * groupWidth + di * barWidth + barGap;
        const y = area.top + area.height - barH;

        const rect = this.svgEl('rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(Math.max(barWidth, 1)));
        rect.setAttribute('height', String(barH));
        rect.setAttribute('fill', color);
        rect.setAttribute('rx', '2');

        if (animate) {
          (rect as SVGElement & { style: CSSStyleDeclaration }).style.transformOrigin =
            `${x + barWidth / 2}px ${area.top + area.height}px`;
          (rect as SVGElement & { style: CSSStyleDeclaration }).style.animation =
            `kcl-bar-grow 400ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) ${(li * data.datasets.length + di) * 50}ms both`;
        }

        svg.appendChild(rect);
      }
    }
  }

  // --- Line chart ---

  private renderLine(svg: SVGSVGElement, data: ChartData, area: PlotArea, animate: boolean): void {
    const maxVal = this.getMaxValue(data);
    const N = data.labels.length;

    for (let di = 0; di < data.datasets.length; di++) {
      const ds = data.datasets[di];
      const color = this.getColor(di, ds);
      const points: [number, number][] = [];

      for (let li = 0; li < N; li++) {
        const val = ds.values[li] ?? 0;
        const x = N === 1 ? area.left + area.width / 2 : area.left + (li / (N - 1)) * area.width;
        const y = area.top + area.height - (val / maxVal) * area.height;
        points.push([x, y]);
      }

      const polyline = this.svgEl('polyline');
      polyline.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', color);
      polyline.setAttribute('stroke-width', '2');
      polyline.setAttribute('stroke-linejoin', 'round');

      if (animate) {
        const totalLength = this.computePolylineLength(points);
        (polyline as SVGElement & { style: CSSStyleDeclaration }).style.strokeDasharray = String(totalLength);
        (polyline as SVGElement & { style: CSSStyleDeclaration }).style.strokeDashoffset = String(totalLength);
        (polyline as SVGElement & { style: CSSStyleDeclaration }).style.animation =
          `kcl-line-draw 800ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) ${di * 200}ms forwards`;
      }

      svg.appendChild(polyline);

      // Data point dots
      for (let li = 0; li < points.length; li++) {
        const circle = this.svgEl('circle');
        circle.setAttribute('cx', String(points[li][0]));
        circle.setAttribute('cy', String(points[li][1]));
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', color);

        if (animate) {
          (circle as SVGElement & { style: CSSStyleDeclaration }).style.opacity = '0';
          (circle as SVGElement & { style: CSSStyleDeclaration }).style.animation =
            `kcl-fade-in 300ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) ${di * 200 + 600}ms forwards`;
        }

        svg.appendChild(circle);
      }
    }
  }

  // --- Area chart ---

  private renderArea(svg: SVGSVGElement, data: ChartData, area: PlotArea, animate: boolean): void {
    const maxVal = this.getMaxValue(data);
    const N = data.labels.length;

    for (let di = 0; di < data.datasets.length; di++) {
      const ds = data.datasets[di];
      const color = this.getColor(di, ds);
      const points: [number, number][] = [];

      for (let li = 0; li < N; li++) {
        const val = ds.values[li] ?? 0;
        const x = N === 1 ? area.left + area.width / 2 : area.left + (li / (N - 1)) * area.width;
        const y = area.top + area.height - (val / maxVal) * area.height;
        points.push([x, y]);
      }

      // Filled area
      const baseline = area.top + area.height;
      const firstX = points[0][0];
      const lastX = points[points.length - 1][0];
      const pathD = [
        `M ${firstX},${baseline}`,
        ...points.map(([x, y]) => `L ${x},${y}`),
        `L ${lastX},${baseline}`,
        'Z',
      ].join(' ');

      const areaPath = this.svgEl('path');
      areaPath.setAttribute('d', pathD);
      areaPath.setAttribute('fill', color);
      areaPath.setAttribute('fill-opacity', '0.2');

      if (animate) {
        (areaPath as SVGElement & { style: CSSStyleDeclaration }).style.opacity = '0';
        (areaPath as SVGElement & { style: CSSStyleDeclaration }).style.animation =
          `kcl-fade-in 600ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) ${di * 200}ms forwards`;
      }

      svg.appendChild(areaPath);

      // Line on top
      const polyline = this.svgEl('polyline');
      polyline.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', color);
      polyline.setAttribute('stroke-width', '2');
      polyline.setAttribute('stroke-linejoin', 'round');

      if (animate) {
        const totalLength = this.computePolylineLength(points);
        (polyline as SVGElement & { style: CSSStyleDeclaration }).style.strokeDasharray = String(totalLength);
        (polyline as SVGElement & { style: CSSStyleDeclaration }).style.strokeDashoffset = String(totalLength);
        (polyline as SVGElement & { style: CSSStyleDeclaration }).style.animation =
          `kcl-line-draw 800ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) ${di * 200}ms forwards`;
      }

      svg.appendChild(polyline);
    }
  }

  // --- Pie chart ---

  private renderPie(
    svg: SVGSVGElement, data: ChartData,
    cx: number, cy: number, radius: number,
    animate: boolean,
  ): void {
    const values = data.datasets[0]?.values ?? [];
    const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;

    for (let i = 0; i < values.length; i++) {
      const val = Math.max(values[i], 0);
      if (val === 0) continue;
      const sliceAngle = (val / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      const largeArc = sliceAngle > Math.PI ? 1 : 0;

      // Handle full circle (single value)
      let d: string;
      if (values.filter(v => v > 0).length === 1) {
        // Full circle: use two arcs
        const mx = cx + radius * Math.cos(startAngle + Math.PI);
        const my = cy + radius * Math.sin(startAngle + Math.PI);
        d = [
          `M ${x1} ${y1}`,
          `A ${radius} ${radius} 0 0 1 ${mx} ${my}`,
          `A ${radius} ${radius} 0 0 1 ${x1} ${y1}`,
          'Z',
        ].join(' ');
      } else {
        d = [
          `M ${cx} ${cy}`,
          `L ${x1} ${y1}`,
          `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
          'Z',
        ].join(' ');
      }

      const path = this.svgEl('path');
      path.setAttribute('d', d);
      path.setAttribute('fill', this.getColor(i));

      if (animate) {
        (path as SVGElement & { style: CSSStyleDeclaration }).style.opacity = '0';
        (path as SVGElement & { style: CSSStyleDeclaration }).style.animation =
          `kcl-fade-in 300ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) ${i * 80}ms forwards`;
      }

      svg.appendChild(path);
      startAngle = endAngle;
    }
  }

  // --- Donut chart ---

  private renderDonut(
    svg: SVGSVGElement, data: ChartData,
    cx: number, cy: number, outerR: number, innerR: number,
    animate: boolean,
  ): void {
    const values = data.datasets[0]?.values ?? [];
    const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;

    for (let i = 0; i < values.length; i++) {
      const val = Math.max(values[i], 0);
      if (val === 0) continue;
      const sliceAngle = (val / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const largeArc = sliceAngle > Math.PI ? 1 : 0;

      const ox1 = cx + outerR * Math.cos(startAngle);
      const oy1 = cy + outerR * Math.sin(startAngle);
      const ox2 = cx + outerR * Math.cos(endAngle);
      const oy2 = cy + outerR * Math.sin(endAngle);
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);

      const d = [
        `M ${ox1} ${oy1}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2}`,
        `L ${ix2} ${iy2}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}`,
        'Z',
      ].join(' ');

      const path = this.svgEl('path');
      path.setAttribute('d', d);
      path.setAttribute('fill', this.getColor(i));

      if (animate) {
        (path as SVGElement & { style: CSSStyleDeclaration }).style.opacity = '0';
        (path as SVGElement & { style: CSSStyleDeclaration }).style.animation =
          `kcl-fade-in 300ms var(--kcl-easing-out, cubic-bezier(0,0,0.2,1)) ${i * 80}ms forwards`;
      }

      svg.appendChild(path);
      startAngle = endAngle;
    }
  }

  // --- Scatter chart ---

  private renderScatter(svg: SVGSVGElement, data: ChartData, area: PlotArea, animate: boolean): void {
    const maxVal = this.getMaxValue(data);
    const N = data.labels.length;

    for (let di = 0; di < data.datasets.length; di++) {
      const ds = data.datasets[di];
      const color = this.getColor(di, ds);

      for (let li = 0; li < N; li++) {
        const val = ds.values[li] ?? 0;
        const x = N === 1 ? area.left + area.width / 2 : area.left + (li / (N - 1)) * area.width;
        const y = area.top + area.height - (val / maxVal) * area.height;

        const circle = this.svgEl('circle');
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', color);

        if (animate) {
          (circle as SVGElement & { style: CSSStyleDeclaration }).style.transformOrigin = `${x}px ${y}px`;
          (circle as SVGElement & { style: CSSStyleDeclaration }).style.animation =
            `kcl-scatter-pop 300ms var(--kcl-easing-bounce, cubic-bezier(0.34,1.56,0.64,1)) ${(di * N + li) * 30}ms both`;
        }

        svg.appendChild(circle);
      }
    }
  }

  // --- Axes ---

  private renderAxes(svg: SVGSVGElement, data: ChartData, area: PlotArea): void {
    const maxVal = this.getMaxValue(data);

    // X-axis baseline
    const xLine = this.svgEl('line');
    xLine.setAttribute('x1', String(area.left));
    xLine.setAttribute('y1', String(area.top + area.height));
    xLine.setAttribute('x2', String(area.left + area.width));
    xLine.setAttribute('y2', String(area.top + area.height));
    xLine.setAttribute('stroke', '#e2e8f0');
    xLine.setAttribute('stroke-width', '1');
    svg.appendChild(xLine);

    // Y-axis baseline
    const yLine = this.svgEl('line');
    yLine.setAttribute('x1', String(area.left));
    yLine.setAttribute('y1', String(area.top));
    yLine.setAttribute('x2', String(area.left));
    yLine.setAttribute('y2', String(area.top + area.height));
    yLine.setAttribute('stroke', '#e2e8f0');
    yLine.setAttribute('stroke-width', '1');
    svg.appendChild(yLine);

    // X-axis labels
    const groupWidth = area.width / data.labels.length;
    for (let i = 0; i < data.labels.length; i++) {
      const text = this.svgEl('text') as SVGTextElement;
      text.setAttribute('x', String(area.left + i * groupWidth + groupWidth / 2));
      text.setAttribute('y', String(area.top + area.height + 20));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', '#64748b');
      text.textContent = data.labels[i];
      svg.appendChild(text);
    }

    // Y-axis ticks
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const val = (maxVal / tickCount) * i;
      const y = area.top + area.height - (val / maxVal) * area.height;

      const text = this.svgEl('text') as SVGTextElement;
      text.setAttribute('x', String(area.left - 8));
      text.setAttribute('y', String(y + 4));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', '#64748b');
      text.textContent = this.formatAxisValue(val);
      svg.appendChild(text);

      // Grid line
      if (i > 0) {
        const gridLine = this.svgEl('line');
        gridLine.setAttribute('x1', String(area.left));
        gridLine.setAttribute('y1', String(y));
        gridLine.setAttribute('x2', String(area.left + area.width));
        gridLine.setAttribute('y2', String(y));
        gridLine.setAttribute('stroke', '#e2e8f0');
        gridLine.setAttribute('stroke-width', '0.5');
        gridLine.setAttribute('stroke-dasharray', '4 4');
        svg.appendChild(gridLine);
      }
    }
  }

  // --- Legend ---

  private renderLegend(container: HTMLElement, data: ChartData, isCartesian: boolean): void {
    const items = isCartesian ? data.datasets : data.labels.map((label, i) => ({ label, color: this.getColor(i) }));
    if (items.length <= 1 && isCartesian) return;

    const legend = document.createElement('div');
    legend.className = 'kcl-chart-legend';
    legend.setAttribute('role', 'list');
    legend.setAttribute('aria-label', 'Chart legend');

    for (let i = 0; i < items.length; i++) {
      const item = document.createElement('div');
      item.className = 'kcl-chart-legend-item';
      item.setAttribute('role', 'listitem');

      const swatch = document.createElement('span');
      swatch.className = 'kcl-chart-legend-swatch';
      const color = isCartesian
        ? (data.datasets[i] as { color?: string }).color || this.getColor(i)
        : this.getColor(i);
      swatch.style.backgroundColor = color;

      const label = document.createElement('span');
      label.className = 'kcl-chart-legend-label';
      label.textContent = (items[i] as { label: string }).label;

      item.appendChild(swatch);
      item.appendChild(label);
      legend.appendChild(item);
    }

    container.appendChild(legend);
  }

  // --- Accessible summary table ---

  private renderAccessibleTable(container: HTMLElement, data: ChartData): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'kcl-sr-only';

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const th0 = document.createElement('th');
    th0.textContent = 'Category';
    th0.setAttribute('scope', 'col');
    headerRow.appendChild(th0);

    for (const ds of data.datasets) {
      const th = document.createElement('th');
      th.textContent = ds.label;
      th.setAttribute('scope', 'col');
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 0; i < data.labels.length; i++) {
      const row = document.createElement('tr');
      const labelCell = document.createElement('td');
      labelCell.textContent = data.labels[i];
      row.appendChild(labelCell);
      for (const ds of data.datasets) {
        const cell = document.createElement('td');
        cell.textContent = String(ds.values[i] ?? '');
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }

  // --- Utility ---

  private computePolylineLength(points: [number, number][]): number {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i][0] - points[i - 1][0];
      const dy = points[i][1] - points[i - 1][1];
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len || 1;
  }
}

customElements.define('kcl-chart', KCLChart);
