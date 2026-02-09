
import React, { useState, useEffect, useRef } from 'react';
import { AlgorithmMetadata, SimulationStep, DataStructureType } from '../types';

interface HologramRendererProps {
  metadata: AlgorithmMetadata | null;
  currentStep: SimulationStep | null;
  onManualAction: () => void;
}

const HologramRenderer: React.FC<HologramRendererProps> = ({ metadata, currentStep, onManualAction }) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastPos({ x: e.clientX, y: e.clientY });
    onManualAction();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setOffset(prev => ({ x: prev.x + (e.clientX - lastPos.x), y: prev.y + (e.clientY - lastPos.y) }));
      setLastPos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, lastPos]);

  const handleWheel = (e: React.WheelEvent) => {
    setScale(prev => Math.max(0.2, Math.min(5, prev * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  if (!metadata || !currentStep) {
    return (
      <div className="absolute bottom-8 right-8 pointer-events-none z-50">
        <div className="bg-slate-900/60 backdrop-blur-md border border-white/5 p-4 rounded-2xl flex items-center gap-4 animate-pulse">
           <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
             <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
             </svg>
           </div>
           <div className="flex flex-col">
             <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Kernel Ready</span>
             <span className="text-[8px] text-slate-400 font-mono uppercase">Waiting for source input...</span>
           </div>
        </div>
      </div>
    );
  }

  const renderNode = (val: any, idx: number | string, x: number, y: number, variant: 'box' | 'circle' = 'box') => {
    const isActive = currentStep.activeElements.includes(idx as number);
    const isCompared = currentStep.comparedElements?.includes(idx as number);
    const isModified = currentStep.modifiedElements?.includes(idx as number);

    // Extract just the numeric/clean value - remove any labels like " (Root)" or " (Left)"
    const cleanValue = String(val).replace(/\s*\([^)]*\)/g, '').replace(/->\d+/g, '').trim();

    let baseClass = 'bg-slate-900/60 border-slate-700/50 text-slate-300 shadow-xl';
    if (isActive) baseClass = 'bg-indigo-500/90 border-indigo-400 text-white scale-110 z-20 shadow-2xl shadow-indigo-500/40 ring-4 ring-indigo-500/20';
    else if (isCompared) baseClass = 'bg-amber-500/90 border-amber-300 text-white scale-105 z-10 shadow-xl shadow-amber-500/40 ring-4 ring-amber-500/20';
    else if (isModified) baseClass = 'bg-rose-500/90 border-rose-300 text-white shadow-xl shadow-rose-500/40';

    // Sanitize coordinates
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;

    return (
      <div 
        key={idx}
        className={`absolute flex items-center justify-center transition-all duration-300 border backdrop-blur-md
          ${variant === 'circle' ? 'rounded-full w-12 h-12' : 'rounded-2xl w-14 h-14'}
          ${baseClass} cursor-grab active:cursor-grabbing group`}
        style={{ left: safeX, top: safeY, transform: `translate(-50%, -50%)` }}
      >
        <span className="text-sm font-bold font-mono drop-shadow-md">{cleanValue}</span>
      </div>
    );
  };

  const renderStructure = () => {
    let data = currentStep.state;
    const struct = metadata.structure;

    // Pre-process state if it's a string (for graphs)
    if (typeof data === 'string' && struct === DataStructureType.GRAPH) {
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.warn('Could not parse graph state:', data);
        data = null;
      }
    }

    if (struct === DataStructureType.ARRAY || struct === DataStructureType.STRING || (struct !== DataStructureType.LINKED_LIST && Array.isArray(data))) {
      return (
        <div className="relative">
          {data.map((val: any, idx: number) => renderNode(val, idx, idx * 80 - (data.length * 40), 0))}
        </div>
      );
    }

    // Linked List Visualization
    if (struct === DataStructureType.LINKED_LIST && Array.isArray(data)) {
      const listType = metadata.linkedListType || 'Singly';
      const nodeWidth = 60;
      const nodeHeight = 50;
      const spacing = 120;
      const startX = -((data.length - 1) * spacing) / 2;
      const startY = 0;

      return (
        <div className="relative" style={{ width: data.length * spacing + 100, height: 300 }}>
          {/* Draw connections SVG */}
          <svg 
            className="absolute" 
            style={{ left: startX - 50, top: startY, width: data.length * spacing + 100, height: 300 }}
            viewBox={`${startX - 50} ${startY} ${data.length * spacing + 100} 300`}
          >
            {/* Forward pointers (next) */}
            {data.map((_: any, idx: number) => {
              if (idx < data.length - 1) {
                const x1 = startX + idx * spacing + nodeWidth / 2 + 20;
                const y1 = startY + nodeHeight / 2;
                const x2 = startX + (idx + 1) * spacing - nodeWidth / 2 - 20;
                const y2 = startY + nodeHeight / 2;
                return (
                  <g key={`next-${idx}`}>
                    <path
                      d={`M ${x1} ${y1} L ${x2} ${y2}`}
                      stroke="rgba(129, 140, 248, 0.6)"
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                );
              }
              return null;
            })}

            {/* Circular pointer for circular linked list */}
            {listType === 'Circular' && data.length > 1 && (
              <path
                d={`M ${startX + (data.length - 1) * spacing + nodeWidth / 2 + 20} ${startY + nodeHeight / 2}
                   L ${startX + (data.length - 1) * spacing + nodeWidth / 2 + 40} ${startY - 60}
                   L ${startX - 40} ${startY - 60}
                   L ${startX - 20} ${startY + nodeHeight / 2}`}
                stroke="rgba(129, 140, 248, 0.6)"
                strokeWidth="2"
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            )}

            {/* Backward pointers for doubly linked list */}
            {listType === 'Doubly' && data.map((_: any, idx: number) => {
              if (idx > 0) {
                const x1 = startX + idx * spacing - nodeWidth / 2 - 20;
                const y1 = startY + nodeHeight;
                const x2 = startX + (idx - 1) * spacing + nodeWidth / 2 + 20;
                const y2 = startY + nodeHeight;
                return (
                  <g key={`prev-${idx}`}>
                    <path
                      d={`M ${x1} ${y1} L ${x2} ${y2}`}
                      stroke="rgba(244, 114, 182, 0.6)"
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#arrowhead-pink)"
                    />
                  </g>
                );
              }
              return null;
            })}

            {/* Arrow markers */}
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="rgba(129, 140, 248, 0.6)" />
              </marker>
              <marker id="arrowhead-pink" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="rgba(244, 114, 182, 0.6)" />
              </marker>
            </defs>
          </svg>

          {/* Render nodes */}
          {data.map((val: any, idx: number) => {
            const x = startX + idx * spacing;
            const y = startY;
            const isActive = currentStep.activeElements.includes(idx);
            const isCompared = currentStep.comparedElements?.includes(idx);
            const isModified = currentStep.modifiedElements?.includes(idx);

            let baseClass = 'bg-slate-900/60 border-slate-700/50 text-slate-300 shadow-xl';
            if (isActive) baseClass = 'bg-indigo-500/90 border-indigo-400 text-white scale-110 z-20 shadow-2xl shadow-indigo-500/40 ring-4 ring-indigo-500/20';
            else if (isCompared) baseClass = 'bg-amber-500/90 border-amber-300 text-white scale-105 z-10 shadow-xl shadow-amber-500/40 ring-4 ring-amber-500/20';
            else if (isModified) baseClass = 'bg-rose-500/90 border-rose-300 text-white shadow-xl shadow-rose-500/40';

            const cleanValue = String(val).replace(/\\s*\\([^)]*\\)/g, '').replace(/->\\d+/g, '').trim();

            return (
              <div
                key={idx}
                className={`absolute flex items-center justify-center transition-all duration-300 border backdrop-blur-md rounded-xl w-14 h-14 ${baseClass} cursor-grab active:cursor-grabbing`}
                style={{ left: x, top: y, transform: `translate(-50%, -50%)` }}
              >
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold font-mono drop-shadow-md">{cleanValue}</span>
                  <span className="text-[7px] text-slate-400 font-mono">
                    {listType === 'Doubly' ? '⟷' : listType === 'Circular' ? '⟳' : '→'}
                  </span>
                </div>
              </div>
            );
          })}

          {/* NULL pointer for singly linked list */}
          {listType !== 'Circular' && data.length > 0 && (
            <div
              className="absolute flex items-center justify-center transition-all duration-300 border backdrop-blur-md rounded-xl w-12 h-8 bg-slate-800/60 border-slate-700/50 text-slate-300"
              style={{ left: startX + (data.length - 1) * spacing + spacing / 2, top: startY, transform: `translate(-50%, -50%)` }}
            >
              <span className="text-[10px] font-bold font-mono">NULL</span>
            </div>
          )}
        </div>
      );
    }

    if (struct === DataStructureType.GRAPH) {
      // Parse graph structure from state (data has been pre-processed above)
      let nodes: Array<{id: string; label?: string}> = [];
      let edges: Array<{source: string; target: string; weight?: number}> = [];

      try {
        let stateData = data; // Use pre-processed data
        
        // If it's still a string (shouldn't be after pre-processing), try parsing
        if (typeof stateData === 'string') {
          try {
            stateData = JSON.parse(stateData);
          } catch (e) {
            console.warn('Failed to parse state as JSON:', stateData, e);
            stateData = { nodes: [], edges: [] };
          }
        }

        // Try to extract nodes and edges from various possible formats
        if (stateData && typeof stateData === 'object') {
          if (stateData.nodes && Array.isArray(stateData.nodes)) {
            nodes = stateData.nodes.map((n: any) => ({
              id: String(n.id || n),
              label: String(n.label || n.id || n)
            }));
          }
          if (stateData.edges && Array.isArray(stateData.edges)) {
            edges = stateData.edges.map((e: any) => ({
              source: String(e.source || e[0]),
              target: String(e.target || e[1]),
              weight: e.weight || e[2]
            }));
          }
        }

        // If still no nodes, try array format
        if (nodes.length === 0 && Array.isArray(stateData)) {
          nodes = stateData.map((val: any) => ({
            id: String(val),
            label: String(val)
          }));
        }

        console.log('Graph Debug:', { nodes, edges, rawState: stateData });
      } catch (error) {
        console.error('Graph parsing error:', error);
        return null;
      }

      if (nodes.length === 0) {
        console.warn('No nodes found in graph state');
        return null;
      }

      // Calculate circular layout for nodes
      const nodePositions: Record<string, {x: number; y: number}> = {};
      const radius = Math.min(300, Math.max(100, nodes.length * 40));
      
      nodes.forEach((node, idx) => {
        const angle = (idx / nodes.length) * Math.PI * 2;
        nodePositions[node.id] = {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        };
      });

      const graphType = metadata.graphType || 'Undirected';

      return (
        <div className="relative" style={{ width: radius * 4, height: radius * 4 }}>
          {/* Draw edges SVG */}
          <svg
            className="absolute"
            style={{ inset: 0, width: '100%', height: '100%' }}
            viewBox={`${-radius * 2} ${-radius * 2} ${radius * 4} ${radius * 4}`}
          >
            <defs>
              {/* Arrow marker for directed edges */}
              <marker id="arrowhead-graph" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="rgba(129, 140, 248, 0.8)" />
              </marker>
              <marker id="arrowhead-active" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="rgba(99, 102, 241, 1)" />
              </marker>
            </defs>

            {/* Draw all edges */}

            {edges.map((edge, edgeIdx) => {
              const start = nodePositions[edge.source];
              const end = nodePositions[edge.target];
              
              if (!start || !end) return null;

              const isActive = currentStep.activeElements?.some((el: any) => 
                String(el).includes(edge.source) || String(el).includes(edge.target)
              );

              // Determine if this is a bidirectional/undirected graph
              const isBidirectional = graphType === 'Bidirectional' || graphType === 'Undirected';
              const isDirected = graphType === 'Directed' || graphType === 'DAG' || graphType === 'Cyclic';
              const isWeighted = graphType === 'Weighted' || edge.weight !== undefined;

              // For bidirectional, draw both directions if not already drawn
              const hasReverseEdge = edges.some(e => e.source === edge.target && e.target === edge.source && edges.indexOf(e) < edgeIdx);
              
              let offsetX = 0, offsetY = 0;
              if (isBidirectional && hasReverseEdge) {
                // Curve the line
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const perpX = -dy / Math.hypot(dx, dy) * 20;
                const perpY = dx / Math.hypot(dx, dy) * 20;
                
                return (
                  <g key={`edge-${edgeIdx}`}>
                    <path
                      d={`M ${start.x} ${start.y} Q ${(start.x + end.x) / 2 + perpX} ${(start.y + end.y) / 2 + perpY} ${end.x} ${end.y}`}
                      stroke={isActive ? 'rgba(99, 102, 241, 1)' : 'rgba(129, 140, 248, 0.5)'}
                      strokeWidth={isActive ? '3' : '2'}
                      fill="none"
                      markerEnd={isDirected ? (isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead-graph)') : 'none'}
                    />
                    {isWeighted && edge.weight && (
                      <text
                        x={(start.x + end.x) / 2 + (perpX / 2)}
                        y={(start.y + end.y) / 2 + (perpY / 2) - 5}
                        fontSize="12"
                        fill={isActive ? 'rgba(99, 102, 241, 1)' : 'rgba(148, 163, 247, 0.8)'}
                        textAnchor="middle"
                        fontWeight="bold"
                      >
                        {edge.weight}
                      </text>
                    )}
                  </g>
                );
              }

              return (
                <g key={`edge-${edgeIdx}`}>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={isActive ? 'rgba(99, 102, 241, 1)' : 'rgba(129, 140, 248, 0.5)'}
                    strokeWidth={isActive ? '3' : '2'}
                    markerEnd={isDirected ? (isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead-graph)') : 'none'}
                  />
                  {isWeighted && edge.weight && (
                    <text
                      x={(start.x + end.x) / 2}
                      y={(start.y + end.y) / 2 - 8}
                      fontSize="12"
                      fill={isActive ? 'rgba(99, 102, 241, 1)' : 'rgba(148, 163, 247, 0.8)'}
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {edge.weight}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Render nodes */}
          {nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;

            const isActive = currentStep.activeElements?.includes(node.id);
            const isCompared = currentStep.comparedElements?.includes(node.id);
            const isModified = currentStep.modifiedElements?.includes(node.id);

            let baseClass = 'bg-slate-900/60 border-slate-700/50 text-slate-300 shadow-xl';
            if (isActive) baseClass = 'bg-indigo-500/90 border-indigo-400 text-white scale-125 z-20 shadow-2xl shadow-indigo-500/40 ring-4 ring-indigo-500/20';
            else if (isCompared) baseClass = 'bg-amber-500/90 border-amber-300 text-white scale-110 z-10 shadow-xl shadow-amber-500/40 ring-4 ring-amber-500/20';
            else if (isModified) baseClass = 'bg-rose-500/90 border-rose-300 text-white shadow-xl shadow-rose-500/40';

            return (
              <div
                key={node.id}
                className={`absolute flex items-center justify-center transition-all duration-300 border backdrop-blur-md rounded-full w-16 h-16 ${baseClass} cursor-grab active:cursor-grabbing`}
                style={{ left: pos.x, top: pos.y, transform: `translate(-50%, -50%)` }}
              >
                <span className="text-sm font-bold font-mono drop-shadow-md">{node.label || node.id}</span>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center relative bg-transparent cursor-crosshair transition-colors duration-500 z-10"
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      <div 
        className="relative transition-transform duration-200"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      >
        {renderStructure()}
      </div>
      
      {/* Subtler UI Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-screen">
        <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '64px 64px' }}></div>
      </div>
    </div>
  );
};

export default HologramRenderer;
