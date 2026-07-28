import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SPECIES_LABELS } from '../lib/format.js';

const NODE_W = 196;
const NODE_H = 64;
// x where the generation badge starts; the name has to stop short of it.
const BADGE_X = NODE_W - 46;
const H_GAP = 28;
const V_GAP = 76;

/**
 * Lays the pedigree out in generational bands: ancestors above the root,
 * descendants below, one band per depth returned by the API.
 *
 * Within a band, nodes are ordered by the mean position of their neighbours in
 * the adjacent band (a barycentre sweep), which is what stops the parent edges
 * from crossing each other into an unreadable knot. A few passes in each
 * direction is enough for pedigrees of a realistic size.
 */
function layout(nodes, edges) {
  if (nodes.length === 0) return { positioned: [], width: 0, height: 0 };

  const byDepth = new Map();
  for (const node of nodes) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth).push(node);
  }

  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const order = new Map(depths.map((d) => [d, byDepth.get(d).map((n) => n.id)]));

  const parentsOf = new Map();
  const childrenOf = new Map();
  for (const edge of edges) {
    if (!parentsOf.has(edge.childId)) parentsOf.set(edge.childId, []);
    parentsOf.get(edge.childId).push(edge.parentId);
    if (!childrenOf.has(edge.parentId)) childrenOf.set(edge.parentId, []);
    childrenOf.get(edge.parentId).push(edge.childId);
  }

  const indexIn = (depth, id) => order.get(depth)?.indexOf(id) ?? -1;

  const sweep = (fromDepthIdx, toDepthIdx, step, relation) => {
    for (let i = fromDepthIdx; i !== toDepthIdx; i += step) {
      const depth = depths[i];
      const neighbourDepth = depths[i - step];
      if (neighbourDepth === undefined) continue;

      const scored = order.get(depth).map((id, idx) => {
        const neighbours = (relation.get(id) ?? [])
          .map((nid) => indexIn(neighbourDepth, nid))
          .filter((n) => n >= 0);
        // Nodes with no neighbour in the adjacent band keep their place.
        const key = neighbours.length
          ? neighbours.reduce((a, b) => a + b, 0) / neighbours.length
          : idx;
        return { id, key, idx };
      });

      scored.sort((a, b) => a.key - b.key || a.idx - b.idx);
      order.set(depth, scored.map((s) => s.id));
    }
  };

  for (let pass = 0; pass < 4; pass += 1) {
    sweep(1, depths.length, 1, parentsOf);
    sweep(depths.length - 2, -1, -1, childrenOf);
  }

  const widest = Math.max(...depths.map((d) => order.get(d).length));
  const canvasWidth = widest * NODE_W + (widest - 1) * H_GAP;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const positioned = [];

  depths.forEach((depth, bandIndex) => {
    const ids = order.get(depth);
    const bandWidth = ids.length * NODE_W + (ids.length - 1) * H_GAP;
    const offset = (canvasWidth - bandWidth) / 2;

    ids.forEach((id, i) => {
      positioned.push({
        ...nodeById.get(id),
        x: offset + i * (NODE_W + H_GAP),
        y: bandIndex * (NODE_H + V_GAP),
      });
    });
  });

  return {
    positioned,
    width: canvasWidth,
    height: depths.length * NODE_H + (depths.length - 1) * V_GAP,
    depths,
  };
}

function truncate(value, max) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function FamilyTree({ graph, rootId, onSelect, selectedId }) {
  const svgRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const dragState = useRef(null);

  const { positioned, width, height } = useMemo(
    () => layout(graph?.nodes ?? [], graph?.edges ?? []),
    [graph],
  );

  const posById = useMemo(
    () => new Map(positioned.map((n) => [n.id, n])),
    [positioned],
  );

  const PADDING = 48;
  const viewWidth = width + PADDING * 2;
  const viewHeight = height + PADDING * 2;

  // Re-centre whenever a different pedigree is loaded.
  useEffect(() => {
    setTransform({ x: 0, y: 0, k: 1 });
  }, [rootId]);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      dragState.current = { x: e.clientX, y: e.clientY, start: transform };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [transform],
  );

  const onPointerMove = useCallback((e) => {
    const drag = dragState.current;
    if (!drag) return;
    setTransform({
      ...drag.start,
      x: drag.start.x + (e.clientX - drag.x),
      y: drag.start.y + (e.clientY - drag.y),
    });
  }, []);

  const onPointerUp = useCallback((e) => {
    dragState.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const onWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain scroll should still scroll the page
    e.preventDefault();
    setTransform((t) => ({
      ...t,
      k: Math.min(2.5, Math.max(0.35, t.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12))),
    }));
  }, []);

  const zoomBy = (factor) =>
    setTransform((t) => ({ ...t, k: Math.min(2.5, Math.max(0.35, t.k * factor)) }));

  if (!graph || positioned.length === 0) {
    return (
      <div className="card flex items-center justify-center py-16 text-sm text-ink-muted">
        No pedigree to display yet.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <Legend />
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
            −
          </button>
          <span className="tabular w-12 text-center text-xs text-ink-muted">
            {Math.round(transform.k * 100)}%
          </span>
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
            +
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
          >
            Reset
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        role="img"
        aria-label={`Pedigree diagram with ${positioned.length} plants`}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="w-full cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ maxHeight: '70vh' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <g transform={`translate(${PADDING} ${PADDING})`}>
            {graph.edges.map((edge, i) => {
              const parent = posById.get(edge.parentId);
              const child = posById.get(edge.childId);
              if (!parent || !child) return null;

              const x1 = parent.x + NODE_W / 2;
              const y1 = parent.y + NODE_H;
              const x2 = child.x + NODE_W / 2;
              const y2 = child.y;
              const mid = (y1 + y2) / 2;

              return (
                <path
                  key={`${edge.parentId}-${edge.childId}-${edge.role}-${i}`}
                  d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.role === 'mother' ? 'var(--color-chile-500)' : 'var(--color-ink-faint)'}
                  strokeWidth={1.6}
                  strokeDasharray={edge.role === 'father' ? '5 4' : undefined}
                  opacity={0.85}
                />
              );
            })}

            {positioned.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                isRoot={node.id === rootId}
                isSelected={node.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </g>
        </g>
      </svg>

      <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
        Drag to pan · Ctrl/⌘ + scroll to zoom · click a plant to open it
      </p>
    </div>
  );
}

function TreeNode({ node, isRoot, isSelected, onSelect }) {
  const restricted = node.restricted;

  const fill = restricted
    ? 'var(--color-surface-sunken)'
    : isRoot
      ? 'var(--color-chile-50)'
      : 'var(--color-surface-raised)';

  const stroke = isSelected
    ? 'var(--color-chile-600)'
    : isRoot
      ? 'var(--color-chile-300)'
      : 'var(--color-line)';

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className={restricted ? 'cursor-not-allowed' : 'cursor-pointer'}
      onClick={() => !restricted && onSelect?.(node)}
      onKeyDown={(e) => {
        if (!restricted && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect?.(node);
        }
      }}
      tabIndex={restricted ? -1 : 0}
      role={restricted ? undefined : 'button'}
      aria-label={restricted ? 'Restricted plant' : `${node.name}, ${node.accessionCode ?? ''}`}
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={10}
        fill={fill}
        stroke={stroke}
        strokeWidth={isSelected || isRoot ? 2 : 1}
        strokeDasharray={restricted ? '4 4' : undefined}
      />

      {restricted ? (
        <>
          <text x={14} y={26} fontSize={12.5} fontWeight={500} fill="var(--color-ink-faint)">
            🔒 Restricted
          </text>
          <text x={14} y={44} fontSize={11} fill="var(--color-ink-faint)">
            Not shared with you
          </text>
        </>
      ) : (
        <>
          <text x={14} y={24} fontSize={13} fontWeight={600} fill="var(--color-ink)">
            {truncate(node.name, node.generation ? 18 : 24)}
          </text>
          <text x={14} y={41} fontSize={11} fill="var(--color-ink-muted)" fontFamily="ui-monospace, monospace">
            {truncate(node.accessionCode, 16)}
          </text>
          <text x={14} y={56} fontSize={10.5} fill="var(--color-ink-faint)" fontStyle="italic">
            {truncate(SPECIES_LABELS[node.species] ?? node.species ?? '', 16)}
          </text>
          {node.generation && (
            <>
              <rect
                x={BADGE_X}
                y={12}
                width={34}
                height={18}
                rx={9}
                fill="var(--color-chile-50)"
              />
              <text
                x={BADGE_X + 17}
                y={25}
                fontSize={10.5}
                fontWeight={600}
                textAnchor="middle"
                fill="var(--color-chile-700)"
                fontFamily="ui-monospace, monospace"
              >
                {truncate(node.generation, 5)}
              </text>
            </>
          )}
          {node.podCount > 0 && (
            <text x={NODE_W - 14} y={52} fontSize={10} textAnchor="end" fill="var(--color-ink-faint)">
              {node.podCount} pod{node.podCount === 1 ? '' : 's'}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden="true">
          <line x1="0" y1="4" x2="22" y2="4" stroke="var(--color-chile-500)" strokeWidth="2" />
        </svg>
        Seed parent
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden="true">
          <line
            x1="0" y1="4" x2="22" y2="4"
            stroke="var(--color-ink-faint)" strokeWidth="2" strokeDasharray="5 4"
          />
        </svg>
        Pollen parent
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-dashed border-line bg-surface-sunken" />
        Restricted
      </span>
    </div>
  );
}
