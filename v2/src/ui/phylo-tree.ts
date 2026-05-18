import type { EvoStats, SpeciesDefinition } from '../types';
import { SPECIES, getLivingIds, getDynamicSpeciesIds } from '../species/registry';
import { BIO_TIERS } from '../species/species-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhyloNode {
  id: number;
  name: string;
  color: string;
  tier: string;
  parentId: number | null;
  children: PhyloNode[];
  depth: number;
  extinct: boolean;
  population: number;
}

export interface PhyloLayout {
  nodes: Array<{ node: PhyloNode; x: number; y: number; w: number; h: number }>;
  edges: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }>;
  width: number;
  height: number;
}

export interface PhyloViewState {
  scrollX: number;
  scrollY: number;
  hoveredNode: number | null;
  selectedNode: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ExtendedSpecies extends SpeciesDefinition {
  parentId?: number;
  rootAncestor?: number;
  lineageDepth?: number;
  _extinct?: boolean;
}

function getExt(id: number): ExtendedSpecies {
  return SPECIES[id] as ExtendedSpecies;
}

const NODE_W = 120;
const NODE_H = 28;
const H_SPACING = 160;
const V_SPACING = 36;
const MARGIN_LEFT = 100;
const MARGIN_TOP = 20;

// ---------------------------------------------------------------------------
// buildPhyloTree
// ---------------------------------------------------------------------------

export function buildPhyloTree(
  evoStats: Record<number, EvoStats>,
  counts: Record<number, number>,
): PhyloNode[] {
  const livingIds = getLivingIds();
  const dynamicIds = getDynamicSpeciesIds();

  // Map id -> PhyloNode (flat)
  const nodeMap = new Map<number, PhyloNode>();

  // Create nodes for all living + dynamic species
  const allIds = new Set<number>([...livingIds, ...dynamicIds]);
  for (const id of allIds) {
    const sp = getExt(id);
    if (!sp) continue;
    // Skip non-living tiers
    if (BIO_TIERS.indexOf(sp.tier as never) === -1) continue;

    const ext = sp;
    nodeMap.set(id, {
      id,
      name: sp.name,
      color: sp.color,
      tier: sp.tier,
      parentId: ext.parentId != null ? ext.parentId : null,
      children: [],
      depth: ext.lineageDepth ?? 0,
      extinct: ext._extinct === true,
      population: counts[id] ?? 0,
    });
  }

  // Also include entries from evoStats that might not be in the id lists
  for (const idStr of Object.keys(evoStats)) {
    const id = Number(idStr);
    if (nodeMap.has(id)) continue;
    const sp = getExt(id);
    if (!sp) continue;
    if (BIO_TIERS.indexOf(sp.tier as never) === -1) continue;
    nodeMap.set(id, {
      id,
      name: sp.name,
      color: sp.color,
      tier: sp.tier,
      parentId: sp.parentId != null ? sp.parentId : null,
      children: [],
      depth: sp.lineageDepth ?? 0,
      extinct: sp._extinct === true,
      population: counts[id] ?? 0,
    });
  }

  // Attach children to parents
  const roots: PhyloNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId != null && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      // Root node (base species or orphaned dynamic)
      roots.push(node);
    }
  }

  // Sort function: by lineage depth, then name
  function sortChildren(node: PhyloNode): void {
    node.children.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  for (const root of roots) {
    sortChildren(root);
  }

  // Sort roots by tier order, then name
  roots.sort((a, b) => {
    const ai = BIO_TIERS.indexOf(a.tier as never);
    const bi = BIO_TIERS.indexOf(b.tier as never);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  return roots;
}

// ---------------------------------------------------------------------------
// layoutPhyloTree
// ---------------------------------------------------------------------------

export function layoutPhyloTree(roots: PhyloNode[]): PhyloLayout {
  const layoutNodes: PhyloLayout['nodes'] = [];
  const layoutEdges: PhyloLayout['edges'] = [];
  let maxX = 0;
  let currentY = MARGIN_TOP;

  function layoutSubtree(node: PhyloNode, depth: number): { minY: number; maxY: number; centreY: number } {
    const x = MARGIN_LEFT + depth * H_SPACING;

    if (node.children.length === 0) {
      const y = currentY;
      currentY += V_SPACING;
      layoutNodes.push({ node, x, y, w: NODE_W, h: NODE_H });
      if (x + NODE_W > maxX) maxX = x + NODE_W;
      return { minY: y, maxY: y + NODE_H, centreY: y + NODE_H / 2 };
    }

    const childResults: Array<{ minY: number; maxY: number; centreY: number }> = [];
    for (const child of node.children) {
      childResults.push(layoutSubtree(child, depth + 1));
    }

    // Place parent centred vertically among its children
    const firstChild = childResults[0];
    const lastChild = childResults[childResults.length - 1];
    const centreY = (firstChild.centreY + lastChild.centreY) / 2;
    const y = centreY - NODE_H / 2;

    layoutNodes.push({ node, x, y, w: NODE_W, h: NODE_H });
    if (x + NODE_W > maxX) maxX = x + NODE_W;

    // Create edges from parent to children
    const parentRightX = x + NODE_W;
    const parentCentreY = centreY;

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const childX = MARGIN_LEFT + (depth + 1) * H_SPACING;
      const childCentreY = childResults[i].centreY;
      const edgeColor = child.extinct ? '#666666' : node.color;

      layoutEdges.push({
        x1: parentRightX,
        y1: parentCentreY,
        x2: childX,
        y2: childCentreY,
        color: edgeColor,
      });
    }

    return {
      minY: Math.min(y, firstChild.minY),
      maxY: Math.max(y + NODE_H, lastChild.maxY),
      centreY,
    };
  }

  for (const root of roots) {
    layoutSubtree(root, 0);
    currentY += V_SPACING / 2; // gap between root trees
  }

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: maxX + MARGIN_LEFT,
    height: currentY + MARGIN_TOP,
  };
}

// ---------------------------------------------------------------------------
// drawPhyloTree
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const val = parseInt(hex.slice(1), 16);
  return {
    r: (val >> 16) & 0xff,
    g: (val >> 8) & 0xff,
    b: val & 0xff,
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawPhyloTree(
  ctx: CanvasRenderingContext2D,
  layout: PhyloLayout,
  _dpr: number,
): void {
  // Draw tier labels on left margin
  const depthTiers = new Map<number, string>();
  for (const entry of layout.nodes) {
    const d = entry.node.depth;
    if (!depthTiers.has(d)) {
      depthTiers.set(d, entry.node.tier);
    }
  }
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  for (const [depth, tier] of depthTiers) {
    const x = MARGIN_LEFT + depth * H_SPACING - 8;
    // Find average y for nodes at this depth
    let sumY = 0;
    let count = 0;
    for (const entry of layout.nodes) {
      if (entry.node.depth === depth) {
        sumY += entry.y + entry.h / 2;
        count++;
      }
    }
    if (count > 0) {
      ctx.fillStyle = '#667788';
      ctx.fillText(tier.toUpperCase(), x, sumY / count + 3);
    }
  }

  // Draw edges (cubic bezier)
  for (const edge of layout.edges) {
    ctx.beginPath();
    const midX = (edge.x1 + edge.x2) / 2;
    ctx.moveTo(edge.x1, edge.y1);
    ctx.bezierCurveTo(midX, edge.y1, midX, edge.y2, edge.x2, edge.y2);

    ctx.strokeStyle = edge.color;
    ctx.lineWidth = 1.5;

    // Check if this is a grey (extinct) edge
    if (edge.color === '#666666') {
      ctx.setLineDash([4, 3]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Draw nodes
  ctx.textAlign = 'left';
  for (const entry of layout.nodes) {
    const { node, x, y, w, h } = entry;
    const rgb = hexToRgb(node.color);

    if (node.extinct) {
      ctx.globalAlpha = 0.4;
    }

    // Fill with 20% opacity species colour
    roundRect(ctx, x, y, w, h, 5);
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`;
    ctx.fill();

    // Border
    roundRect(ctx, x, y, w, h, 5);
    ctx.strokeStyle = node.color;
    ctx.lineWidth = 1.5;
    if (node.extinct) {
      ctx.setLineDash([3, 2]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Species name
    ctx.font = '11px sans-serif';
    ctx.fillStyle = node.extinct ? '#888888' : '#FFFFFF';
    ctx.textAlign = 'left';
    const nameText = node.name.length > 10 ? node.name.slice(0, 9) + '…' : node.name;
    ctx.fillText(nameText, x + 6, y + h / 2 + 4);

    // Population count on the right
    ctx.font = '9px monospace';
    ctx.fillStyle = '#999999';
    ctx.textAlign = 'right';
    ctx.fillText(String(node.population), x + w - 5, y + h / 2 + 3);

    if (node.extinct) {
      ctx.globalAlpha = 1.0;
    }
  }

  // Reset
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// PhyloViewState
// ---------------------------------------------------------------------------

export function createPhyloView(): PhyloViewState {
  return {
    scrollX: 0,
    scrollY: 0,
    hoveredNode: null,
    selectedNode: null,
  };
}

// ---------------------------------------------------------------------------
// setupPhyloInteraction
// ---------------------------------------------------------------------------

export function setupPhyloInteraction(
  canvas: HTMLCanvasElement,
  view: PhyloViewState,
  layout: PhyloLayout,
  onSelect: (id: number) => void,
  onHover: (id: number | null) => void,
): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let dragMoved = false;

  function hitTest(mx: number, my: number): number | null {
    const dpr = window.devicePixelRatio || 1;
    const cx = mx / dpr - view.scrollX;
    const cy = my / dpr - view.scrollY;
    for (const entry of layout.nodes) {
      if (
        cx >= entry.x &&
        cx <= entry.x + entry.w &&
        cy >= entry.y &&
        cy <= entry.y + entry.h
      ) {
        return entry.node.id;
      }
    }
    return null;
  }

  function onMouseDown(e: MouseEvent): void {
    dragging = true;
    dragMoved = false;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onMouseMove(e: MouseEvent): void {
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      view.scrollX += dx;
      view.scrollY += dy;
      lastX = e.clientX;
      lastY = e.clientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        dragMoved = true;
      }
    } else {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;
      const hit = hitTest(mx, my);
      if (hit !== view.hoveredNode) {
        view.hoveredNode = hit;
        onHover(hit);
      }
    }
  }

  function onMouseUp(e: MouseEvent): void {
    if (dragging && !dragMoved) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;
      const hit = hitTest(mx, my);
      if (hit != null) {
        view.selectedNode = hit;
        onSelect(hit);
      }
    }
    dragging = false;
    dragMoved = false;
  }

  function onMouseLeave(): void {
    dragging = false;
    if (view.hoveredNode != null) {
      view.hoveredNode = null;
      onHover(null);
    }
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);

  return () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('mouseleave', onMouseLeave);
  };
}

// ---------------------------------------------------------------------------
// renderPhyloView
// ---------------------------------------------------------------------------

export function renderPhyloView(
  canvas: HTMLCanvasElement,
  view: PhyloViewState,
  layout: PhyloLayout,
): void {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;
  canvas.width = displayW * dpr;
  canvas.height = displayH * dpr;
  ctx.scale(dpr, dpr);

  // Clear
  ctx.clearRect(0, 0, displayW, displayH);

  // Apply scroll
  ctx.save();
  ctx.translate(view.scrollX, view.scrollY);

  // Main tree render
  drawPhyloTree(ctx, layout, dpr);

  // Hover highlight ring
  if (view.hoveredNode != null) {
    const entry = layout.nodes.find(n => n.node.id === view.hoveredNode);
    if (entry) {
      roundRect(ctx, entry.x - 3, entry.y - 3, entry.w + 6, entry.h + 6, 7);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.stroke();
    }
  }

  // Selection ring
  if (view.selectedNode != null) {
    const entry = layout.nodes.find(n => n.node.id === view.selectedNode);
    if (entry) {
      roundRect(ctx, entry.x - 4, entry.y - 4, entry.w + 8, entry.h + 8, 8);
      ctx.strokeStyle = entry.node.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.stroke();
    }
  }

  ctx.restore();
}
