// KACHERI FRONTEND/src/components/knowledge/EntityGraph.tsx
// Interactive force-directed graph visualization of workspace entity relationships.
// Nodes = entities (sized by mention count, colored by type).
// Edges = relationships (opacity by strength, colored by type).
// Uses custom force simulation + SVG rendering — no external dependencies.
//
// See: Docs/Roadmap/phase2-product-features-work-scope.md — Slice 10 (D1)

import {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
  type CSSProperties,
} from 'react';
import { knowledgeApi } from '../../api/knowledge';
import type {
  Entity,
  EntityType,
  RelationshipType,
  RelationshipListItem,
} from '../../types/knowledge';

/* ================================================================
   Types
   ================================================================ */

interface GraphNode {
  id: string;
  name: string;
  entityType: EntityType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  mentionCount: number;
  connectionCount: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: RelationshipType;
  label: string | null;
  strength: number;
  evidenceCount: number;
}

interface Transform {
  x: number;
  y: number;
  k: number;
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
  sourceName: string;
  targetName: string;
}

/* ================================================================
   Constants
   ================================================================ */

const REPULSION_STRENGTH = 2200;
const REST_LENGTH = 120;
const LINK_STRENGTH = 0.04;
const GRAVITY = 0.003;
const DAMPING = 0.9;
const BASE_RADIUS = 7;
const RADIUS_SCALE = 2.5;
const MAX_ENTITIES = 200;

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  person: '#3b82f6',
  organization: '#a855f7',
  date: '#f59e0b',
  amount: '#22c55e',
  location: '#ef4444',
  product: '#14b8a6',
  term: '#6b7280',
  concept: '#6366f1',
};

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Person',
  organization: 'Organization',
  date: 'Date',
  amount: 'Amount',
  location: 'Location',
  product: 'Product',
  term: 'Term',
  concept: 'Concept',
};

const ALL_ENTITY_TYPES: EntityType[] = [
  'person', 'organization', 'date', 'amount',
  'location', 'product', 'term', 'concept',
];

const RELATIONSHIP_TYPE_COLORS: Record<RelationshipType, string> = {
  co_occurrence: '#94a3b8',
  contractual: '#f59e0b',
  financial: '#22c55e',
  organizational: '#a855f7',
  temporal: '#3b82f6',
  custom: '#ec4899',
};

const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  co_occurrence: 'Co-occurrence',
  contractual: 'Contractual',
  financial: 'Financial',
  organizational: 'Organizational',
  temporal: 'Temporal',
  custom: 'Custom',
};

const ALL_RELATIONSHIP_TYPES: RelationshipType[] = [
  'co_occurrence', 'contractual', 'financial',
  'organizational', 'temporal', 'custom',
];

/* ================================================================
   Force Simulation (pure functions)
   ================================================================ */

function nodeRadius(mentionCount: number): number {
  return BASE_RADIUS + RADIUS_SCALE * Math.sqrt(mentionCount);
}

function initCircleLayout(nodes: GraphNode[], cx: number, cy: number): void {
  const n = nodes.length;
  if (n === 0) return;
  const radius = Math.max(80, n * 5);
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
      const dist = Math.sqrt(distSq);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
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
  const offset = targetRadius + 4;
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

function truncateTitle(title: string, max: number = 16): string {
  return title.length > max ? title.slice(0, max - 1) + '\u2026' : title;
}

function edgeOpacity(strength: number): number {
  // Map strength 0.1–1.0 to opacity 0.15–0.6
  return 0.15 + Math.min(strength, 1) * 0.45;
}

/* ================================================================
   Component
   ================================================================ */

interface EntityGraphProps {
  workspaceId: string;
  onEntityClick: (entityId: string) => void;
}

export default function EntityGraph({ workspaceId, onEntityClick }: EntityGraphProps) {
  // Data state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);

  // Interaction state
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [edgeDetail, setEdgeDetail] = useState<EdgeDetailState | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Filter state
  const [enabledEntityTypes, setEnabledEntityTypes] = useState<Set<EntityType>>(
    new Set(ALL_ENTITY_TYPES)
  );
  const [enabledRelTypes, setEnabledRelTypes] = useState<Set<RelationshipType>>(
    new Set(ALL_RELATIONSHIP_TYPES)
  );
  const [minConnections, setMinConnections] = useState(0);
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

  /* ---------- Data Fetch ---------- */

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      setCapped(false);

      try {
        const [entitiesRes, relsRes] = await Promise.all([
          knowledgeApi.listEntities(workspaceId, {
            limit: 500,
            sort: 'mention_count',
            order: 'desc',
          }),
          knowledgeApi.listRelationships(workspaceId, { limit: 2000 }),
        ]);

        if (cancelled) return;

        let entityList = entitiesRes.entities;

        // Cap at MAX_ENTITIES for O(N²) simulation safety
        if (entityList.length > MAX_ENTITIES) {
          entityList = entityList.slice(0, MAX_ENTITIES);
          setCapped(true);
        }

        // Build node set
        const nodeSet = new Map<string, GraphNode>();
        for (const ent of entityList) {
          nodeSet.set(ent.id, {
            id: ent.id,
            name: ent.name,
            entityType: ent.entityType,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            fx: null,
            fy: null,
            mentionCount: ent.mentionCount,
            connectionCount: 0,
          });
        }

        // Build edges — only include where both endpoints are in node set
        const allEdges: GraphEdge[] = [];
        for (const rel of relsRes.relationships) {
          if (!nodeSet.has(rel.fromEntity.id) || !nodeSet.has(rel.toEntity.id)) continue;
          allEdges.push({
            id: rel.id,
            source: rel.fromEntity.id,
            target: rel.toEntity.id,
            relationshipType: rel.relationshipType,
            label: rel.label,
            strength: rel.strength,
            evidenceCount: rel.evidenceCount,
          });
        }

        // Compute connection counts
        for (const edge of allEdges) {
          const src = nodeSet.get(edge.source);
          const tgt = nodeSet.get(edge.target);
          if (src) src.connectionCount++;
          if (tgt) tgt.connectionCount++;
        }

        const nodeArr = Array.from(nodeSet.values());
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

        nodesRef.current = nodeArr;
        edgesRef.current = allEdges;
        nodeMapRef.current = idxMap;
        alphaRef.current = 0.05;

        setNodes([...nodeArr]);
        setEdges(allEdges);
        setTransform({ x: 0, y: 0, k: 1 });

        startRaf();
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load entity graph');
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

  /* ---------- Filtered Data ---------- */

  const maxConnections = useMemo(() => {
    let max = 0;
    for (const n of nodes) {
      if (n.connectionCount > max) max = n.connectionCount;
    }
    return max;
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    return nodes.filter(
      (n) =>
        enabledEntityTypes.has(n.entityType) &&
        n.connectionCount >= minConnections
    );
  }, [nodes, enabledEntityTypes, minConnections]);

  const filteredNodeIds = useMemo(() => {
    return new Set(filteredNodes.map((n) => n.id));
  }, [filteredNodes]);

  const filteredEdges = useMemo(() => {
    return edges.filter(
      (e) =>
        enabledRelTypes.has(e.relationshipType) &&
        filteredNodeIds.has(e.source) &&
        filteredNodeIds.has(e.target)
    );
  }, [edges, enabledRelTypes, filteredNodeIds]);

  // Focus node (search-to-focus)
  const focusNode = useMemo(() => {
    if (!focusQuery.trim()) return null;
    const q = focusQuery.trim().toLowerCase();
    return filteredNodes.find((n) => n.name.toLowerCase().includes(q)) ?? null;
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

  /* ---------- Node map for lookups ---------- */

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
    if (dragRef.current.nodeId) return;
    onEntityClick(nodeId);
  }, [onEntityClick]);

  const handleNodeEnter = useCallback((_e: React.PointerEvent, node: GraphNode) => {
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

    const mx = ((srcNode.x + tgtNode.x) / 2) * transform.k + transform.x + rect.left;
    const my = ((srcNode.y + tgtNode.y) / 2) * transform.k + transform.y + rect.top;

    setEdgeDetail({
      x: mx,
      y: my,
      edge,
      sourceName: srcNode.name,
      targetName: tgtNode.name,
    });
  }, [nodeById, transform]);

  const handleResetView = useCallback(() => {
    if (nodesRef.current.length === 0) return;
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

  /* ---------- Filter toggles ---------- */

  const toggleEntityType = useCallback((type: EntityType) => {
    setEnabledEntityTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const toggleRelType = useCallback((type: RelationshipType) => {
    setEnabledRelTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
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
          Loading entity graph...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', color: '#9ca3c7', fontSize: 13, marginTop: 60 }}>
          <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>&#x1F578;</div>
          No entities found in this workspace.
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            Import and extract documents to build the entity relationship graph.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Capped entities banner */}
      {capped && (
        <div style={infoBannerStyle}>
          Showing the top {MAX_ENTITIES} entities by mention count. Less-mentioned entities may not appear.
        </div>
      )}

      {/* Filter bar — entity types */}
      <div style={filterBarStyle}>
        <span style={filterSectionLabelStyle}>Entities:</span>
        {ALL_ENTITY_TYPES.map((type) => {
          const enabled = enabledEntityTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleEntityType(type)}
              style={{
                ...filterChipStyle,
                background: enabled ? `${ENTITY_TYPE_COLORS[type]}20` : 'transparent',
                borderColor: enabled ? ENTITY_TYPE_COLORS[type] : 'rgba(148,163,184,0.2)',
                color: enabled ? ENTITY_TYPE_COLORS[type] : '#6b7280',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: enabled ? ENTITY_TYPE_COLORS[type] : '#4b5563',
                  marginRight: 3,
                }}
              />
              {ENTITY_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {/* Filter bar — relationship types + controls */}
      <div style={filterBarStyle}>
        <span style={filterSectionLabelStyle}>Relations:</span>
        {ALL_RELATIONSHIP_TYPES.map((type) => {
          const enabled = enabledRelTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleRelType(type)}
              style={{
                ...filterChipStyle,
                background: enabled ? `${RELATIONSHIP_TYPE_COLORS[type]}15` : 'transparent',
                borderColor: enabled ? RELATIONSHIP_TYPE_COLORS[type] : 'rgba(148,163,184,0.2)',
                color: enabled ? RELATIONSHIP_TYPE_COLORS[type] : '#6b7280',
              }}
            >
              {RELATIONSHIP_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {/* Filter bar — min connections, search, reset */}
      <div style={filterBarStyle}>
        <label style={filterLabelStyle}>Min Links:</label>
        <input
          type="range"
          min={0}
          max={Math.max(maxConnections, 1)}
          value={minConnections}
          onChange={(e) => setMinConnections(Number(e.target.value))}
          style={{ width: 100, accentColor: '#3b82f6' }}
        />
        <span style={{ fontSize: 11, color: '#9ca3c7', minWidth: 16 }}>{minConnections}</span>

        <span style={filterSepStyle} />

        <label style={filterLabelStyle}>Focus:</label>
        <input
          type="text"
          placeholder="Search entity name..."
          value={focusQuery}
          onChange={(e) => setFocusQuery(e.target.value)}
          style={focusInputStyle}
        />

        <button type="button" onClick={handleResetView} style={resetBtnStyle}>
          Reset View
        </button>

        <span style={{ fontSize: 11, color: '#9ca3c7', marginLeft: 'auto' }}>
          {filteredNodes.length} entit{filteredNodes.length !== 1 ? 'ies' : 'y'}
          {filteredEdges.length > 0 &&
            ` \u00B7 ${filteredEdges.length} relationship${filteredEdges.length !== 1 ? 's' : ''}`}
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

          {/* Transform group */}
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {/* Edges */}
            {filteredEdges.map((edge) => {
              const src = nodeById.get(edge.source);
              const tgt = nodeById.get(edge.target);
              if (!src || !tgt) return null;
              const sr = nodeRadius(src.mentionCount);
              const tr = nodeRadius(tgt.mentionCount);
              const start = shortenedStart(src.x, src.y, tgt.x, tgt.y, sr);
              const end = shortenedEnd(src.x, src.y, tgt.x, tgt.y, tr);
              const color = RELATIONSHIP_TYPE_COLORS[edge.relationshipType] ?? '#94a3b8';
              const opacity = edgeOpacity(edge.strength);

              return (
                <g key={`edge-${edge.id}`}>
                  {/* Visible edge */}
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={color}
                    strokeWidth={1.2}
                    strokeOpacity={opacity}
                  />
                  {/* Invisible hit target */}
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="transparent"
                    strokeWidth={12}
                    data-edge-id={edge.id}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleEdgeClick(e, edge)}
                  />
                </g>
              );
            })}

            {/* Nodes */}
            {filteredNodes.map((node) => {
              const r = nodeRadius(node.mentionCount);
              const isFocused = focusNode?.id === node.id;
              const isHovered = hoveredNodeId === node.id;
              const fill = ENTITY_TYPE_COLORS[node.entityType];

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
                    stroke={isHovered ? '#e5e7ff' : 'rgba(30,64,175,0.5)'}
                    strokeWidth={isHovered ? 2 : 1}
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
                    {truncateTitle(node.name)}
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
              top: tooltip.y - (svgRef.current?.getBoundingClientRect().top ?? 0) - 44,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12 }}>{tooltip.node.name}</div>
            <div style={{ fontSize: 10, marginTop: 2, display: 'flex', gap: 8 }}>
              <span style={{ color: ENTITY_TYPE_COLORS[tooltip.node.entityType], textTransform: 'capitalize' }}>
                {ENTITY_TYPE_LABELS[tooltip.node.entityType]}
              </span>
              <span style={{ color: '#9ca3c7' }}>
                {tooltip.node.mentionCount} mention{tooltip.node.mentionCount !== 1 ? 's' : ''}
              </span>
              <span style={{ color: '#9ca3c7' }}>
                {tooltip.node.connectionCount} link{tooltip.node.connectionCount !== 1 ? 's' : ''}
              </span>
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
            top: edgeDetail.y - (svgRef.current?.getBoundingClientRect().top ?? 0) - 60,
          }}
          onClick={() => setEdgeDetail(null)}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e5e7ff' }}>
            {edgeDetail.sourceName}
          </div>
          <div style={{
            fontSize: 10,
            color: RELATIONSHIP_TYPE_COLORS[edgeDetail.edge.relationshipType],
            margin: '2px 0',
            textTransform: 'capitalize',
          }}>
            {RELATIONSHIP_TYPE_LABELS[edgeDetail.edge.relationshipType]}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e5e7ff' }}>
            {edgeDetail.targetName}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
            Strength: {(edgeDetail.edge.strength * 100).toFixed(0)}%
            {edgeDetail.edge.evidenceCount > 0 &&
              ` \u00B7 ${edgeDetail.edge.evidenceCount} evidence`}
          </div>
          {edgeDetail.edge.label && (
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2, fontStyle: 'italic' }}>
              &ldquo;{edgeDetail.edge.label}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={legendStyle}>
        {ALL_ENTITY_TYPES.map((type) => (
          <span key={type} style={legendItemStyle}>
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: ENTITY_TYPE_COLORS[type],
                marginRight: 3,
              }}
            />
            {ENTITY_TYPE_LABELS[type]}
          </span>
        ))}
        <span style={{ fontSize: 10, color: '#6b7280' }}>
          Drag nodes {'\u00B7'} Scroll to zoom {'\u00B7'} Click for details
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
  gap: 6,
  marginBottom: 8,
  flexWrap: 'wrap',
};

const filterSectionLabelStyle: CSSProperties = {
  fontSize: 11,
  color: '#9ca3c7',
  fontWeight: 700,
  minWidth: 60,
};

const filterChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 10,
  border: '1px solid',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
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
  gap: 12,
  flexWrap: 'wrap',
};

const legendItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 10,
  color: '#9ca3c7',
};
