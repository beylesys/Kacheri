// KACHERI FRONTEND/src/components/knowledge/DocLinkGraph.tsx
// Interactive force-directed graph visualization of workspace document links.
// Nodes = documents, edges = doc_links (cross-document references).
// Uses custom force simulation + SVG rendering — no external dependencies.
//
// See: Docs/Roadmap/phase2-product-features-work-scope.md — Slice 9 (D0)

import {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
  type CSSProperties,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { DocsAPI, type DocMeta } from '../../api';
import { docLinksApi, type DocLink } from '../../api/docLinks';

/* ================================================================
   Types
   ================================================================ */

interface GraphNode {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null; // fixed x (during drag)
  fy: number | null; // fixed y (during drag)
  linkCount: number; // inbound + outbound
  synthetic: boolean; // true if toDocId not in docs list
}

interface GraphEdge {
  id: number;
  source: string; // fromDocId
  target: string; // toDocId
  linkText: string | null;
}

interface Transform {
  x: number;
  y: number;
  k: number; // zoom scale
}

interface TooltipState {
  x: number;
  y: number;
  node: GraphNode;
}

interface EdgeDetailState {
  x: number;
  y: number;
  edge: GraphEdge;
  sourceTitle: string;
  targetTitle: string;
}

/* ================================================================
   Simulation Constants
   ================================================================ */

const REPULSION_STRENGTH = 2000;
const REST_LENGTH = 100;
const LINK_STRENGTH = 0.04;
const GRAVITY = 0.002;
const DAMPING = 0.9;
const BASE_RADIUS = 8;
const RADIUS_SCALE = 3;
const MAX_DOCS = 150;

/* ================================================================
   Force Simulation (pure functions, outside component)
   ================================================================ */

function nodeRadius(linkCount: number): number {
  return BASE_RADIUS + RADIUS_SCALE * Math.sqrt(linkCount);
}

function initCircleLayout(nodes: GraphNode[], cx: number, cy: number): void {
  const n = nodes.length;
  if (n === 0) return;
  const radius = Math.max(60, n * 6);
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    nodes[i].x = cx + radius * Math.cos(angle);
    nodes[i].y = cy + radius * Math.sin(angle);
    nodes[i].vx = 0;
    nodes[i].vy = 0;
  }
}

function applyRepulsion(nodes: GraphNode[], alpha: number): void {
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const distSq = dx * dx + dy * dy || 1;
      const force = (REPULSION_STRENGTH * alpha) / distSq;
      const fx = dx * force / Math.sqrt(distSq);
      const fy = dy * force / Math.sqrt(distSq);
      nodes[i].vx -= fx;
      nodes[i].vy -= fy;
      nodes[j].vx += fx;
      nodes[j].vy += fy;
    }
  }
}

function applyLinkForce(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeMap: Map<string, number>,
  alpha: number
): void {
  for (const edge of edges) {
    const si = nodeMap.get(edge.source);
    const ti = nodeMap.get(edge.target);
    if (si === undefined || ti === undefined) continue;
    const s = nodes[si];
    const t = nodes[ti];
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const displacement = dist - REST_LENGTH;
    const force = LINK_STRENGTH * displacement * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }
}

function applyGravity(nodes: GraphNode[], cx: number, cy: number, alpha: number): void {
  for (const node of nodes) {
    node.vx += (cx - node.x) * GRAVITY * alpha;
    node.vy += (cy - node.y) * GRAVITY * alpha;
  }
}

function tick(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeMap: Map<string, number>,
  cx: number,
  cy: number,
  alpha: number
): number {
  applyRepulsion(nodes, alpha);
  applyLinkForce(nodes, edges, nodeMap, alpha);
  applyGravity(nodes, cx, cy, alpha);

  let maxVel = 0;
  for (const node of nodes) {
    if (node.fx !== null) {
      node.x = node.fx;
      node.y = node.fy!;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
    const vel = Math.abs(node.vx) + Math.abs(node.vy);
    if (vel > maxVel) maxVel = vel;
  }
  return maxVel;
}

/* ================================================================
   Helpers
   ================================================================ */

function shortenedEnd(
  sx: number, sy: number, tx: number, ty: number, targetRadius: number
): { x: number; y: number } {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const offset = targetRadius + 6;
  return { x: tx - (dx / dist) * offset, y: ty - (dy / dist) * offset };
}

function shortenedStart(
  sx: number, sy: number, tx: number, ty: number, sourceRadius: number
): { x: number; y: number } {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const offset = sourceRadius + 2;
  return { x: sx + (dx / dist) * offset, y: sy + (dy / dist) * offset };
}

function nodeColor(linkCount: number, maxLinks: number): string {
  if (maxLinks <= 0) return '#4b5563';
  const t = Math.min(linkCount / maxLinks, 1);
  // Interpolate from dim gray (#4b5563) to bright blue (#93c5fd)
  const r = Math.round(75 + t * (147 - 75));
  const g = Math.round(85 + t * (197 - 85));
  const b = Math.round(99 + t * (253 - 99));
  return `rgb(${r},${g},${b})`;
}

function truncateTitle(title: string, max: number = 18): string {
  return title.length > max ? title.slice(0, max - 1) + '\u2026' : title;
}

/* ================================================================
   Component
   ================================================================ */

interface DocLinkGraphProps {
  workspaceId: string;
}

export default function DocLinkGraph({ workspaceId }: DocLinkGraphProps) {
  const navigate = useNavigate();

  // Data state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docsCapped, setDocsCapped] = useState(false);

  // Interaction state
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [edgeDetail, setEdgeDetail] = useState<EdgeDetailState | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Filter state
  const [minLinkCount, setMinLinkCount] = useState(0);
  const [focusQuery, setFocusQuery] = useState('');

  // Refs for simulation
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const nodeMapRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number>(0);
  const alphaRef = useRef(0);
  const panRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  }>({ active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 });
  const dragRef = useRef<{ nodeId: string | null }>({ nodeId: null });
  const lastRenderRef = useRef(0);

  // SVG dimensions
  const SVG_WIDTH = 1060;
  const SVG_HEIGHT = 560;
  const CX = SVG_WIDTH / 2;
  const CY = SVG_HEIGHT / 2;

  /* ---------- Data Fetch ---------- */

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      setDocsCapped(false);

      try {
        let docs = await DocsAPI.list();

        // Guard: cap at MAX_DOCS for performance
        if (docs.length > MAX_DOCS) {
          docs.sort((a, b) => {
            const ta = typeof a.updatedAt === 'number' ? a.updatedAt : Number(a.updatedAt) || 0;
            const tb = typeof b.updatedAt === 'number' ? b.updatedAt : Number(b.updatedAt) || 0;
            return tb - ta;
          });
          docs = docs.slice(0, MAX_DOCS);
          setDocsCapped(true);
        }

        if (cancelled) return;

        // Build node map
        const docSet = new Map<string, GraphNode>();
        for (const doc of docs) {
          docSet.set(doc.id, {
            id: doc.id,
            title: doc.title || 'Untitled',
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            fx: null,
            fy: null,
            linkCount: 0,
            synthetic: false,
          });
        }

        // Fetch links per doc in parallel
        const linkResults = await Promise.allSettled(
          docs.map((d) => docLinksApi.listLinks(d.id))
        );

        if (cancelled) return;

        // Flatten links and deduplicate by link id
        const seenLinkIds = new Set<number>();
        const allEdges: GraphEdge[] = [];

        for (const result of linkResults) {
          if (result.status !== 'fulfilled') continue;
          for (const link of result.value.links) {
            if (seenLinkIds.has(link.id)) continue;
            seenLinkIds.add(link.id);

            // Create synthetic node for unknown targets
            if (!docSet.has(link.toDocId)) {
              docSet.set(link.toDocId, {
                id: link.toDocId,
                title: link.toDocTitle ?? 'Unknown Document',
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                fx: null,
                fy: null,
                linkCount: 0,
                synthetic: true,
              });
            }

            allEdges.push({
              id: link.id,
              source: link.fromDocId,
              target: link.toDocId,
              linkText: link.linkText,
            });
          }
        }

        // Compute link counts (in + out)
        for (const edge of allEdges) {
          const src = docSet.get(edge.source);
          const tgt = docSet.get(edge.target);
          if (src) src.linkCount++;
          if (tgt) tgt.linkCount++;
        }

        const nodeArr = Array.from(docSet.values());

        // Build index map for simulation
        const idxMap = new Map<string, number>();
        nodeArr.forEach((n, i) => idxMap.set(n.id, i));

        // Initialize layout + pre-compute 300 ticks
        initCircleLayout(nodeArr, CX, CY);
        let alpha = 1.0;
        for (let i = 0; i < 300; i++) {
          tick(nodeArr, allEdges, idxMap, CX, CY, alpha);
          alpha *= 0.98;
        }

        if (cancelled) return;

        // Store in refs for rAF loop
        nodesRef.current = nodeArr;
        edgesRef.current = allEdges;
        nodeMapRef.current = idxMap;
        alphaRef.current = alpha;

        // Trigger render
        setNodes([...nodeArr]);
        setEdges(allEdges);

        // Center transform
        setTransform({ x: 0, y: 0, k: 1 });

        // Start interactive settling rAF loop
        alphaRef.current = 0.05; // small residual for settling
        startRaf();
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document graph');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  /* ---------- rAF Simulation Loop ---------- */

  const startRaf = useCallback(() => {
    function loop() {
      if (alphaRef.current < 0.001) return;

      const maxVel = tick(
        nodesRef.current,
        edgesRef.current,
        nodeMapRef.current,
        CX,
        CY,
        alphaRef.current
      );
      alphaRef.current *= 0.98;

      // Throttle React re-renders to ~30fps and only when visible movement
      const now = performance.now();
      if (maxVel > 0.5 && now - lastRenderRef.current > 33) {
        setNodes([...nodesRef.current]);
        lastRenderRef.current = now;
      }

      if (alphaRef.current >= 0.001) {
        rafRef.current = requestAnimationFrame(loop);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  /* ---------- Filtered Data ---------- */

  const maxLinkCount = useMemo(() => {
    let max = 0;
    for (const n of nodes) {
      if (n.linkCount > max) max = n.linkCount;
    }
    return max;
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => n.linkCount >= minLinkCount);
  }, [nodes, minLinkCount]);

  const filteredNodeIds = useMemo(() => {
    return new Set(filteredNodes.map((n) => n.id));
  }, [filteredNodes]);

  const filteredEdges = useMemo(() => {
    return edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
  }, [edges, filteredNodeIds]);

  // Focus node (search-to-focus)
  const focusNode = useMemo(() => {
    if (!focusQuery.trim()) return null;
    const q = focusQuery.trim().toLowerCase();
    return filteredNodes.find((n) => n.title.toLowerCase().includes(q)) ?? null;
  }, [filteredNodes, focusQuery]);

  // Auto-center on focus node
  useEffect(() => {
    if (!focusNode) return;
    setTransform({
      x: SVG_WIDTH / 2 - focusNode.x,
      y: SVG_HEIGHT / 2 - focusNode.y,
      k: 1.5,
    });
  }, [focusNode]);

  /* ---------- Node map for tooltip lookup ---------- */

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  /* ---------- Event Handlers ---------- */

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setTransform((prev) => {
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newK = Math.max(0.2, Math.min(3, prev.k * factor));

      const rect = svgRef.current?.getBoundingClientRect();
      const ox = rect ? e.clientX - rect.left : SVG_WIDTH / 2;
      const oy = rect ? e.clientY - rect.top : SVG_HEIGHT / 2;

      const newX = ox - (ox - prev.x) * (newK / prev.k);
      const newY = oy - (oy - prev.y) * (newK / prev.k);

      return { x: newX, y: newY, k: newK };
    });
  }, []);

  const handleSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Only start pan if clicking on SVG background (not a node)
    const target = e.target as SVGElement;
    if (target.dataset?.nodeId || target.dataset?.edgeId) return;

    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startTx: transform.x,
      startTy: transform.y,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
    setEdgeDetail(null);
  }, [transform.x, transform.y]);

  const handleSvgPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current.nodeId) {
      // Node drag: convert screen coords to graph space
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const graphX = (sx - transform.x) / transform.k;
      const graphY = (sy - transform.y) / transform.k;

      const idx = nodeMapRef.current.get(dragRef.current.nodeId);
      if (idx !== undefined) {
        nodesRef.current[idx].fx = graphX;
        nodesRef.current[idx].fy = graphY;
        nodesRef.current[idx].x = graphX;
        nodesRef.current[idx].y = graphY;
        // Restart settling
        if (alphaRef.current < 0.05) {
          alphaRef.current = 0.3;
          startRaf();
        }
        setNodes([...nodesRef.current]);
      }
      return;
    }

    if (panRef.current.active) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setTransform({
        x: panRef.current.startTx + dx,
        y: panRef.current.startTy + dy,
        k: transform.k,
      });
    }
  }, [transform.x, transform.y, transform.k, startRaf]);

  const handleSvgPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current.nodeId) {
      const idx = nodeMapRef.current.get(dragRef.current.nodeId);
      if (idx !== undefined) {
        nodesRef.current[idx].fx = null;
        nodesRef.current[idx].fy = null;
      }
      dragRef.current.nodeId = null;
    }
    panRef.current.active = false;
    svgRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const handleNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    dragRef.current.nodeId = nodeId;
    svgRef.current?.setPointerCapture(e.pointerId);
    setEdgeDetail(null);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    // Don't navigate if we were dragging
    if (dragRef.current.nodeId) return;
    navigate(`/doc/${nodeId}`);
  }, [navigate]);

  const handleNodeEnter = useCallback((e: React.PointerEvent, node: GraphNode) => {
    setHoveredNodeId(node.id);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = node.x * transform.k + transform.x + rect.left;
    const screenY = node.y * transform.k + transform.y + rect.top;
    setTooltip({ x: screenX, y: screenY, node });
  }, [transform]);

  const handleNodeLeave = useCallback(() => {
    setHoveredNodeId(null);
    setTooltip(null);
  }, []);

  const handleEdgeClick = useCallback((e: React.MouseEvent, edge: GraphEdge) => {
    e.stopPropagation();
    const srcNode = nodeById.get(edge.source);
    const tgtNode = nodeById.get(edge.target);
    if (!srcNode || !tgtNode) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Position popover at edge midpoint
    const mx = ((srcNode.x + tgtNode.x) / 2) * transform.k + transform.x + rect.left;
    const my = ((srcNode.y + tgtNode.y) / 2) * transform.k + transform.y + rect.top;

    setEdgeDetail({
      x: mx,
      y: my,
      edge,
      sourceTitle: srcNode.title,
      targetTitle: tgtNode.title,
    });
  }, [nodeById, transform]);

  const handleResetView = useCallback(() => {
    if (nodesRef.current.length === 0) return;
    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodesRef.current) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const bw = maxX - minX || 100;
    const bh = maxY - minY || 100;
    const kx = (SVG_WIDTH - 60) / bw;
    const ky = (SVG_HEIGHT - 60) / bh;
    const k = Math.max(0.2, Math.min(2, Math.min(kx, ky)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setTransform({
      x: SVG_WIDTH / 2 - cx * k,
      y: SVG_HEIGHT / 2 - cy * k,
      k,
    });
  }, []);

  /* ---------- Cursor ---------- */

  const cursor = panRef.current.active || dragRef.current.nodeId
    ? 'grabbing'
    : hoveredNodeId
      ? 'pointer'
      : 'grab';

  /* ---------- Render ---------- */

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ color: '#9ca3c7', fontSize: 13, textAlign: 'center', marginTop: 60 }}>
          Loading document graph...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>
          {error}
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', color: '#9ca3c7', fontSize: 13, marginTop: 60 }}>
          <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>&#x1F517;</div>
          No documents with cross-document links found in this workspace.
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            Create document links to build the relationship graph.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Capped docs banner */}
      {docsCapped && (
        <div style={infoBannerStyle}>
          Showing the {MAX_DOCS} most recently updated documents. Older documents may not appear.
        </div>
      )}

      {/* Filter bar */}
      <div style={filterBarStyle}>
        <label style={filterLabelStyle}>Min Links:</label>
        <input
          type="range"
          min={0}
          max={Math.max(maxLinkCount, 1)}
          value={minLinkCount}
          onChange={(e) => setMinLinkCount(Number(e.target.value))}
          style={{ width: 100, accentColor: '#3b82f6' }}
        />
        <span style={{ fontSize: 11, color: '#9ca3c7', minWidth: 16 }}>{minLinkCount}</span>

        <span style={filterSepStyle} />

        <label style={filterLabelStyle}>Focus:</label>
        <input
          type="text"
          placeholder="Search doc title..."
          value={focusQuery}
          onChange={(e) => setFocusQuery(e.target.value)}
          style={focusInputStyle}
        />

        <button type="button" onClick={handleResetView} style={resetBtnStyle}>
          Reset View
        </button>

        <span style={{ fontSize: 11, color: '#9ca3c7', marginLeft: 'auto' }}>
          {filteredNodes.length} doc{filteredNodes.length !== 1 ? 's' : ''}
          {filteredEdges.length > 0 && ` \u00B7 ${filteredEdges.length} link${filteredEdges.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* SVG Graph */}
      <div style={svgContainerStyle}>
        <svg
          ref={svgRef}
          width="100%"
          height={SVG_HEIGHT}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          style={{ cursor, display: 'block', borderRadius: 10 }}
          onWheel={handleWheel}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
        >
          {/* Background */}
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="#020617" rx={10} />

          {/* Arrow marker */}
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 6"
              refX="8"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 3 L 0 6 Z" fill="rgba(148,163,184,0.5)" />
            </marker>
            <marker
              id="arrow-hover"
              viewBox="0 0 10 6"
              refX="8"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 3 L 0 6 Z" fill="#93c5fd" />
            </marker>
          </defs>

          {/* Transform group */}
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {/* Edges */}
            {filteredEdges.map((edge) => {
              const src = nodeById.get(edge.source);
              const tgt = nodeById.get(edge.target);
              if (!src || !tgt) return null;
              const sr = nodeRadius(src.linkCount);
              const tr = nodeRadius(tgt.linkCount);
              const start = shortenedStart(src.x, src.y, tgt.x, tgt.y, sr);
              const end = shortenedEnd(src.x, src.y, tgt.x, tgt.y, tr);

              return (
                <g key={`edge-${edge.id}`}>
                  {/* Visible edge */}
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="rgba(148,163,184,0.3)"
                    strokeWidth={1.2}
                    markerEnd="url(#arrow)"
                  />
                  {/* Invisible hit target */}
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="transparent"
                    strokeWidth={12}
                    data-edge-id={String(edge.id)}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleEdgeClick(e, edge)}
                  />
                </g>
              );
            })}

            {/* Nodes */}
            {filteredNodes.map((node) => {
              const r = nodeRadius(node.linkCount);
              const isFocused = focusNode?.id === node.id;
              const isHovered = hoveredNodeId === node.id;
              const fill = nodeColor(node.linkCount, maxLinkCount);

              return (
                <g key={`node-${node.id}`}>
                  {/* Focus ring */}
                  {isFocused && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r + 5}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                    />
                  )}
                  {/* Node circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={fill}
                    stroke={isHovered ? '#e5e7ff' : node.synthetic ? '#6b7280' : 'rgba(30,64,175,0.7)'}
                    strokeWidth={isHovered ? 2 : 1.2}
                    strokeDasharray={node.synthetic ? '3 2' : undefined}
                    data-node-id={node.id}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                    onPointerEnter={(e) => handleNodeEnter(e, node)}
                    onPointerLeave={handleNodeLeave}
                    onClick={() => handleNodeClick(node.id)}
                  />
                  {/* Label */}
                  <text
                    x={node.x}
                    y={node.y + r + 12}
                    textAnchor="middle"
                    fill={isHovered ? '#e5e7ff' : '#9ca3c7'}
                    fontSize={10}
                    fontFamily="inherit"
                    pointerEvents="none"
                  >
                    {truncateTitle(node.title)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Tooltip overlay (screen space) */}
        {tooltip && (
          <div
            style={{
              ...tooltipStyle,
              left: tooltip.x - (svgRef.current?.getBoundingClientRect().left ?? 0),
              top: tooltip.y - (svgRef.current?.getBoundingClientRect().top ?? 0) - 40,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12 }}>{tooltip.node.title}</div>
            <div style={{ fontSize: 10, color: '#9ca3c7', marginTop: 2 }}>
              {tooltip.node.linkCount} link{tooltip.node.linkCount !== 1 ? 's' : ''}
              {tooltip.node.synthetic && ' (external)'}
            </div>
          </div>
        )}
      </div>

      {/* Edge detail popover (screen space) */}
      {edgeDetail && (
        <div
          style={{
            ...edgePopoverStyle,
            left: edgeDetail.x - (svgRef.current?.getBoundingClientRect().left ?? 0),
            top: edgeDetail.y - (svgRef.current?.getBoundingClientRect().top ?? 0) - 50,
          }}
          onClick={() => setEdgeDetail(null)}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e5e7ff' }}>
            {edgeDetail.sourceTitle}
          </div>
          <div style={{ fontSize: 10, color: '#9ca3c7', margin: '2px 0' }}>&darr; links to</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e5e7ff' }}>
            {edgeDetail.targetTitle}
          </div>
          {edgeDetail.edge.linkText && (
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>
              &ldquo;{edgeDetail.edge.linkText}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={legendStyle}>
        <span style={legendItemStyle}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#4b5563', marginRight: 4 }} />
          Few links
        </span>
        <span style={legendItemStyle}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#93c5fd', marginRight: 4 }} />
          Many links
        </span>
        <span style={legendItemStyle}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1px dashed #6b7280', marginRight: 4 }} />
          External / inaccessible
        </span>
        <span style={{ fontSize: 10, color: '#6b7280' }}>
          Drag nodes \u00B7 Scroll to zoom \u00B7 Click to open
        </span>
      </div>
    </div>
  );
}

/* ================================================================
   Styles (inline, matching host page dark theme)
   ================================================================ */

const containerStyle: CSSProperties = {
  marginTop: 16,
};

const infoBannerStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  background: 'rgba(251,191,36,0.1)',
  border: '1px solid rgba(251,191,36,0.3)',
  color: '#fbbf24',
  fontSize: 11,
  marginBottom: 10,
};

const errorStyle: CSSProperties = {
  marginTop: 20,
  padding: '8px 10px',
  borderRadius: 12,
  background: 'rgba(248,113,113,0.14)',
  border: '1px solid rgba(248,113,113,0.7)',
  fontSize: 12,
  color: '#fca5a5',
};

const filterBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
  flexWrap: 'wrap',
};

const filterLabelStyle: CSSProperties = {
  fontSize: 11,
  color: '#9ca3c7',
  fontWeight: 600,
};

const filterSepStyle: CSSProperties = {
  width: 1,
  height: 16,
  background: 'rgba(148,163,184,0.2)',
  margin: '0 4px',
};

const focusInputStyle: CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  color: '#e5e7ff',
  background: 'rgba(15,23,42,0.6)',
  border: '1px solid rgba(148,163,184,0.3)',
  borderRadius: 6,
  outline: 'none',
  minWidth: 140,
};

const resetBtnStyle: CSSProperties = {
  padding: '3px 10px',
  borderRadius: 6,
  border: '1px solid rgba(148,163,184,0.3)',
  background: 'transparent',
  color: '#9ca3c7',
  fontSize: 11,
  cursor: 'pointer',
};

const svgContainerStyle: CSSProperties = {
  position: 'relative',
  borderRadius: 10,
  border: '1px solid rgba(30,64,175,0.5)',
  overflow: 'hidden',
  background: '#020617',
};

const tooltipStyle: CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
  padding: '5px 10px',
  borderRadius: 6,
  background: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(30,64,175,0.7)',
  color: '#e5e7ff',
  whiteSpace: 'nowrap',
  zIndex: 10,
  transform: 'translateX(-50%)',
};

const edgePopoverStyle: CSSProperties = {
  position: 'absolute',
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(30,64,175,0.7)',
  color: '#e5e7ff',
  whiteSpace: 'nowrap',
  zIndex: 10,
  transform: 'translateX(-50%)',
  cursor: 'pointer',
};

const legendStyle: CSSProperties = {
  marginTop: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
};

const legendItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 10,
  color: '#9ca3c7',
};
