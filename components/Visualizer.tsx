
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { AlgorithmType, VizState } from '../types';

interface VisualizerProps {
  state: VizState | null;
  handData?: any;
}

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#8b5cf6'];

const Visualizer: React.FC<VisualizerProps> = ({ state, handData }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Track element positions - key is original index, value is current visual position
  const [elementPositions, setElementPositions] = useState<Record<string, { x: number; y: number }>>({});
  
  // Refs for high-frequency updates
  const grabbedIdRef = useRef<string | null>(null);
  const grabbedStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const wasPinchingRef = useRef<boolean>(false);
  const currentHandPosRef = useRef<{ x: number; y: number } | null>(null);

  // Larger blocks with more spacing
  const blockW = 90;
  const blockH = 90;
  const gap = 35;

  // Get base positions for elements
  const getBasePositions = useCallback((dataLength: number, width: number, height: number) => {
    const totalWidth = dataLength * (blockW + gap) - gap;
    const startX = Math.max(width * 0.42, (width - totalWidth) / 2);
    const startY = height / 2 - blockH / 2;
    
    const positions: Record<string, { x: number; y: number }> = {};
    for (let i = 0; i < dataLength; i++) {
      positions[`item-${i}`] = {
        x: startX + i * (blockW + gap),
        y: startY
      };
    }
    return positions;
  }, []);

  // Reset positions when data changes
  useEffect(() => {
    if (!svgRef.current || !state) return;
    const width = svgRef.current.clientWidth || window.innerWidth;
    const height = svgRef.current.clientHeight || window.innerHeight;
    const data = Array.isArray(state.data) ? state.data : String(state.data).split('');
    
    if (data.length > 0) {
      setElementPositions(getBasePositions(data.length, width, height));
    }
    grabbedIdRef.current = null;
    hoveredIdRef.current = null;
    isPinchingRef.current = false;
    wasPinchingRef.current = false;
  }, [state?.type, JSON.stringify(state?.data), getBasePositions]);

  // Render visualization
  useEffect(() => {
    if (!svgRef.current || !state) return;
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth || window.innerWidth;
    const height = svgRef.current.clientHeight || window.innerHeight;

    let mainGroup = svg.select<SVGGElement>('g.main-viz');
    if (mainGroup.empty()) mainGroup = svg.append('g').attr('class', 'main-viz');

    if (state.type === AlgorithmType.ARRAY || state.type === AlgorithmType.STRINGS) {
      const data = Array.isArray(state.data) ? state.data : String(state.data).split('');
      
      // Initialize positions if empty or mismatch
      let positions = elementPositions;
      if (Object.keys(positions).length !== data.length) {
        positions = getBasePositions(data.length, width, height);
        setElementPositions(positions);
      }

      const items = mainGroup.selectAll<SVGGElement, any>('g.draggable-item')
        .data(data, (d, i) => `item-${i}`);

      const enter = items.enter().append('g')
        .attr('class', 'draggable-item')
        .attr('data-id', (d, i) => `item-${i}`)
        .style('opacity', 0);

      // Main block with rounded corners
      enter.append('rect')
        .attr('class', 'block-body')
        .attr('width', blockW)
        .attr('height', blockH)
        .attr('rx', 24)
        .attr('fill', (d, i) => COLORS[i % COLORS.length])
        .attr('stroke', 'rgba(255,255,255,0.4)')
        .attr('stroke-width', 3)
        .style('filter', 'drop-shadow(0 12px 24px rgba(0,0,0,0.6))');

      // Index label at bottom
      enter.append('text')
        .attr('class', 'index-label')
        .attr('x', blockW / 2)
        .attr('y', blockH + 25)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.4)')
        .attr('font-size', '14px')
        .attr('font-weight', '700')
        .text((d, i) => `[${i}]`);

      // Value text
      enter.append('text')
        .attr('class', 'value-text')
        .attr('x', blockW / 2)
        .attr('y', blockH / 2 + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '32px')
        .attr('font-weight', '900')
        .style('pointer-events', 'none')
        .style('text-shadow', '0 3px 6px rgba(0,0,0,0.5)');

      const update = enter.merge(items);
      
      update
        .style('opacity', 1)
        .attr('transform', (d, i) => {
          const id = `item-${i}`;
          const pos = positions[id];
          if (!pos) return `translate(0, 0)`;
          
          // Scale based on interaction state
          let scale = 1.0;
          if (grabbedIdRef.current === id) scale = 1.2;
          else if (hoveredIdRef.current === id) scale = 1.1;
          
          return `translate(${pos.x}, ${pos.y}) scale(${scale})`;
        });

      update.select('.value-text').text(d => d);
      
      // Update visual styles
      update.select('.block-body')
        .attr('stroke', (d, i) => {
          const id = `item-${i}`;
          if (grabbedIdRef.current === id) return '#fbbf24';
          if (hoveredIdRef.current === id) return '#ffffff';
          return 'rgba(255,255,255,0.4)';
        })
        .attr('stroke-width', (d, i) => {
          const id = `item-${i}`;
          return (grabbedIdRef.current === id || hoveredIdRef.current === id) ? 5 : 3;
        })
        .style('filter', (d, i) => {
          const id = `item-${i}`;
          if (grabbedIdRef.current === id) return 'drop-shadow(0 20px 40px rgba(251, 191, 36, 0.6))';
          if (hoveredIdRef.current === id) return 'drop-shadow(0 15px 30px rgba(255,255,255,0.3))';
          return 'drop-shadow(0 12px 24px rgba(0,0,0,0.6))';
        });

      items.exit().remove();

      // Pointers update
      let ptrG = mainGroup.select<SVGGElement>('g.pointers');
      if (ptrG.empty()) ptrG = mainGroup.append('g').attr('class', 'pointers');
      
      if (state.pointers) {
        const pData = Object.entries(state.pointers);
        const pts = ptrG.selectAll<SVGTextElement, any>('text.ptr').data(pData, d => d[0]);
        
        pts.enter().append('text').attr('class', 'ptr')
          .attr('text-anchor', 'middle').attr('font-weight', '900')
          .attr('fill', '#fbbf24').attr('font-size', '16px')
          .merge(pts)
          .attr('x', ([_, idx]) => {
            const i = Number(idx);
            const pos = elementPositions[`item-${i}`];
            return pos ? pos.x + blockW / 2 : 0;
          })
          .attr('y', ([_, idx], k) => {
            const i = Number(idx);
            const pos = elementPositions[`item-${i}`];
            return pos ? pos.y - 20 - (k * 25) : 0;
          })
          .text(([label]) => `${label.toUpperCase()} ↓`);
        
        pts.exit().remove();
      }
    }
  }, [state, elementPositions, getBasePositions]);

  // Hand tracking and interaction
  useEffect(() => {
    if (!svgRef.current || !state) return;
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    if (handData?.multiHandLandmarks?.[0]) {
      const landmarks = handData.multiHandLandmarks[0];
      const thumb = landmarks[4];
      const index = landmarks[8];
      
      if (thumb && index) {
        const dist = Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2));
        
        // Refined Pinch parameters for "1009% accuracy" feel
        const pinchOn = 0.06; // Slightly easier to trigger grab
        const pinchOff = 0.09; // Harder to accidentally drop (hysteresis)
        const isPinching = isPinchingRef.current ? dist < pinchOff : dist < pinchOn;
        
        // Calculate raw position - bias towards Index finger (landmarks[8]) for better "1 finger" pointing feel
        // but include some Thumb influence for stability during pinch
        let rawX = (1 - (index.x * 0.8 + thumb.x * 0.2)) * width;
        let rawY = (index.y * 0.8 + thumb.y * 0.2) * height;

        // Apply smoothing (Exponential Moving Average) to reduce jitter
        const smoothingFactor = 0.4; // 0.0 = infinite lag, 1.0 = no smoothing
        const prev = currentHandPosRef.current || { x: rawX, y: rawY };
        const handX = prev.x + (rawX - prev.x) * smoothingFactor;
        const handY = prev.y + (rawY - prev.y) * smoothingFactor;
        
        currentHandPosRef.current = { x: handX, y: handY };

        // Find which element the hand is over
        let foundHover: string | null = null;
        let closestDist = Infinity;
        
        // Search radius for hovering
        (Object.entries(elementPositions) as [string, { x: number; y: number }][]).forEach(([id, pos]) => {
          const centerX = pos.x + blockW / 2;
          const centerY = pos.y + blockH / 2;
          const distToCenter = Math.sqrt(Math.pow(handX - centerX, 2) + Math.pow(handY - centerY, 2));
          
          // Hover zone
          if (handX >= pos.x && handX <= pos.x + blockW &&
              handY >= pos.y && handY <= pos.y + blockH) {
             if (distToCenter < closestDist) {
               closestDist = distToCenter;
               foundHover = id;
             }
          } else if (distToCenter < 60) { // Proximity hover
             if (distToCenter < closestDist) {
               closestDist = distToCenter;
               foundHover = id;
             }
          }
        });

        hoveredIdRef.current = foundHover;

        // Handle pinch start - grab element
        if (isPinching && !wasPinchingRef.current) {
          if (foundHover) {
            grabbedIdRef.current = foundHover;
            grabbedStartPosRef.current = { ...elementPositions[foundHover] };
          }
        }

        // Handle pinch hold - drag element
        if (isPinching && grabbedIdRef.current) {
          setElementPositions(prev => ({
            ...prev,
            [grabbedIdRef.current!]: {
              x: handX - blockW / 2,
              y: handY - blockH / 2
            }
          }));
        }

        // Handle pinch release - swap elements
        if (!isPinching && wasPinchingRef.current && grabbedIdRef.current) {
          const grabbedId = grabbedIdRef.current;
          const grabbedPos = elementPositions[grabbedId];
          
          // Find the closest element to swap with
          let swapTarget: string | null = null;
          let minDist = Infinity;
          
          (Object.entries(elementPositions) as [string, { x: number; y: number }][]).forEach(([id, pos]) => {
            if (id === grabbedId) return;
            
            const centerX = pos.x + blockW / 2;
            const centerY = pos.y + blockH / 2;
            const grabbedCenterX = grabbedPos.x + blockW / 2;
            const grabbedCenterY = grabbedPos.y + blockH / 2;
            
            const distBetween = Math.sqrt(
              Math.pow(grabbedCenterX - centerX, 2) + 
              Math.pow(grabbedCenterY - centerY, 2)
            );
            
            // Only swap if close enough (within 1.5x block size)
            if (distBetween < (blockW + gap) * 1.2 && distBetween < minDist) {
              minDist = distBetween;
              swapTarget = id;
            }
          });

          if (swapTarget && grabbedStartPosRef.current) {
            // Perform swap - grabbed element goes to target's position, target goes to grabbed's original position
            const targetPos = { ...elementPositions[swapTarget] };
            const originalPos = grabbedStartPosRef.current;
            
            setElementPositions(prev => ({
              ...prev,
              [grabbedId]: targetPos,
              [swapTarget!]: originalPos
            }));
          } else {
            // No swap target - return to original position
            if (grabbedStartPosRef.current) {
              setElementPositions(prev => ({
                ...prev,
                [grabbedId]: grabbedStartPosRef.current!
              }));
            }
          }
          
          grabbedIdRef.current = null;
          grabbedStartPosRef.current = null;
        }

        wasPinchingRef.current = isPinching;
        isPinchingRef.current = isPinching;

        // Render hand mesh
        let gHand = svg.select<SVGGElement>('g.hand-mesh');
        if (gHand.empty()) gHand = svg.append('g').attr('class', 'hand-mesh').style('pointer-events', 'none');
        
        const dots = gHand.selectAll<SVGCircleElement, any>('circle.joint').data(landmarks);
        dots.enter().append('circle').attr('class', 'joint').attr('r', 4).merge(dots)
          .attr('cx', (lm: any) => (1 - lm.x) * width)
          .attr('cy', (lm: any) => lm.y * height)
          .attr('fill', isPinching ? '#fbbf24' : (foundHover ? 'rgba(255,255,255,0.9)' : 'rgba(99, 102, 241, 0.5)'));
        dots.exit().remove();

        // Enhanced Pointer Cursor
        let cursorGroup = svg.select<SVGGElement>('g.cursor-group');
        if (cursorGroup.empty()) {
          cursorGroup = svg.append('g').attr('class', 'cursor-group').style('pointer-events', 'none');
          cursorGroup.append('circle').attr('class', 'cursor-ring').attr('fill', 'none').attr('stroke-width', 3);
          cursorGroup.append('circle').attr('class', 'cursor-dot').attr('r', 6).attr('fill', 'white');
        }
        
        cursorGroup.attr('transform', `translate(${handX}, ${handY})`).attr('opacity', 1);
        
        cursorGroup.select('circle.cursor-ring')
          .attr('r', isPinching ? 12 : (foundHover ? 22 : 35))
          .attr('stroke', isPinching ? '#fbbf24' : (foundHover ? '#ffffff' : 'rgba(255,255,255,0.3)'))
          .attr('stroke-width', isPinching ? 5 : 3);
          
         cursorGroup.select('circle.cursor-dot')
          .attr('fill', isPinching ? '#fbbf24' : 'white');

        // Connection line when dragging
        let dragLine = svg.select('line.drag-line');
        if (grabbedIdRef.current && grabbedStartPosRef.current) {
          if (dragLine.empty()) {
            dragLine = svg.append('line')
              .attr('class', 'drag-line')
              .attr('stroke', 'rgba(251, 191, 36, 0.3)')
              .attr('stroke-width', 3)
              .attr('stroke-dasharray', '8,8')
              .style('pointer-events', 'none');
          }
          dragLine
            .attr('x1', grabbedStartPosRef.current.x + blockW / 2)
            .attr('y1', grabbedStartPosRef.current.y + blockH / 2)
            .attr('x2', handX)
            .attr('y2', handY)
            .attr('opacity', 1);
        } else {
          dragLine.attr('opacity', 0);
        }
      }
    } else {
      // No hand detected - cleanup
      svg.select('g.hand-mesh').selectAll('*').remove();
      svg.select('g.cursor-group').attr('opacity', 0);
      svg.select('line.drag-line').attr('opacity', 0);
      
      // If was grabbing, return to original position
      if (grabbedIdRef.current && grabbedStartPosRef.current) {
        const grabbedId = grabbedIdRef.current;
        setElementPositions(prev => ({
          ...prev,
          [grabbedId]: grabbedStartPosRef.current!
        }));
      }
      
      grabbedIdRef.current = null;
      grabbedStartPosRef.current = null;
      hoveredIdRef.current = null;
      isPinchingRef.current = false;
      wasPinchingRef.current = false;
      currentHandPosRef.current = null;
    }
  }, [handData, elementPositions, state]);

  return (
    <div className="w-full h-full relative bg-transparent overflow-hidden">
      <svg ref={svgRef} className="w-full h-full pointer-events-none" />
      {state?.explanation && (
        <div className="absolute bottom-10 right-10 left-[480px] text-center pointer-events-none">
          <div className="bg-black/80 backdrop-blur-3xl text-white px-10 py-5 rounded-[2.5rem] border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] inline-block max-w-2xl transform transition-all duration-700">
            <span className="block text-[10px] font-black tracking-[0.4em] text-blue-500 mb-2 uppercase">Spatial Trace</span>
            <span className="text-sm font-bold tracking-tight leading-relaxed block opacity-95">{state.explanation}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Visualizer;
