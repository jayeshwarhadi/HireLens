
// @google/genai Coding Guidelines followed:
// - Used new GoogleGenAI({ apiKey: process.env.API_KEY })
// - Used gemini-3-flash-preview for text analysis
// - Used responseSchema for structured JSON output
// - Extracted text using .text property (not .text())

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as pdfjsLib from 'pdfjs-dist';
import { AppMode, InterviewConfig, FeedbackData, VisualState, AlgorithmType, AnimationStep, VizState, PanelConfig } from './types';
import { AlgorithmMetadata, SimulationStep, DataStructureType } from './hologram-algorithm-engine/types';
import { analyzeAlgorithm } from './hologram-algorithm-engine/geminiService';
import { generateComprehensiveCodeFeedback, CodeFeedback } from './services/codeFeedbackService';
import CodeFeedbackDisplay from './components/CodeFeedbackDisplay';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Parse "Please retry in 52.978189848s" from 429 error message (ms)
function parse429RetryDelayMs(message: string): number | null {
  const match = message.match(/retry in (\d+(?:\.\d+)?)\s*s/i) || message.match(/(\d+(?:\.\d+)?)\s*s/i);
  if (!match) return null;
  const sec = parseFloat(match[1]);
  return Number.isFinite(sec) ? Math.min(sec * 1000, 65000) : null; // cap 65s
}

// Retry utility with exponential backoff for API calls; for 429 uses API-suggested delay
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      const isRetryable = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('429');
      if (!isRetryable || attempt === maxRetries - 1) throw error;
      const is429 = msg.includes('429');
      const delayMs = is429 ? (parse429RetryDelayMs(msg) ?? 55000) : baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`API busy${is429 ? ' (429 quota)' : ''}, retrying in ${Math.round(delayMs/1000)}s... (attempt ${attempt + 2}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

import { CameraView } from './components/CameraView';
import { CodeEditor } from './components/CodeEditor';
import { TeachingAnimation } from './components/TeachingAnimation';
import { decodeBase64, decodeAudioData, createPcmBlob, encodeBase64 } from './services/audioService';

// Hologram Algorithm Engine Components (Inline)
const HologramCameraLayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'initializing' | 'active' | 'denied' | 'blocked'>('initializing');
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        try {
          await videoRef.current.play();
          setStatus('active');
        } catch (playError) {
          console.warn("Autoplay blocked, waiting for user interaction");
          setStatus('blocked');
        }
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setStatus('denied');
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Fallback animated gradient background */}
      <div className="absolute inset-0 bg-[#0a0e27]">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-slate-800/60 to-purple-900/40" />
        <div className="absolute inset-0 opacity-50" style={{
          backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.25) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)'
        }} />
      </div>
      
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-1000 ${status === 'active' ? 'opacity-100' : 'opacity-0'}`}
        />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-[0.05]" 
               style={{ 
                 backgroundImage: 'linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 50%)', 
                 backgroundSize: '100% 4px' 
               }} />
          <div className="absolute top-24 left-10 flex flex-col gap-1 z-20">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : status === 'denied' ? 'bg-amber-500' : 'bg-amber-500'}`}></div>
              <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] drop-shadow-md">
                {status === 'active' ? 'CAMERA LIVE' : status === 'denied' ? 'CAMERA  VIRTUAL' : 'CAMERA // CONNECTING'}
              </span>
            </div>
            <span className="text-[8px] text-slate-500 font-mono tracking-widest uppercase ml-4">
              {status === 'active' ? 'Buffer: 0.04ms | Latency: 12ms' : 'Fallback: Gradient Mode'}
            </span>
          </div>
          <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.6)]" />
        </div>
        {(status === 'blocked' || status === 'initializing') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto bg-slate-950/40 backdrop-blur-sm">
            <button 
              onClick={startCamera}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl transition-all active:scale-95"
            >
              Initialize Optical Sensor
            </button>
          </div>
        )}
        {/* Removed the denied error screen - now uses gradient fallback silently */}
      </div>
    </div>
  );
};

// Hologram Renderer Component (Inline)
interface HologramRendererProps {
  metadata: AlgorithmMetadata | null;
  currentStep: SimulationStep | null;
  onManualAction: () => void;
}

const HologramRendererInline: React.FC<HologramRendererProps> = ({ metadata, currentStep, onManualAction }) => {
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
      <div className="w-full h-full flex items-center justify-center relative">
        <div className="text-center z-50">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-black text-white mb-2 tracking-tight">Simulation Kernel Ready</h3>
          <p className="text-sm text-slate-300 font-medium">Waiting for source code analysis...</p>
        </div>
      </div>
    );
  }

  const renderNode = (val: any, idx: number | string, x: number, y: number, variant: 'box' | 'circle' = 'box', nodeColor?: string) => {
    const activeElements = Array.isArray(currentStep.activeElements) ? currentStep.activeElements : [];
    const comparedElements = Array.isArray(currentStep.comparedElements) ? currentStep.comparedElements : [];
    const modifiedElements = Array.isArray(currentStep.modifiedElements) ? currentStep.modifiedElements : [];
    
    const isActive = activeElements.includes(idx as number);
    const isCompared = comparedElements.includes(idx as number);
    const isModified = modifiedElements.includes(idx as number);

    let baseClass = nodeColor || 'bg-rose-300/80 border-rose-400/50 text-slate-800';
    if (isActive) baseClass = 'bg-indigo-500 border-indigo-400 text-white scale-110 z-20 shadow-2xl shadow-indigo-500/40 ring-4 ring-indigo-500/30';
    else if (isCompared) baseClass = 'bg-amber-400 border-amber-300 text-slate-900 scale-105 z-10 shadow-xl shadow-amber-500/40 ring-4 ring-amber-500/20';
    else if (isModified) baseClass = 'bg-emerald-400 border-emerald-300 text-slate-900 shadow-xl shadow-emerald-500/40';

    const size = variant === 'circle' ? 'w-16 h-16' : 'w-16 h-16';

    // Sanitize coordinates to prevent "Infinity" errors
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;

    return (
      <div 
        key={idx}
        className={`absolute flex items-center justify-center transition-all duration-500 border-2 backdrop-blur-sm
          ${variant === 'circle' ? `rounded-full ${size}` : `rounded-2xl ${size}`}
          ${baseClass} cursor-grab active:cursor-grabbing group shadow-lg`}
        style={{ left: safeX, top: safeY, transform: `translate(-50%, -50%)` }}
      >
        <span className="text-base font-bold font-mono drop-shadow-sm">{val}</span>
      </div>
    );
  };

  // Draw arrow between two points
  const renderArrow = (x1: number, y1: number, x2: number, y2: number, key: string, color: string = 'rgba(100, 116, 139, 0.8)') => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const arrowSize = 10;
    
    // Shorten line to not overlap with nodes
    const nodeRadius = 32;
    const startX = x1 + Math.cos(angle) * nodeRadius;
    const startY = y1 + Math.sin(angle) * nodeRadius;
    const endX = x2 - Math.cos(angle) * (nodeRadius + arrowSize);
    const endY = y2 - Math.sin(angle) * (nodeRadius + arrowSize);
    
    return (
      <g key={key}>
        <line 
          x1={startX} y1={startY} x2={endX} y2={endY} 
          stroke={color} 
          strokeWidth="2"
        />
        {/* Arrowhead */}
        <polygon
          points={`${endX},${endY} ${endX - arrowSize * Math.cos(angle - Math.PI/6)},${endY - arrowSize * Math.sin(angle - Math.PI/6)} ${endX - arrowSize * Math.cos(angle + Math.PI/6)},${endY - arrowSize * Math.sin(angle + Math.PI/6)}`}
          fill={color}
        />
      </g>
    );
  };

  // Draw simple line between two points (for graphs)
  const renderLine = (x1: number, y1: number, x2: number, y2: number, key: string, color: string = 'rgba(100, 116, 139, 0.6)') => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const nodeRadius = 32;
    const startX = x1 + Math.cos(angle) * nodeRadius;
    const startY = y1 + Math.sin(angle) * nodeRadius;
    const endX = x2 - Math.cos(angle) * nodeRadius;
    const endY = y2 - Math.sin(angle) * nodeRadius;
    
    return (
      <line 
        key={key}
        x1={startX} y1={startY} x2={endX} y2={endY} 
        stroke={color} 
        strokeWidth="2"
      />
    );
  };

  const renderStructure = () => {
    // Safely convert state to appropriate format
    let data = currentStep.state;
    
    console.log('Raw state data:', data, 'Type:', typeof data);
    console.log('Current step activeElements:', currentStep.activeElements);
    console.log('Current step:', currentStep);
    
    // Handle null or undefined
    if (data === null || data === undefined) {
      data = [];
    }
    
    // If state is a string (JSON string from API), parse it first
    if (typeof data === 'string') {
      // Check if it looks like JSON
      const trimmed = data.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          data = JSON.parse(trimmed);
        } catch (e) {
          console.warn('Failed to parse state JSON string:', trimmed, e);
          // If parsing fails, treat as regular string and split
          if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
            data = trimmed.split('');
          } else {
            data = [trimmed];
          }
        }
      } else {
        // Regular string, split to characters only if not too long
        if (trimmed.length <= 20) {
          data = trimmed.split('');
        } else {
          data = [trimmed];
        }
      }
    }
    
    // Ensure data is an array by wrapping it if necessary
    if (!Array.isArray(data)) {
      if (typeof data === 'object' && data !== null) {
        // Try to extract array from object
        if (data.arr) data = data.arr;
        else if (data.data) data = data.data;
        else if (data.values) data = data.values;
        else if (data.nodes) data = data; // Keep graph object as is
        else data = Object.values(data);
      } else {
        data = [data];
      }
    }
    
    console.log('Converted data:', data);
    
    const struct = metadata.structure;
    const centerX = 400;
    const centerY = 300;
    
    // Normalize structure check - handle string comparison and case variations
    const isLinkedList = struct === DataStructureType.LINKED_LIST || 
                         struct === 'Linked List' || 
                         struct === 'LinkedList' ||
                         struct === 'linked_list' ||
                         struct?.toString().toLowerCase().includes('linked') ||
                         metadata.name?.toLowerCase().includes('linked list');

    // LINKED LIST visualization - horizontal with arrows (like beginners book diagram)
    // Check this FIRST before array since linked lists are also arrays
    if (isLinkedList && Array.isArray(data) && data.length > 0) {
      const nodeWidth = 120;
      const nodeHeight = 50;
      const spacing = 180;
      const startX = -(Math.max(data.length - 1, 0) * spacing / 2);
      
      // Generate mock memory addresses for visualization
      const generateAddress = (idx: number) => {
        const baseAddr = 3200;
        return (baseAddr + idx * 400).toString();
      };
      
      return (
        <div className="relative" style={{ minWidth: data.length * spacing + 200, minHeight: 250 }}>
          {/* Head Pointer Box - positioned above and to the left */}
          <div className="absolute flex flex-col items-center" style={{ left: startX - 80, top: -120 }}>
            <span className="text-sm font-bold text-slate-300 mb-2">Head</span>
            <div className="bg-sky-400 border-2 border-sky-500 px-4 py-2 rounded-md shadow-lg">
              <span className="text-sm font-mono font-bold text-slate-900">{generateAddress(0)}</span>
            </div>
          </div>
          
          {/* Arrow from Head to first node */}
          <svg className="absolute pointer-events-none" style={{ left: startX - 80, top: -60, width: 120, height: 100 }}>
            <path 
              d="M 30 0 L 30 40 Q 30 60 50 60 L 100 60" 
              fill="none" 
              stroke="#38bdf8" 
              strokeWidth="2.5"
            />
            <polygon
              points="105,60 95,54 95,66"
              fill="#38bdf8"
            />
          </svg>
          
          {/* Labels */}
          <div className="absolute text-[10px] text-slate-400 font-medium" style={{ left: startX + 5, top: -50 }}>
            Content
          </div>
          <div className="absolute text-[10px] text-slate-400 font-medium" style={{ left: startX + 55, top: -50 }}>
            Address(Pointer) of the next node
          </div>

          {/* Nodes with arrows between them */}
          {data.map((val: any, idx: number) => {
            const activeElements = Array.isArray(currentStep.activeElements) ? currentStep.activeElements : [];
            const comparedElements = Array.isArray(currentStep.comparedElements) ? currentStep.comparedElements : [];
            const modifiedElements = Array.isArray(currentStep.modifiedElements) ? currentStep.modifiedElements : [];
            
            const isActive = activeElements.includes(idx);
            const isCompared = comparedElements.includes(idx);
            const isModified = modifiedElements.includes(idx);
            
            let borderColor = 'border-amber-500';
            let contentBg = 'bg-amber-300';
            let addressBg = 'bg-amber-200';
            let textColor = 'text-slate-900';
            
            if (isActive) {
              borderColor = 'border-indigo-500';
              contentBg = 'bg-indigo-500';
              addressBg = 'bg-indigo-400';
              textColor = 'text-white';
            } else if (isCompared) {
              borderColor = 'border-orange-500';
              contentBg = 'bg-orange-400';
              addressBg = 'bg-orange-300';
            } else if (isModified) {
              borderColor = 'border-emerald-500';
              contentBg = 'bg-emerald-400';
              addressBg = 'bg-emerald-300';
            }
            
            const nextAddress = idx < data.length - 1 ? generateAddress(idx + 1) : 'null';
            const currentAddress = generateAddress(idx);
            const isLast = idx === data.length - 1;
            const nodeX = startX + idx * spacing;
            
            return (
              <React.Fragment key={idx}>
                {/* The Node */}
                <div 
                  className="absolute flex flex-col items-center"
                  style={{ left: nodeX, top: 0, transform: 'translate(-50%, -50%)' }}
                >
                  {/* Node box with two sections */}
                  <div className={`flex border-2 ${borderColor} shadow-xl transition-all duration-300 ${isActive ? 'scale-110 ring-4 ring-indigo-500/30' : ''}`} style={{ borderRadius: '4px' }}>
                    {/* Content section (value) */}
                    <div className={`w-14 h-14 flex items-center justify-center ${contentBg} ${textColor}`}>
                      <span className="text-xl font-bold font-mono">{val}</span>
                    </div>
                    {/* Divider line */}
                    <div className="w-0.5 bg-slate-600/50" />
                    {/* Address/Pointer section with arrow indicator */}
                    <div className={`w-16 h-14 flex items-center justify-center ${addressBg} ${isLast ? 'text-red-600' : textColor} relative`}>
                      <span className="text-sm font-mono font-bold">{nextAddress}</span>
                    </div>
                  </div>
                  
                  {/* Memory address below the node */}
                  <div className="mt-4 text-base font-mono text-slate-400 font-medium">
                    {currentAddress}
                  </div>
                </div>
                
                {/* Arrow to next node (not for last node) */}
                {!isLast && (
                  <svg 
                    className="absolute pointer-events-none"
                    style={{ 
                      left: nodeX + 45, 
                      top: -7,
                      width: spacing - 90,
                      height: 14
                    }}
                  >
                    <line 
                      x1="0" y1="7" x2={spacing - 105} y2="7" 
                      stroke="#38bdf8" 
                      strokeWidth="3"
                    />
                    <polygon
                      points={`${spacing - 90},7 ${spacing - 102},1 ${spacing - 102},13`}
                      fill="#38bdf8"
                    />
                  </svg>
                )}
              </React.Fragment>
            );
          })}
          
          {/* "Last node of LinkedList Points to null" label */}
          <div 
            className="absolute text-xs text-slate-400 leading-relaxed text-left"
            style={{ 
              left: startX + (data.length - 1) * spacing + 70, 
              top: -50,
              width: '100px'
            }}
          >
            <div>Last node of LinkedList</div>
            <div>Points to null</div>
          </div>
        </div>
      );
    }
    
    // Helper: Check if data appears to be a tree structure
    const isTreeLikeData = (testData: any): boolean => {
      if (!testData) return false;
      
      // Check for explicit tree properties
      if (typeof testData === 'object') {
        // Object with left/right (binary tree)
        if ('left' in testData || 'right' in testData || 'l' in testData || 'r' in testData) return true;
        // Object with children array (n-ary tree)
        if ('children' in testData && Array.isArray(testData.children)) return true;
        // Object with child0, child1, child2 properties (n-ary)
        if (Object.keys(testData).some(k => k.match(/^child\d+$/i))) return true;
      }
      
      // Array representation of tree (level-order or flat)
      if (Array.isArray(testData) && testData.length > 0) {
        // If it's an array of objects with children, it's likely a tree
        return testData.some(item => 
          typeof item === 'object' && item !== null && 
          ('children' in item || 'left' in item || 'right' in item)
        );
      }
      
      return false;
    };
    
    // Check for tree structure (with normalization and better detection)
    const isTreeExplicit = struct === DataStructureType.TREE || 
                           struct === 'Tree' ||
                           struct?.toString().toLowerCase() === 'tree';
    const isTreeByName = metadata.name?.toLowerCase().includes('tree') || 
                         metadata.name?.toLowerCase().includes('binary') ||
                         metadata.name?.toLowerCase().includes('ternary') ||
                         metadata.name?.toLowerCase().includes('n-ary');
    const isTreeByData = isTreeLikeData(data);
    const isTree = isTreeExplicit || isTreeByName || isTreeByData;
                   
    // Check for graph structure (with normalization) - AFTER tree check
    const isGraphExplicit = struct === DataStructureType.GRAPH || 
                            struct === 'Graph' ||
                            struct?.toString().toLowerCase() === 'graph';
    const isGraphByData = !isTree && (typeof data === 'object' && (data.nodes || data.edges));
    const isGraph = isGraphExplicit || (isGraphByData && !isTree);

    // ARRAY or STRING visualization - horizontal blocks (only if not linked list, tree, or graph)
    if (!isLinkedList && !isTree && !isGraph && Array.isArray(data) && data.length > 0) {
      const spacing = 90;
      const arrStartX = -(Math.max(data.length - 1, 0) * spacing / 2);
      
      return (
        <div className="relative">
          {/* Title */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 text-2xl font-black text-slate-300 tracking-wider">
            {struct === DataStructureType.STRING || struct === 'String' ? 'String' : 'Array'}
          </div>
          {data.map((val: any, idx: number) => renderNode(val, idx, arrStartX + idx * spacing, 0, 'box', 'bg-indigo-400/80 border-indigo-500/50 text-white'))}
        </div>
      );
    }

    // TREE visualization - hierarchical layout like the reference image
    if (isTree) {
      // Parse tree data - can be array (level-order) or nested object
      let treeNodes: { id: number; val: any; level: number; x: number; y: number; parentId: number | null; children: number[] }[] = [];
      
      const levelHeight = 90;
      const nodeRadius = 28;
      
      // Helper: Parse object-based tree structure (nested objects with children)
      const parseObjectTree = (node: any, parentIdx: number | null, level: number, nodeId: number): number => {
        let currentId = nodeId;
        
        // Extract node value
        const val = node.val || node.value || node.data || node;
        
        // Get children array from various possible property names
        let children: any[] = [];
        if (Array.isArray(node.children)) children = node.children;
        else if (Array.isArray(node.child)) children = node.child;
        else if (node.left || node.right) {
          if (node.left) children.push(node.left);
          if (node.right) children.push(node.right);
        }
        
        // Create current node
        const currentNodeId = currentId;
        treeNodes.push({
          id: currentNodeId,
          val,
          level,
          x: 0,
          y: level * levelHeight,
          parentId: parentIdx,
          children: []
        });
        
        currentId++;
        
        // Recursively parse children
        const childIds: number[] = [];
        for (const child of children) {
          if (child !== null && child !== undefined) {
            const nextId = parseObjectTree(child, currentNodeId, level + 1, currentId);
            childIds.push(currentId);
            currentId = nextId;
          }
        }
        
        // Update with actual child IDs
        const nodeToUpdate = treeNodes.find(n => n.id === currentNodeId);
        if (nodeToUpdate) {
          nodeToUpdate.children = childIds;
        }
        
        return currentId;
      };
      
      // Detect and parse tree format
      if (!Array.isArray(data) && typeof data === 'object' && data !== null && 
          (data.left || data.right || data.children || data.val || data.value)) {
        // Object-based tree structure
        parseObjectTree(data, null, 0, 0);
      } else if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && 
                 (data[0].children || data[0].left || data[0].right)) {
        // Array of tree nodes with explicit children
        data.forEach((nodeData, idx) => {
          const val = nodeData.val || nodeData.value || nodeData.data || nodeData;
          const children: number[] = [];
          
          if (Array.isArray(nodeData.children)) {
            nodeData.children.forEach((childIdx: number) => {
              if (childIdx < data.length) children.push(childIdx);
            });
          }
          
          treeNodes.push({
            id: idx,
            val,
            level: 0, // Will be recalculated
            x: 0,
            y: 0,
            parentId: null, // Will be determined
            children
          });
        });
        
        // Calculate levels and parent IDs
        const root = treeNodes[0];
        const visited = new Set<number>();
        const queue: { nodeId: number; level: number; parentId: number | null }[] = [{ nodeId: 0, level: 0, parentId: null }];
        
        while (queue.length > 0) {
          const { nodeId, level, parentId } = queue.shift()!;
          if (visited.has(nodeId)) continue;
          visited.add(nodeId);
          
          const node = treeNodes.find(n => n.id === nodeId);
          if (node) {
            node.level = level;
            node.parentId = parentId;
            node.y = level * levelHeight;
            
            for (const childId of node.children) {
              queue.push({ nodeId: childId, level: level + 1, parentId: nodeId });
            }
          }
        }
      } else if (Array.isArray(data)) {
        // Level-order array representation (binary tree)
        data.forEach((val: any, idx: number) => {
          if (val !== null && val !== undefined && val !== 'null') {
            const level = Math.floor(Math.log2(idx + 1));
            const parentIdx = idx === 0 ? null : Math.floor((idx - 1) / 2);
            const leftChild = 2 * idx + 1;
            const rightChild = 2 * idx + 2;
            const children: number[] = [];
            if (leftChild < data.length && data[leftChild] !== null && data[leftChild] !== 'null') children.push(leftChild);
            if (rightChild < data.length && data[rightChild] !== null && data[rightChild] !== 'null') children.push(rightChild);
            
            treeNodes.push({
              id: idx,
              val,
              level,
              x: 0,
              y: level * levelHeight,
              parentId: parentIdx,
              children
            });
          }
        });
      }
      
      // Calculate x positions based on tree structure
      const calculatePositions = () => {
        const levelNodes: Map<number, typeof treeNodes> = new Map();
        
        // Guard: if no nodes, return early
        if (treeNodes.length === 0) {
          return;
        }
        
        // Group nodes by level
        treeNodes.forEach(node => {
          if (!levelNodes.has(node.level)) levelNodes.set(node.level, []);
          levelNodes.get(node.level)!.push(node);
        });
        
        const levelKeys = Array.from(levelNodes.keys());
        if (levelKeys.length === 0) return;
        
        const maxLevel = Math.max(...levelKeys);
        
        // Calculate max branching factor (children per node)
        const maxChildren = Math.max(...treeNodes.map(n => n.children.length), 2);
        const baseSpacing = Math.max(70, 100 / maxChildren); // Adjust spacing based on arity
        
        // Position nodes level by level, starting from bottom
        for (let level = maxLevel; level >= 0; level--) {
          const nodes = levelNodes.get(level) || [];
          
          if (level === maxLevel) {
            // Bottom level - space evenly
            const totalWidth = (nodes.length - 1) * baseSpacing;
            nodes.forEach((node, i) => {
              node.x = -totalWidth / 2 + i * baseSpacing;
            });
          } else {
            // Position parent centered above children
            nodes.forEach(node => {
              const childNodes = treeNodes.filter(n => node.children.includes(n.id));
              if (childNodes.length > 0) {
                const childXSum = childNodes.reduce((sum, c) => sum + c.x, 0);
                node.x = childXSum / childNodes.length;
              } else {
                // Leaf node - use level-based positioning
                const levelNodesList = levelNodes.get(node.level) || [];
                const idx = levelNodesList.indexOf(node);
                const levelSpacing = baseSpacing * Math.pow(maxChildren, maxLevel - level);
                const totalWidth = (levelNodesList.length - 1) * levelSpacing;
                node.x = -totalWidth / 2 + idx * levelSpacing;
              }
            });
          }
        }
        
        // Resolve overlaps
        for (let level = 0; level <= maxLevel; level++) {
          const nodes = (levelNodes.get(level) || []).sort((a, b) => a.x - b.x);
          for (let i = 1; i < nodes.length; i++) {
            const minGap = baseSpacing * 0.8;
            if (nodes[i].x - nodes[i-1].x < minGap) {
              const shift = (minGap - (nodes[i].x - nodes[i-1].x)) / 2;
              nodes[i-1].x -= shift;
              nodes[i].x += shift;
            }
          }
        }
        
        // Center the tree
        const allX = treeNodes.map(n => n.x);
        if (allX.length === 0) return;
        
        const minX = Math.min(...allX);
        const maxX = Math.max(...allX);
        const offsetX = -(minX + maxX) / 2;
        treeNodes.forEach(n => n.x += offsetX);
        
        // Offset Y to center vertically
        const allY = treeNodes.map(n => n.y);
        if (allY.length === 0) return;
        
        const minY = Math.min(...allY);
        const maxY = Math.max(...allY);
        const offsetY = -(minY + maxY) / 2;
        treeNodes.forEach(n => n.y += offsetY);
      };
      
      calculatePositions();
      
      // Guard: if no nodes were parsed, show placeholder
      if (treeNodes.length === 0) {
        return (
          <div className="relative flex items-center justify-center w-full h-full">
            <div className="text-slate-400 text-lg font-semibold">No tree data to visualize</div>
          </div>
        );
      }
      
      // Get the path from root to active node
      const getPathToNode = (nodeId: number): number[] => {
        const path: number[] = [];
        let current: number | null = nodeId;
        while (current !== null) {
          path.unshift(current);
          const node = treeNodes.find(n => n.id === current);
          current = node?.parentId ?? null;
        }
        return path;
      };
      
      const activeNodeId = currentStep.activeElements?.[0] ?? null;
      const pathToActive = activeNodeId !== null ? getPathToNode(activeNodeId) : [];
      
      // Render tree lines (simple lines, not arrows - like in the image)
      const renderTreeLine = (x1: number, y1: number, x2: number, y2: number, key: string, isOnPath: boolean = false) => {
        return (
          <line 
            key={key}
            x1={x1} y1={y1 + nodeRadius} 
            x2={x2} y2={y2 - nodeRadius} 
            stroke={isOnPath ? 'rgba(99, 102, 241, 1)' : 'rgba(134, 239, 172, 0.8)'} 
            strokeWidth={isOnPath ? '3.5' : '2.5'}
            opacity={isOnPath ? 1 : 0.8}
          />
        );
      };
      
      // Determine tree type based on maximum children per node
      const maxChildrenCount = Math.max(...treeNodes.map(n => n.children.length), 1);
      let treeTypeName = 'Tree';
      if (maxChildrenCount === 2) treeTypeName = 'Binary Tree';
      else if (maxChildrenCount === 3) treeTypeName = 'Ternary Tree';
      else if (maxChildrenCount > 3) treeTypeName = `${maxChildrenCount}-ary Tree`;
      
      // Use metadata name if available
      if (metadata.name) {
        const nameLower = metadata.name.toLowerCase();
        if (nameLower.includes('binary')) treeTypeName = 'Binary Tree';
        else if (nameLower.includes('ternary')) treeTypeName = 'Ternary Tree';
        else if (nameLower.includes('n-ary') || nameLower.includes('nary')) treeTypeName = `N-ary Tree`;
      }
      
      return (
        <div className="relative">
          {/* Title */}
          <div className="absolute left-1/2 -translate-x-1/2 text-2xl font-black text-slate-300 tracking-wider" style={{ top: treeNodes.length > 0 ? Math.min(...treeNodes.map(n => n.y)) - 60 : -60 }}>
            {treeTypeName}
          </div>
          
          {/* Lines SVG */}
          <svg className="absolute pointer-events-none" style={{ left: -centerX, top: -centerY, width: centerX * 2, height: centerY * 2 }}>
            {treeNodes.map(node => {
              return node.children.map(childId => {
                const child = treeNodes.find(n => n.id === childId);
                if (child) {
                  const isNodeOnPath = pathToActive.includes(node.id);
                  const isChildOnPath = pathToActive.includes(childId);
                  const lineIsOnPath = isNodeOnPath && isChildOnPath;
                  
                  return renderTreeLine(
                    centerX + node.x, 
                    centerY + node.y, 
                    centerX + child.x, 
                    centerY + child.y, 
                    `tree-line-${node.id}-${childId}`,
                    lineIsOnPath
                  );
                }
                return null;
              });
            })}
          </svg>
          
          {/* Nodes */}
          {treeNodes.map(node => {
            const activeElements = Array.isArray(currentStep.activeElements) ? currentStep.activeElements : [];
            const comparedElements = Array.isArray(currentStep.comparedElements) ? currentStep.comparedElements : [];
            const modifiedElements = Array.isArray(currentStep.modifiedElements) ? currentStep.modifiedElements : [];
            
            const isActive = activeElements.includes(node.id);
            const isCompared = comparedElements.includes(node.id);
            const isModified = modifiedElements.includes(node.id);
            const isOnPath = pathToActive.includes(node.id) && !isActive;
            
            // Keep original colors
            let nodeColor = 'bg-green-200 border-green-400 text-green-800';
            if (isCompared) nodeColor = 'bg-amber-400 border-amber-300 text-slate-900';
            else if (isModified) nodeColor = 'bg-emerald-400 border-emerald-300 text-slate-900';
            else if (isActive) nodeColor = 'bg-indigo-500 border-indigo-400 text-white';
            
            return (
              <div key={`tree-node-${node.id}`}>
                {/* Glow effect for active node */}
                {isActive && (
                  <div 
                    className="absolute rounded-full pointer-events-none"
                    style={{ 
                      left: node.x, 
                      top: node.y, 
                      transform: 'translate(-50%, -50%)',
                      width: '90px',
                      height: '90px',
                      background: 'radial-gradient(circle, rgba(99, 102, 241, 0.5) 0%, transparent 70%)',
                      filter: 'blur(10px)',
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                    }}
                  />
                )}
                
                {/* Highlight effect for path nodes */}
                {isOnPath && (
                  <div 
                    className="absolute rounded-full pointer-events-none"
                    style={{ 
                      left: node.x, 
                      top: node.y, 
                      transform: 'translate(-50%, -50%)',
                      width: '70px',
                      height: '70px',
                      background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
                      filter: 'blur(6px)'
                    }}
                  />
                )}
                
                {/* Node circle */}
                <div 
                  className={`absolute flex items-center justify-center transition-all duration-300 border-2 rounded-full w-14 h-14 font-bold text-base shadow-lg ${nodeColor} ${isActive ? 'ring-4 ring-indigo-400/50 scale-110' : isOnPath ? 'ring-2 ring-indigo-300/40 scale-105' : ''}`}
                  style={{ 
                    left: node.x, 
                    top: node.y, 
                    transform: `translate(-50%, -50%)`,
                    zIndex: isActive ? 20 : isOnPath ? 10 : 5,
                    boxShadow: isActive ? '0 0 25px rgba(99, 102, 241, 0.6)' : isOnPath ? '0 0 12px rgba(99, 102, 241, 0.3)' : 'none'
                  }}
                >
                  {node.val}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // GRAPH visualization - circular layout with connecting lines
    if (isGraph) {
      let graphData = data;
      
      // Parse state if it's a string
      if (typeof graphData === 'string') {
        try {
          graphData = JSON.parse(graphData);
        } catch (e) {
          console.warn('Failed to parse graph state:', graphData);
          graphData = { nodes: [], edges: [] };
        }
      }

      const nodes = (graphData?.nodes || (Array.isArray(graphData) ? graphData : [])).map((n: any) => {
        if (typeof n === 'object') return { id: String(n.id), label: String(n.label || n.id) };
        return { id: String(n), label: String(n) };
      });
      
      const edges = graphData?.edges || [];
      const nodeCount = nodes.length;
      const radius = Math.max(120, nodeCount * 35);
      
      const getGraphCoords = (idx: number, total: number) => {
        const angle = (2 * Math.PI * idx / total) - Math.PI / 2;
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        };
      };

      console.log('Graph Data:', { nodes, edges, graphData });

      return (
        <div className="relative">
          {/* Title */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 text-2xl font-black text-slate-300 tracking-wider" style={{ top: -radius - 60 }}>
            {metadata.graphType || 'Graph'}
          </div>
          
          {/* Edges SVG */}
          <svg className="absolute pointer-events-none" style={{ left: -centerX, top: -centerY, width: centerX * 2, height: centerY * 2 }}>
            <defs>
              <marker id="arrowhead-graph" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="rgba(129, 140, 248, 0.8)" />
              </marker>
            </defs>
            
            {edges && edges.map((edge: any, idx: number) => {
              let fromIdx = -1, toIdx = -1;
              
              // Handle various edge formats
              if (typeof edge.source !== 'undefined') {
                fromIdx = typeof edge.source === 'number' ? edge.source : nodes.findIndex((n: any) => n.id === String(edge.source));
              } else if (typeof edge.from !== 'undefined') {
                fromIdx = typeof edge.from === 'number' ? edge.from : nodes.findIndex((n: any) => n.id === String(edge.from));
              }
              
              if (typeof edge.target !== 'undefined') {
                toIdx = typeof edge.target === 'number' ? edge.target : nodes.findIndex((n: any) => n.id === String(edge.target));
              } else if (typeof edge.to !== 'undefined') {
                toIdx = typeof edge.to === 'number' ? edge.to : nodes.findIndex((n: any) => n.id === String(edge.to));
              }
              
              if (fromIdx >= 0 && toIdx >= 0) {
                const start = getGraphCoords(fromIdx, nodes.length);
                const end = getGraphCoords(toIdx, nodes.length);
                const isActive = currentStep.activeElements?.some((el: any) => 
                  String(el).includes(String(edge.source)) || String(el).includes(String(edge.target))
                );
                
                return (
                  <g key={`edge-${idx}`}>
                    <line
                      x1={centerX + start.x}
                      y1={centerY + start.y}
                      x2={centerX + end.x}
                      y2={centerY + end.y}
                      stroke={isActive ? 'rgba(99, 102, 241, 0.9)' : 'rgba(129, 140, 248, 0.6)'}
                      strokeWidth={isActive ? '3' : '2'}
                      markerEnd={metadata.graphType?.includes('Directed') || metadata.graphType?.includes('DAG') ? 'url(#arrowhead-graph)' : 'none'}
                    />
                    {edge.weight && (
                      <text
                        x={(centerX + start.x + centerX + end.x) / 2}
                        y={(centerY + start.y + centerY + end.y) / 2}
                        fontSize="12"
                        fill="rgba(148, 163, 247, 0.9)"
                        textAnchor="middle"
                        fontWeight="bold"
                      >
                        {edge.weight}
                      </text>
                    )}
                  </g>
                );
              }
              return null;
            })}
            
            {/* If no edges, auto-generate connections for visualization */}
            {(!edges || edges.length === 0) && nodes.length > 1 && nodes.map((_: any, idx: number) => {
              const connections = [];
              if (idx < nodes.length - 1) {
                const start = getGraphCoords(idx, nodes.length);
                const end = getGraphCoords(idx + 1, nodes.length);
                connections.push(
                  <line
                    key={`auto-edge-${idx}`}
                    x1={centerX + start.x}
                    y1={centerY + start.y}
                    x2={centerX + end.x}
                    y2={centerY + end.y}
                    stroke="rgba(167, 139, 250, 0.4)"
                    strokeWidth="2"
                  />
                );
              }
              return connections;
            })}
          </svg>
          
          {/* Nodes */}
          {nodes.map((node: any, idx: number) => {
            const coords = getGraphCoords(idx, nodes.length);
            const isActive = currentStep.activeElements?.includes(node.id);
            const isCompared = currentStep.comparedElements?.includes(node.id);
            const isModified = currentStep.modifiedElements?.includes(node.id);
            
            let nodeColor = 'bg-slate-900/60 border-slate-700/50 text-slate-300';
            if (isActive) nodeColor = 'bg-indigo-500/90 border-indigo-400 text-white scale-125 z-20 shadow-2xl shadow-indigo-500/40 ring-4 ring-indigo-500/20';
            else if (isCompared) nodeColor = 'bg-amber-500/90 border-amber-300 text-white scale-110 shadow-xl shadow-amber-500/40';
            else if (isModified) nodeColor = 'bg-rose-500/90 border-rose-300 text-white shadow-xl shadow-rose-500/40';
            
            return (
              <div
                key={`graph-node-${idx}`}
                className={`absolute flex items-center justify-center transition-all duration-300 border rounded-full w-16 h-16 ${nodeColor} shadow-lg font-bold text-lg cursor-grab active:cursor-grabbing`}
                style={{
                  left: coords.x,
                  top: coords.y,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                {node.label || node.id}
              </div>
            );
          })}
        </div>
      );
    }

    // Default fallback - render as array if data is valid
    if (Array.isArray(data) && data.length > 0) {
      return (
        <div className="relative">
          {data.map((val: any, idx: number) => renderNode(val, idx, idx * 80 - (data.length * 40), 0))}
        </div>
      );
    }
    
    // No valid data to render
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 font-mono text-sm">No visualization data available</p>
          <p className="text-slate-500 font-mono text-xs mt-2">Expected array structure with data</p>
        </div>
      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center relative bg-gradient-to-b from-slate-900/20 to-slate-800/20 cursor-crosshair transition-colors duration-500 z-10"
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      <div 
        className="relative transition-transform duration-200"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      >
        {renderStructure()}
      </div>
      
      {/* Subtle animated grid background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.06]">
        <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(circle, rgba(99, 102, 241, 0.5) 0.5px, transparent 0.5px)', backgroundSize: '40px 40px' }}></div>
      </div>
    </div>
  );
};

// Hologram Dashboard Overlay Component (Inline)
interface HologramDashboardOverlayProps {
  metadata: AlgorithmMetadata | null;
  currentStepIndex: number;
  isLoading?: boolean;
}

const HologramDashboardOverlay: React.FC<HologramDashboardOverlayProps> = ({ metadata, currentStepIndex, isLoading }) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const name = metadata?.name || (isLoading ? "Syncing..." : "Offline");
  const type = metadata?.type || "Waiting for signal";

  return (
    <div className={`bg-slate-900/60 backdrop-blur-2xl border border-slate-700/50 rounded-3xl shadow-2xl transition-all duration-500 ease-out overflow-hidden ${isMinimized ? 'w-14 h-14' : 'w-72'}`}>
      <div className={`flex items-center justify-between p-4 ${!isMinimized ? 'border-b border-slate-800/50' : ''}`}>
        {!isMinimized && (
          <div className="flex flex-col overflow-hidden pl-1">
            <h2 className="text-white text-xs font-black truncate uppercase tracking-tight">{name}</h2>
            <span className="text-[9px] text-indigo-400 uppercase tracking-[0.2em] font-bold mt-0.5">{type}</span>
          </div>
        )}
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          className={`flex items-center justify-center transition-all ${isMinimized ? 'w-full h-full' : 'p-2 hover:bg-slate-800 rounded-xl'}`}
        >
          {isMinimized ? (
            <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ) : (
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M18 12H6" /></svg>
          )}
        </button>
      </div>

      {!isMinimized && (
        <div className="p-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/40">
              <span className="block text-[8px] text-slate-500 font-black uppercase mb-1 tracking-widest">Temporal</span>
              <span className="text-[10px] text-slate-200 font-mono font-black">{metadata?.timeComplexity || "---"}</span>
            </div>
            <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/40">
              <span className="block text-[8px] text-slate-500 font-black uppercase mb-1 tracking-widest">Spatial</span>
              <span className="text-[10px] text-slate-200 font-mono font-black">{metadata?.spaceComplexity || "---"}</span>
            </div>
          </div>

          <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/40">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Trace State</span>
                <span className="text-[9px] text-indigo-400 font-mono font-bold">RAW_DUMP</span>
             </div>
             <p className="text-[10px] font-mono text-slate-400 break-all leading-tight opacity-80">
               {metadata ? JSON.stringify(metadata.steps[currentStepIndex]?.state || {}).slice(0, 80) + "..." : "System dormant"}
             </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Hologram Timeline Controls Component (Inline)
interface HologramTimelineControlsProps {
  totalSteps: number;
  currentStep: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (step: number) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

const HologramTimelineControls: React.FC<HologramTimelineControlsProps> = ({
  totalSteps,
  currentStep,
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  speed,
  onSpeedChange,
  isMinimized,
  onToggleMinimize
}) => {
  const progress = Math.round((currentStep / Math.max(1, totalSteps - 1)) * 100);

  if (isMinimized) {
    return (
      <div className="flex items-center justify-center w-full group relative">
        <button 
          onClick={onPlayPause}
          className="w-10 h-10 bg-indigo-500 rounded-2xl flex items-center justify-center text-white hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/30 active:scale-95"
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <button 
          onClick={onToggleMinimize}
          className="absolute -top-1 -right-1 w-5 h-5 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 8h16M4 16h16" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex items-center gap-6 p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-1">
        <button 
          onClick={onPrev}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <button 
          onClick={onPlayPause}
          className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center text-white hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/30 active:scale-95"
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        <button 
          onClick={onNext}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-black uppercase tracking-widest px-1">
          <span>{totalSteps ? `Step ${currentStep + 1} / ${totalSteps}` : 'No active trace'}</span>
          <span>{progress}%</span>
        </div>
        <div className="relative h-1.5 group">
          <input 
            type="range"
            min={0}
            max={totalSteps ? totalSteps - 1 : 0}
            value={currentStep}
            onChange={(e) => onSeek(parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="w-full h-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.4)]"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Playback</span>
          <select 
            value={speed}
            onChange={(e) => onSpeedChange(parseInt(e.target.value))}
            className="bg-transparent text-slate-200 text-xs font-bold outline-none cursor-pointer hover:text-indigo-400 transition-colors"
          >
            <option value={2000}>0.5x</option>
            <option value={1000}>1.0x</option>
            <option value={500}>2.0x</option>
            <option value={250}>4.0x</option>
          </select>
        </div>
        
        <button 
          onClick={onToggleMinimize}
          className="p-2 text-slate-600 hover:text-slate-400 rounded-xl transition-all border border-slate-800 hover:bg-slate-800"
          title="Minimize Scrubber"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

import { simulateCode } from './services/geminiService';

// Code templates for AlgoVision Pro Classroom
const CODE_TEMPLATES: Record<AlgorithmType, string> = {
  [AlgorithmType.ARRAY]: `function selectionSort(nums) {
  // Grab and Swap blocks with your hands!
  for (let i = 0; i < nums.length; i++) {
    let minIdx = i;
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[j] < nums[minIdx]) minIdx = j;
    }
    [nums[i], nums[minIdx]] = [nums[minIdx], nums[i]];
  }
  return nums;
}`,
  [AlgorithmType.STRINGS]: `function reverse(s) {
  let chars = s.split('');
  let left = 0, right = chars.length - 1;
  while(left < right) {
    [chars[left], chars[right]] = [chars[right], chars[left]];
    left++; right--;
  }
  return chars.join('');
}`,
  [AlgorithmType.LINKED_LIST]: `function reverseList(head) {
  let prev = null, curr = head;
  while(curr) {
    let next = curr.next;
    curr.next = prev;
    prev = curr;
    curr = next;
  }
  return prev;
}`,
  [AlgorithmType.BINARY_TREE]: `function invert(root) {
  if (!root) return null;
  [root.left, root.right] = [root.right, root.left];
  invert(root.left);
  invert(root.right);
  return root;
}`,
  [AlgorithmType.DP]: `function fib(n) {
  let dp = Array(n+1).fill(0);
  dp[1] = 1;
  for(let i=2; i<=n; i++) dp[i] = dp[i-1] + dp[i-2];
  return dp[n];
}`,
  [AlgorithmType.BITS]: `function countBits(n) {
  let count = 0;
  while(n > 0) { count += n & 1; n >>= 1; }
  return count;
}`,
  [AlgorithmType.GRAPH]: `function dfs(node, visited) {
  visited.add(node);
  for(let neighbor of node.neighbors) {
    if(!visited.has(neighbor)) dfs(neighbor, visited);
  }
}`
};

const INPUT_TEMPLATES: Record<AlgorithmType, string> = {
  [AlgorithmType.ARRAY]: '[12, 5, 8, 2, 9, 4, 1]',
  [AlgorithmType.STRINGS]: '"ALGO_VIS"',
  [AlgorithmType.LINKED_LIST]: '{"val": 1, "next": {"val": 2}}',
  [AlgorithmType.BINARY_TREE]: '{"val": 10, "left": {"val": 5}}',
  [AlgorithmType.DP]: '8',
  [AlgorithmType.BITS]: '255',
  [AlgorithmType.GRAPH]: '{"nodes": [{"id": "A"}], "edges": []}'
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.IDLE);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>({
    domain: '',
    companyType: '',
    targetCompany: '',
    experienceLevel: 'Junior'
  });
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'connected' | 'error' | 'disconnected'>('disconnected');
  const [userCode, setUserCode] = useState("function bubbleSort(arr) {\n  for (let i = 0; i < arr.length; i++) {\n    for (let j = 0; j < arr.length - i - 1; j++) {\n      if (arr[j] > arr[j + 1]) {\n        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];\n      }\n    }\n  }\n  return arr;\n}");
  const [codeAnalysis, setCodeAnalysis] = useState<{steps: string[], bugs: string[], complexity: string} | null>(null);
  const [comprehensiveCodeFeedback, setComprehensiveCodeFeedback] = useState<CodeFeedback | null>(null);
  const [isAnalyzingCode, setIsAnalyzingCode] = useState(false);
  const [askedQuestions, setAskedQuestions] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [answersCount, setAnswersCount] = useState(0);
  const [conversationTranscript, setConversationTranscript] = useState<{role: string, text: string}[]>([]);
  const [richFeedback, setRichFeedback] = useState<FeedbackData | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [resumeText, setResumeText] = useState<string>('');
  const [resumeAnalysis, setResumeAnalysis] = useState<any>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [hrFeedback, setHrFeedback] = useState<FeedbackData | null>(null);
  const [hrTranscript, setHrTranscript] = useState<{role: string, text: string}[]>([]);
  const [hrAnswersCount, setHrAnswersCount] = useState(0);
  const [showHrResumeModal, setShowHrResumeModal] = useState(false);
  const [hrResumeUploading, setHrResumeUploading] = useState(false);
  const [isGeneratingHRFeedback, setIsGeneratingHRFeedback] = useState(false);
  
  // Teaching Specific States (Old)
  const [visualState, setVisualState] = useState<VisualState>({
    type: 'ARRAY',
    elements: [
      { id: '1', value: 15 }, { id: '2', value: 42 }, { id: '3', value: 7 }, { id: '4', value: 23 }, { id: '5', value: 9 }
    ]
  });
  const [isEditorMinimized, setIsEditorMinimized] = useState(false);
  const [isBroadcastMode, setIsBroadcastMode] = useState(false);

  // Hologram Algorithm Engine States
  const [hologramCode, setHologramCode] = useState(`function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;
  while (left <= right) {
    let mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}`);
  const [hologramInputData, setHologramInputData] = useState("arr: [1, 3, 5, 7, 9, 11, 13, 15], target: 7");
  const [algoMetadata, setAlgoMetadata] = useState<AlgorithmMetadata | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isHologramPlaying, setIsHologramPlaying] = useState(false);
  const [isHologramLoading, setIsHologramLoading] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const [isTimelineMinimized, setIsTimelineMinimized] = useState(true);
  const hologramTimerRef = useRef<any>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const activeSessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputNodeRef.current = audioContextRef.current.createGain();
      outputNodeRef.current.connect(audioContextRef.current.destination);
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const stopAllAudio = () => {
    activeSourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  // Hologram Algorithm Engine: Analyze code
  const handleHologramAnalyze = async () => {
    setIsHologramLoading(true);
    
    try {
      // analyzeAlgorithm already has built-in retry logic with exponential backoff
      const result = await analyzeAlgorithm(hologramCode, hologramInputData);
      setAlgoMetadata(result);
      setCurrentStepIndex(0);
      setIsHologramPlaying(true); // Auto-start playback after analysis
    } catch (error) {
      console.error("Analysis failed:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg.includes('503') || errorMsg.includes('overloaded') || errorMsg.includes('UNAVAILABLE')) {
        alert(`API Service Temporarily Unavailable\n\nThe AI service is overloaded. Please wait a moment and try again.`);
      } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        alert(`Rate Limit Exceeded\n\nPlease wait a few moments before trying again.`);
      } else {
        alert(`Analysis failed: ${errorMsg}\n\nPlease check your code and input, then try again.`);
      }
    } finally {
      setIsHologramLoading(false);
    }
  };

  const hologramNextStep = useCallback(() => {
    if (!algoMetadata) return;
    setCurrentStepIndex((prev) => (prev < algoMetadata.steps.length - 1 ? prev + 1 : prev));
  }, [algoMetadata]);

  const hologramPrevStep = useCallback(() => {
    setCurrentStepIndex((prev) => (prev > 0 ? prev - 1 : 0));
  }, []);

  // Hologram Algorithm Engine: Animation playback
  useEffect(() => {
    if (isHologramPlaying && algoMetadata) {
      hologramTimerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev < algoMetadata.steps.length - 1) {
            return prev + 1;
          } else {
            setIsHologramPlaying(false);
            return prev;
          }
        });
      }, playbackSpeed);
    } else {
      if (hologramTimerRef.current) clearInterval(hologramTimerRef.current);
    }
    return () => {
      if (hologramTimerRef.current) clearInterval(hologramTimerRef.current);
    };
  }, [isHologramPlaying, algoMetadata, playbackSpeed]);

  const currentHologramStep = algoMetadata?.steps[currentStepIndex] || null;

  // Stop camera when leaving teaching mode
  useEffect(() => {
    return () => {
      if (mode !== AppMode.TEACHING_LIVE) {
        navigator.mediaDevices.enumerateDevices().then(() => {
          // Trigger camera stream cleanup
          if (navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia({ video: true })
              .then(stream => {
                stream.getTracks().forEach(track => track.stop());
              })
              .catch(() => {});
          }
        });
      }
    };
  }, [mode]);

  const cleanupSession = async () => {
    stopAllAudio();
    if (micProcessorRef.current) {
      micProcessorRef.current.onaudioprocess = null;
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }

    if (activeSessionRef.current) {
      try {
        // Clear code snapshot interval if it exists
        if ((window as any).codeSnapshotInterval) {
          window.clearInterval((window as any).codeSnapshotInterval);
        }
        if ((window as any).cameraSnapshotInterval) {
          window.clearInterval((window as any).cameraSnapshotInterval);
        }
        await activeSessionRef.current.close();
      } catch (e) {
        console.warn("Error closing session:", e);
      }
      activeSessionRef.current = null;
    }
    setSessionStatus('disconnected');
    setCurrentQuestion(''); // Reset current question on session cleanup
  };

  const setupMicrophone = async (sessionPromise: Promise<any>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      micProcessorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = createPcmBlob(inputData);
        sessionPromise.then(session => {
          if (session) {
            session.sendRealtimeInput({ 
              media: { data: pcmData, mimeType: 'audio/pcm;rate=16000' } 
            });
          }
        }).catch(() => {});
      };
      
      source.connect(processor);
      processor.connect(ctx.destination);

      // Start Camera
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        cameraStreamRef.current = camStream;
        if (videoRef.current) {
          videoRef.current.srcObject = camStream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (camErr) {
        console.warn("Camera setup failed:", camErr);
      }
    } catch (err) {
      console.error("Media setup failed:", err);
    }
  };

  const sendCameraFrame = useCallback(() => {
    if (!activeSessionRef.current || !videoRef.current || !canvasRef.current || mode !== AppMode.INTERVIEW_LIVE) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
             const base64 = (reader.result as string).split(',')[1];
             activeSessionRef.current?.sendRealtimeInput({
               media: { data: base64, mimeType: 'image/jpeg' }
             });
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.6);
    }
  }, [mode]);

  const startSession = async (config: InterviewConfig, isTeaching: boolean = false) => {
    await cleanupSession();
    setConversationTranscript([]);
    setAskedQuestions([]);
    setCurrentQuestion('');
    setAnswersCount(0);
    setRichFeedback(null);
    setCodeAnalysis(null);
    setComprehensiveCodeFeedback(null);

    if (isTeaching) {
      setSessionStatus('connected');
      return;
    }

    initAudio();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `You are an elite Senior Staff Engineer at ${config.targetCompany || 'a world-class tech firm'}. 
    Role: ${config.domain}. Level: ${config.experienceLevel}.
    
    PERSONALITY: You are a supportive but rigorous technical interviewer. You want the candidate to succeed, but you will not lower the bar. Be conversational, clear, and professional.
    
    CRITICAL PROTOCOL - YOU MUST FOLLOW THIS SEQUENCE:
    
    PHASE 1: THEORETICAL FOUNDATIONS (Questions 1, 2, 3)
    - Ask 3 distinct questions about system design, language concepts, or architecture.
    - Do not ask for code yet.
    
    PHASE 2: CODING & IMPLEMENTATION (Questions 4, 5)
    - Question 4 MUST be a coding task. Say: "For our fourth question, let's look at some code. I'd like you to implement..."
    - Question 5 MUST be a coding task or complexity analysis.
    
    RULES:
    - Keep track of the question count yourself.
    - If the candidate's answer is good, acknowledge it and move immediately to the next number.
    - If the candidate's answer is WRONG: State "This is incorrect with respect to the question." Briefly explain the correct approach, then IMMEDIATELY move to the next question. Do not ask them to retry.
    - After Question 5 is answered, say exactly: "Thank you. We have concluded the technical evaluation. Please select 'End Audit' to generate your final performance dossier."
    - Do not end before Question 5. Do not ask more than 5 questions.
    `;

    try {
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setSessionStatus('connected');
            setupMicrophone(sessionPromise);
            
            // Send code snapshots periodically during interview
            const codeInterval = window.setInterval(() => {
              sendCodeSnapshot();
            }, 8000);
            (window as any).codeSnapshotInterval = codeInterval;

            // Send camera frames periodically
            const camInterval = window.setInterval(() => {
              sendCameraFrame();
            }, 2000);
            (window as any).cameraSnapshotInterval = camInterval;
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current && outputNodeRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioData = decodeBase64(base64Audio);
              const buffer = await decodeAudioData(audioData, ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputNodeRef.current);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSourcesRef.current.add(source);
              source.onended = () => activeSourcesRef.current.delete(source);
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              setConversationTranscript(prev => [...prev, {role: 'Interviewer', text}]);
              
              const lowercaseText = text.toLowerCase();
              if ((lowercaseText.includes("?") || lowercaseText.includes("question") || lowercaseText.includes("challenge")) && text.length > 20) {
                 // Track the current question being asked
                 setCurrentQuestion(text.trim());
                 
                 setAskedQuestions(prev => {
                   const isNew = !prev.some(q => text.substring(0, 20) === q.substring(0, 20));
                   if (isNew && prev.length < 5) return [...prev, text.trim()];
                   return prev;
                 });
              }
            } else if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setConversationTranscript(prev => [...prev, {role: 'Candidate', text}]);
              
              if (text.trim().length > 0) {
                 setAnswersCount(prev => Math.min(prev + 1, 5));
              }
            }
          },
          onerror: (e) => {
            console.error("Session Error:", e);
            setSessionStatus('error');
          },
          onclose: (e) => {
            console.warn("Session Closed:", e);
            setSessionStatus('disconnected');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
      });
      activeSessionRef.current = await sessionPromise;
    } catch (e) {
      console.error("Initiate Audit Failed:", e);
      setSessionStatus('error');
    }
  };

  const generateHonestFeedback = async () => {
    if (conversationTranscript.length === 0) {
      setMode(AppMode.IDLE);
      return;
    }

    setIsGeneratingFeedback(true);
    setMode(AppMode.INTERVIEW_FEEDBACK);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const transcriptString = conversationTranscript.map(t => `${t.role}: ${t.text}`).join('\n');
    
    const prompt = `You are a Senior Hiring Committee member and Professional Communication Coach. Analyze this interview/presentation transcript with comprehensive speaker performance evaluation.
    
    COMPREHENSIVE ANALYSIS FRAMEWORK:
    
    1. TECHNICAL COMPETENCE:
       - Evaluate depth of domain knowledge
       - Assess problem-solving approach
       - Verify accuracy of statements
    
    2. SPEECH DELIVERY ANALYSIS (MANDATORY - Provide detailed analysis for each):
       - speechPaceAnalysis: Analyze speed consistency (words per minute estimate), clarity, pauses, whether pace matches topic complexity. Mention if too fast/slow. Give specific examples from transcript.
       - fillerWordsAnalysis: Count and list instances of "um", "uh", "like", "you know", "so", "actually". Provide frequency estimate (e.g., "approximately 8 filler words detected"). Give specific reduction strategies.
       - Linguistic Fluency: Grammar, vocabulary richness, articulation quality
    
    3. PROFESSIONAL PRESENCE (MANDATORY - Provide detailed analysis for each):
       - attireAnalysis: Based on audio cues and context, assess professionalism. Comment on appropriateness for ${interviewConfig.experienceLevel} level at ${interviewConfig.targetCompany}. Provide recommendations.
       - eyeContactAnalysis: Infer engagement level from voice confidence, pauses, and response patterns. Assess consistency and confidence indicators. Provide improvement tips.
       - facialExpressionsAnalysis: Infer from voice tone, enthusiasm, and emotional inflection. Assess emotional alignment with topic, confidence display, naturalness. Suggest improvements.
       - bodyPostureAnalysis: Infer from voice projection, breathing patterns, and energy level. Assess physical presence and confidence signals. Provide posture recommendations.
       - handGesturesAnalysis: Infer from speech rhythm and explanation clarity. Assess if explanations suggest effective gesturing or overuse/underuse. Provide guidance on natural gesture flow.
    
    4. COMMUNICATION EFFECTIVENESS:
       - overallCommunicationScore: A numerical score (0-100) representing total communication effectiveness
       - keyImprovements: Array of 3-5 most critical improvements needed (be specific and actionable)
       - practiceRecommendations: Array of 3-5 specific practice exercises or drills for future presentations
       - Message clarity and structure
       - Audience engagement techniques
       - Response coherence and organization
    
    Context:
    - Domain: ${interviewConfig.domain}
    - Company: ${interviewConfig.targetCompany}
    - Level: ${interviewConfig.experienceLevel}

    Transcript:
    ${transcriptString}
    
    CRITICAL REQUIREMENTS:
    - You MUST populate ALL fields in the JSON schema
    - Provide detailed, specific feedback with examples from the transcript
    - For each analysis field, write 2-4 sentences minimum
    - Include specific strengths AND weaknesses
    - Give actionable, concrete improvement suggestions
    - Base visual/physical assessments on voice and speech patterns when video isn't available
    
    MANDATORY JSON FIELDS TO POPULATE:
    - overallScore, communication, technical, fluency, postureScore (numeric scores)
    - speechAnalysis, postureAnalysis (general summaries)
    - speechPaceAnalysis, fillerWordsAnalysis, attireAnalysis, eyeContactAnalysis, facialExpressionsAnalysis, bodyPostureAnalysis, handGesturesAnalysis (detailed analyses)
    - improvementSuggestions (array of strings)
    - keyImprovements (array of 3-5 critical improvements)
    - practiceRecommendations (array of 3-5 specific practice exercises)
    - overallCommunicationScore (0-100)
    - history (array of Q&A objects)
    - youtubeRecs (array of relevant learning resources)`;

    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.NUMBER },
              communication: { type: Type.NUMBER },
              technical: { type: Type.NUMBER },
              fluency: { type: Type.NUMBER },
              postureScore: { type: Type.NUMBER },
              speechAnalysis: { type: Type.STRING },
              postureAnalysis: { type: Type.STRING },
              improvementSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              history: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answerType: { type: Type.STRING },
                    suggestedAnswer: { type: Type.STRING }
                  },
                  required: ['question', 'answerType', 'suggestedAnswer']
                }
              },
              youtubeRecs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    url: { type: Type.STRING }
                  },
                  required: ['title', 'url']
                }
              },
              speechPaceAnalysis: { type: Type.STRING },
              fillerWordsAnalysis: { type: Type.STRING },
              attireAnalysis: { type: Type.STRING },
              eyeContactAnalysis: { type: Type.STRING },
              facialExpressionsAnalysis: { type: Type.STRING },
              bodyPostureAnalysis: { type: Type.STRING },
              handGesturesAnalysis: { type: Type.STRING },
              overallCommunicationScore: { type: Type.NUMBER },
              keyImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
              practiceRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['overallScore', 'communication', 'technical', 'fluency', 'postureScore', 'speechAnalysis', 'postureAnalysis', 'improvementSuggestions', 'history', 'youtubeRecs']
          }
        }
      }), 4, 2000); // 4 attempts; on 429 we wait API-suggested ~55s then retry

      const feedbackData = JSON.parse(response.text || '{}');
      setRichFeedback(feedbackData);
    } catch (error: any) {
      console.error("Feedback error:", error);
      const msg = error?.message || '';
      const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      const isServiceBusy = msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE') || msg.includes('quota');
      setRichFeedback({
        overallScore: 65, communication: 70, technical: 60, fluency: 75, postureScore: 80,
        speechAnalysis: is429
          ? "API rate limit (429) reached. Please wait about one minute, then tap 'End Audit' again to generate the full dossier. You can still export this summary as PDF."
          : isServiceBusy
            ? "The AI service is temporarily busy. Please try 'End Audit' again in a moment."
            : "System error during analysis. Manual review suggested.",
        postureAnalysis: isServiceBusy ? "Pending — retry in a minute" : "Data unavailable.",
        improvementSuggestions: is429
          ? ["Wait ~60 seconds and tap 'End Audit' again", "Or export this page as PDF for now"]
          : isServiceBusy
            ? ["Wait 30 seconds and try again", "The AI service is experiencing high traffic"]
            : ["Check API credentials", "Ensure stable connection"],
        history: [], youtubeRecs: []
      });
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const sendCodeSnapshot = useCallback(() => {
    if (!activeSessionRef.current || mode !== AppMode.INTERVIEW_LIVE) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 28px "Fira Code", monospace';
      ctx.fillText('CANDIDATE CODE SNAPSHOT', 40, 50);
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(40, 70);
      ctx.lineTo(980, 70);
      ctx.stroke();

      ctx.font = '22px "Fira Code", monospace';
      ctx.fillStyle = '#94a3b8';
      const lines = userCode.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(`${(i + 1).toString().padStart(3, '0')} | ${line}`, 40, 110 + i * 30);
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            try {
              activeSessionRef.current?.sendRealtimeInput({
                media: { data: base64, mimeType: 'image/jpeg' }
              });
            } catch (err) {
              console.error('Failed to send code snapshot:', err);
            }
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.7);
    }
  }, [userCode, mode]);

  const handleAnalyzeCode = useCallback(() => {
    if (!activeSessionRef.current || mode !== AppMode.INTERVIEW_LIVE || !userCode.trim()) return;
    
    try {
      // First send the code snapshot
      sendCodeSnapshot();
      
      // Then send voice request for analysis WITH CONTEXT OF THE QUESTION
      let analysisFeedbackPrompt = '';
      
      if (currentQuestion) {
        // Contextual feedback based on the specific question asked
        const context = `\n\nCONTEXT: The candidate was asked: "${currentQuestion}"\nAnalyze the code SPECIFICALLY in the context of solving this problem. Explain clearly if the solution fails to address the specific requirements of the question.`;
        
        analysisFeedbackPrompt = `ANALYZE CODE SUBMISSION - PROVIDE VOICE FEEDBACK${context}

A candidate has submitted the following code for this challenge. Analyze it and provide detailed voice feedback.

CANDIDATE'S CODE:
\`\`\`javascript
${userCode}
\`\`\`

STRICT RESPONSE PROTOCOL:

SCENARIO 1: CODE IS CORRECT (Solves the specific question asked)
1. Confirm the solution is correct.
2. Briefly praise efficiency or style.
3. Say "Great work. Let's move to the next question."
4. IMMEDIATELY ASK THE NEXT QUESTION in your interview sequence.

SCENARIO 2: CODE IS WRONG (Does not solve the specific question)
1. Clearly state "This is incorrect with respect to the question."
2. Explain the fundamental issue.
3. DO NOT ASK FOR A RETRY. Instead, concisely explain the CORRECT APPROACH (the logic/algorithm needed).
4. Say "Let's move on for now."
5. IMMEDIATELY ASK THE NEXT QUESTION in your interview sequence.

Be direct and professional. Manage the time effectively.`;
      } else {
        // Fallback generic feedback
        analysisFeedbackPrompt = `I need you to analyze the code the candidate just submitted. Here is their code:\n\n\`\`\`javascript\n${userCode}\`\`\`\n\nPlease provide detailed voice feedback covering:\n1. Code correctness and syntax\n2. Algorithm efficiency and time/space complexity\n3. Code readability and structure\n4. Best practices and potential bugs\n5. Specific improvements needed\n\nBe direct, professional, and constructive. Speak as if directly coaching the candidate on their code.`;
      }
      
      activeSessionRef.current.sendRealtimeInput({
        mimeType: 'text/plain',
        text: analysisFeedbackPrompt
      });
    } catch (err) {
      console.error('Failed to analyze code:', err);
    }
  }, [userCode, mode, currentQuestion, sendCodeSnapshot]);

  const handleRunCode = async () => {
    if (!userCode.trim()) return;
    
    setIsAiThinking(true);
    setIsAnalyzingCode(true);
    
    try {
      // Get comprehensive code feedback WITH QUESTION CONTEXT
      const feedback = await generateComprehensiveCodeFeedback(userCode, currentQuestion);
      setComprehensiveCodeFeedback(feedback);
      
      // Also get visualization analysis for display  
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const questionContext = currentQuestion ? `\n\nCONTEXT: The candidate was asked: "${currentQuestion}"` : '';
      const vizPrompt = `Act as an expert computer science educator. Analyze this code and provide visualization:
      
\`\`\`javascript
${userCode}
\`\`\`${questionContext}

Return JSON with:
- visualState: { type: "ARRAY"|"TREE"|"GRAPH"|"LINKED_LIST"|"POINTERS"|"MATRIX", elements: [...], connections: [...] }
- analysis: { steps: [...], bugs: [...], complexity: "" }`;

      const vizResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: vizPrompt,
        config: { 
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visualState: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  elements: {
                    type: Type.ARRAY,
                    items: { type: Type.OBJECT }
                  },
                  connections: { type: Type.ARRAY, items: { type: Type.OBJECT } },
                  pointers: { type: Type.ARRAY, items: { type: Type.OBJECT } }
                },
                required: ["type", "elements"]
              },
              analysis: {
                type: Type.OBJECT,
                properties: {
                  steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                  bugs: { type: Type.ARRAY, items: { type: Type.STRING } },
                  complexity: { type: Type.STRING }
                },
                required: ["steps", "bugs", "complexity"]
              }
            },
            required: ["visualState", "analysis"]
          }
        }
      });
      
      const vizResult = JSON.parse(vizResponse.text.trim());
      if (vizResult) {
        setVisualState(vizResult.visualState);
        setCodeAnalysis(vizResult.analysis);
      }
      
      // Send feedback to live session if available
      if (activeSessionRef.current && mode === AppMode.INTERVIEW_LIVE) {
        // Build contextual feedback based on the question and code analysis
        let voiceFeedback = '';
        
        if (currentQuestion) {
          // Context-aware feedback
          if (feedback.verdict === 'PASS') {
            voiceFeedback = `Great! Your solution correctly addresses the question. ${feedback.strengths.slice(0, 2).join('. ')}. Your time complexity is ${feedback.timeComplexity}. Well done!`;
          } else if (feedback.verdict === 'PARTIAL') {
            voiceFeedback = `Your approach is on the right track, but there are some issues to address for this problem. ${feedback.issuesFound.slice(0, 2).map(i => i.issue).join('. ')}. Let me suggest: ${feedback.improvements[0] || 'review the problem requirements'}.`;
          } else {
            voiceFeedback = `This solution doesn't quite address the question correctly. Key issues: ${feedback.issuesFound.slice(0, 2).map(i => i.issue).join('. ')}. ${feedback.improvements[0] || 'Try reviewing the problem requirements again'}.`;
          }
        } else {
          // Fallback generic feedback
          voiceFeedback = `I've analyzed your code. ${feedback.verdict === 'PASS' ? 'Great job! ' : 'There are some issues: '}${feedback.issuesFound.map(i => i.issue).join(', ')}.`;
        }
        
        try {
          await activeSessionRef.current.sendRealtimeInput({
            mimeType: 'text/plain',
            text: voiceFeedback
          });
        } catch (err) {
          console.error('Failed to send feedback:', err);
        }
      }
    } catch (error) {
      console.error('Code analysis error:', error);
      alert('Failed to analyze code. Please try again.');
    } finally {
      setIsAiThinking(false);
      setIsAnalyzingCode(false);
    }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#020617' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`HIRELENS-AUDIT-DOSSIER.pdf`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleResumeUpload = async (file: File) => {
    setIsAnalyzingResume(true);
    try {
      let text = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(' ') + '\n';
        }
      } else {
        text = await file.text();
      }
      
      if (!text.trim()) {
        throw new Error("Could not extract text from document");
      }
      
      setResumeText(text);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const analysisPrompt = `You are an expert HR recruiter. Analyze this resume and extract key information.
      
      Resume Content:
      ${text}
      
      Provide:
      1. Candidate name
      2. Total years of experience
      3. Key technical skills
      4. Companies worked at
      5. Notable projects
      6. Key strengths
      7. 3 deep-dive interview questions based on their experience (focus on drilling through projects, challenges, and decision-making)
      
      Return JSON with: candidateName, totalExperience, keySkills, companies, projects, strengths, interviewQuestions`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: analysisPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidateName: { type: Type.STRING },
              totalExperience: { type: Type.STRING },
              keySkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              companies: { type: Type.ARRAY, items: { type: Type.STRING } },
              projects: { type: Type.ARRAY, items: { type: Type.STRING } },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              interviewQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['candidateName', 'totalExperience', 'keySkills', 'companies', 'projects', 'strengths', 'interviewQuestions']
          }
        }
      });
      
      const analysis = JSON.parse(response.text || '{}');
      setResumeAnalysis(analysis);
      setMode(AppMode.HR_LIVE);
      startHRSession(analysis);
    } catch (error) {
      console.error('Resume analysis error:', error);
      alert('Failed to analyze resume. Please try again.');
    } finally {
      setIsAnalyzingResume(false);
    }
  };

  const handleHRResumeUpload = async (file: File) => {
    setHrResumeUploading(true);
    try {
      // Read file as base64
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to base64
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Data = btoa(binary);
      
      // Store the base64 for analysis
      setResumeText(base64Data);
      
      // Determine MIME type
      const mimeType = file.type === 'application/pdf' ? 'application/pdf' : 'text/plain';
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Use Gemini to analyze the resume file directly
      const analysisPrompt = `You are an expert HR recruiter. Analyze this resume document and extract key information for conducting a targeted interview.

Provide:
1. Candidate name
2. Total years of experience
3. Key technical skills
4. Companies worked at
5. Notable projects and achievements
6. Key strengths based on the resume
7. 3 specific interview questions that ONLY drill into what's mentioned in THIS resume (projects, companies, specific achievements mentioned)

IMPORTANT: Questions must be based ONLY on information provided in the resume. Do not ask generic questions.

Return JSON with: candidateName, totalExperience, keySkills, companies, projects, strengths, interviewQuestions`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: analysisPrompt
              },
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidateName: { type: Type.STRING },
              totalExperience: { type: Type.STRING },
              keySkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              companies: { type: Type.ARRAY, items: { type: Type.STRING } },
              projects: { type: Type.ARRAY, items: { type: Type.STRING } },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              interviewQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['candidateName', 'totalExperience', 'keySkills', 'companies', 'projects', 'strengths', 'interviewQuestions']
          }
        }
      });
      
      const analysis = JSON.parse(response.text || '{}');
      
      if (!analysis.candidateName) {
        throw new Error("Could not extract information from resume. Please ensure your resume is valid and readable.");
      }
      
      setShowHrResumeModal(false);
      
      // Start HR session with the analyzed resume
      await startHRSession(analysis);
    } catch (error: any) {
      console.error('HR Resume upload error:', error);
      const errorMessage = error?.message || 'Failed to process resume. Please try again with a valid PDF.';
      alert(`${errorMessage}`);
    } finally {
      setHrResumeUploading(false);
    }
  };

  const startHRSession = async (analysisOrResumeText: any) => {
    await cleanupSession();
    setHrTranscript([]);
    setHrAnswersCount(0);
    setHrFeedback(null);

    initAudio();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    let analysis = analysisOrResumeText;
    
    // If it's a string (resume text), analyze it first
    if (typeof analysisOrResumeText === 'string') {
      const resumeText = analysisOrResumeText;
      
      const analysisPrompt = `You are an expert HR recruiter. Analyze this resume and extract key information for conducting a targeted interview.
      
      Resume Content:
      ${resumeText}
      
      Provide:
      1. Candidate name
      2. Total years of experience
      3. Key technical skills
      4. Companies worked at
      5. Notable projects and achievements
      6. Key strengths based on the resume
      7. 3 specific interview questions that ONLY drill into what's mentioned in THIS resume (projects, companies, specific achievements mentioned)
      
      IMPORTANT: Questions must be based ONLY on information provided in the resume. Do not ask generic questions.
      
      Return JSON with: candidateName, totalExperience, keySkills, companies, projects, strengths, interviewQuestions`;
      
      const analysisResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: analysisPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidateName: { type: Type.STRING },
              totalExperience: { type: Type.STRING },
              keySkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              companies: { type: Type.ARRAY, items: { type: Type.STRING } },
              projects: { type: Type.ARRAY, items: { type: Type.STRING } },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              interviewQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['candidateName', 'totalExperience', 'keySkills', 'companies', 'projects', 'strengths', 'interviewQuestions']
          }
        }
      });
      
      analysis = JSON.parse(analysisResponse.text || '{}');
    }
    
    const systemInstruction = `You are the HR Director at ${interviewConfig.targetCompany || 'a prestigious tech company'}.

OPENING GREETING: Start with a warm greeting: "Hello ${analysis.candidateName}! Welcome! Congratulations on clearing the technical round - I'm really impressed by your performance. I've reviewed your resume and I'm excited to learn more about your professional journey. Let's have a conversation about your experience and explore how you approach challenges. I'll ask you three questions, and please feel free to share detailed examples. Ready? Let's begin!"

CANDIDATE PROFILE (Based on provided resume):
- Name: ${analysis.candidateName}
- Experience: ${analysis.totalExperience}
- Skills: ${analysis.keySkills.join(', ')}
- Companies: ${analysis.companies.join(', ')}
- Projects: ${analysis.projects.join(', ')}
- Resume Content Summary: You have reviewed their resume and will ask targeted questions about what's mentioned in it.

YOUR MISSION: Ask exactly 3 experience-based questions that drill through their background based ONLY on the information in their resume.

QUESTION STRATEGY (Based on resume content):
${analysis.interviewQuestions.map((q: string, i: number) => `Question ${i + 1}: ${q}`).join('\n')}

CRITICAL RULES:
- Ask ONLY questions based on what's in their resume - no off-topic questions
- Ask one question at a time with natural conversational flow
- Probe deeply into their project experiences, challenges faced, and decisions made
- After each answer, acknowledge the response genuinely and proceed to the next question
- After Question 3 is answered, say: "Thank you so much for sharing your experiences with me, ${analysis.candidateName}. This has been really insightful. Please select 'End HR Round' to view your final evaluation."
- Be conversational, warm, and professional
- Focus on behavioral and situational questions related to their actual experience
- Show genuine interest in their answers`;

    try {
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setSessionStatus('connected');
            setupMicrophone(sessionPromise);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current && outputNodeRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioData = decodeBase64(base64Audio);
              const buffer = await decodeAudioData(audioData, ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputNodeRef.current);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSourcesRef.current.add(source);
              source.onended = () => activeSourcesRef.current.delete(source);
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              setHrTranscript(prev => [...prev, {role: 'HR Interviewer', text}]);
            } else if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setHrTranscript(prev => [...prev, {role: 'Candidate', text}]);
              
              if (text.trim().length > 0) {
                setHrAnswersCount(prev => Math.min(prev + 1, 3));
              }
            }
          },
          onerror: (e) => {
            console.error("HR Session Error:", e);
            setSessionStatus('error');
          },
          onclose: (e) => {
            console.warn("HR Session Closed:", e);
            setSessionStatus('disconnected');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      activeSessionRef.current = await sessionPromise;
    } catch (e) {
      console.error("HR Round Failed:", e);
      setSessionStatus('error');
    }
  };

  const generateHRFeedback = async () => {
    if (hrTranscript.length === 0) return;

    setIsGeneratingHRFeedback(true);
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const transcriptString = hrTranscript.map(t => `${t.role}: ${t.text}`).join('\n');
    
    const prompt = `You are a Senior HR Director. Evaluate this HR interview based on experience, behavioral responses, and cultural fit.
    
    Use the SAME scoring algorithm as the technical audit:
    
    COMPREHENSIVE ANALYSIS FRAMEWORK:
    
    1. EXPERIENCE DEPTH:
       - Evaluate real project experience and ownership
       - Assess problem-solving in real scenarios
       - Verify leadership and teamwork abilities
    
    2. BEHAVIORAL COMPETENCIES:
       - Communication clarity and storytelling
       - Conflict resolution and decision-making
       - Cultural fit and values alignment
    
    3. SPEECH DELIVERY (use same criteria as technical round):
       - speechPaceAnalysis, fillerWordsAnalysis
       - Professional presence indicators
    
    4. SCORES (0-100 for each):
       - overallScore: Overall HR round performance
       - communication: How well they communicate experiences
       - technical: Depth of technical project understanding
       - fluency: Speech fluency
       - postureScore: Confidence and presence
    
    Candidate Profile:
    - Name: ${resumeAnalysis?.candidateName}
    - Experience: ${resumeAnalysis?.totalExperience}
    - Companies: ${resumeAnalysis?.companies?.join(', ')}

    Transcript:
    ${transcriptString}
    
    Provide comprehensive feedback with all fields populated (same structure as technical audit).`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.NUMBER },
              communication: { type: Type.NUMBER },
              technical: { type: Type.NUMBER },
              fluency: { type: Type.NUMBER },
              postureScore: { type: Type.NUMBER },
              speechAnalysis: { type: Type.STRING },
              postureAnalysis: { type: Type.STRING },
              improvementSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              history: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answerType: { type: Type.STRING },
                    suggestedAnswer: { type: Type.STRING }
                  },
                  required: ['question', 'answerType', 'suggestedAnswer']
                }
              },
              youtubeRecs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    url: { type: Type.STRING }
                  },
                  required: ['title', 'url']
                }
              },
              speechPaceAnalysis: { type: Type.STRING },
              fillerWordsAnalysis: { type: Type.STRING },
              attireAnalysis: { type: Type.STRING },
              eyeContactAnalysis: { type: Type.STRING },
              facialExpressionsAnalysis: { type: Type.STRING },
              bodyPostureAnalysis: { type: Type.STRING },
              handGesturesAnalysis: { type: Type.STRING },
              overallCommunicationScore: { type: Type.NUMBER },
              keyImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
              practiceRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['overallScore', 'communication', 'technical', 'fluency', 'postureScore', 'speechAnalysis', 'postureAnalysis', 'improvementSuggestions', 'history', 'youtubeRecs']
          }
        }
      });

      const feedbackData = JSON.parse(response.text || '{}');
      setHrFeedback(feedbackData);
      setMode(AppMode.HR_FEEDBACK);
    } catch (error) {
      console.error("HR Feedback error:", error);
    } finally {
      setIsGeneratingHRFeedback(false);
    }
  };

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden text-slate-200 ${mode === AppMode.TEACHING_LIVE ? 'bg-transparent' : 'bg-black'}`}>
      {mode !== AppMode.TEACHING_LIVE && (
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0f172a]/80 backdrop-blur-2xl z-50 shrink-0 shadow-2xl no-print">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => { cleanupSession(); setMode(AppMode.IDLE); }}>
            <img src="/HireLens%20(1).png" alt="Hirelens" className="w-8 h-8 object-contain group-hover:scale-105 transition-all" />
            <h1 className="text-lg font-black tracking-tight">Hirelens <span className="text-blue-500">AI</span></h1>
          </div>
          <div className="flex gap-2">
             <button onClick={() => setMode(AppMode.INTERVIEW_ONBOARDING)} className={`px-6 py-3 rounded-lg text-[15px] font-black transition-all ${mode === AppMode.INTERVIEW_LIVE ? 'bg-blue-600 shadow-lg shadow-blue-600/20' : 'bg-slate-800'}`}>Initiate Audit</button>
             <button onClick={() => { setMode(AppMode.TEACHING_LIVE); }} className="px-6 py-3 rounded-lg text-[15px] font-black transition-all bg-indigo-600 shadow-lg shadow-indigo-600/20">Code Visualizer</button>
          </div>
        </header>
      )}

      <main className="flex-1 relative overflow-hidden">
        {mode === AppMode.IDLE && (
          <div className="absolute inset-0 bg-[#020617] overflow-y-auto scrollbar-hide">
            {/* Dynamic Background Mesh */}
            <div className="fixed inset-0 pointer-events-none opacity-20">
               <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/30 rounded-full blur-[120px] animate-pulse-slow"></div>
               <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/30 rounded-full blur-[120px] animate-pulse-slow delay-1000"></div>
               <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-purple-600/20 rounded-full blur-[100px] animate-pulse-slow delay-2000"></div>
            </div>

            {/* Pattern Overlay */}
            <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

            <div className="relative z-10">
               {/* Hero Section */}
               <section className="min-h-screen flex flex-col items-center justify-center px-6 relative">
                  <div className="absolute top-0 w-full h-full bg-gradient-to-b from-transparent via-[#020617]/50 to-[#020617] pointer-events-none"></div>
                  
                  <div className="max-w-5xl mx-auto text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                    
                    <h1 className="text-6xl sm:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-200 to-slate-500 leading-[0.9]">
                       Master The <br/>
                       <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">Technical Interview.</span>
                    </h1>
                    
                    <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
                       The world's most advanced AI-powered technical interview simulator. 
                       Analyze speech, code, and problem-solving in real-time.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-5 justify-center pt-8">
                       <button onClick={() => setMode(AppMode.INTERVIEW_ONBOARDING)} className="group relative px-8 py-5 bg-blue-600 rounded-2xl overflow-hidden shadow-2xl shadow-blue-600/40 transition-all hover:scale-105 active:scale-95">
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          <span className="relative flex items-center gap-3 text-white font-black text-xs uppercase tracking-[0.2em]">
                             Start Assessment <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                          </span>
                       </button>
                       <button onClick={() => { setMode(AppMode.TEACHING_LIVE); }} className="group px-8 py-5 bg-[#0f172a] border border-white/10 rounded-2xl hover:bg-white/5 transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 active:scale-95">
                          <span className="flex items-center gap-3 text-slate-300 group-hover:text-white font-black text-xs uppercase tracking-[0.2em]">
                             Explore Visualizer <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </span>
                       </button>
                    </div>


                  </div>
               </section>



               {/* Feature Grid */}
               <section className="py-32 px-6">
                 <div className="max-w-7xl mx-auto">
                    <div className="mb-20 text-center">
                       <span className="text-blue-500 font-bold tracking-widest uppercase text-xs mb-4 block">System Capabilities</span>
                       <h2 className="text-5xl font-black text-white tracking-tight mb-6">Engineered for Excellence.</h2>
                       <p className="text-slate-400 max-w-2xl mx-auto text-lg">Our platform combines state-of-the-art LLMs with real-time audio processing to simulate the pressure and complexity of top-tier interviews.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                       {[
                         { title: 'Neural Audio Processing', desc: 'Real-time speech analysis detecting confidence, pace, and clarity.', icon: '🎙️', colorClass: 'bg-blue-500/10 text-blue-400' },
                         { title: 'Semantic Code Audit', desc: 'Deep AST analysis to find logic gaps and efficiency optimizations.', icon: '💻', colorClass: 'bg-indigo-500/10 text-indigo-400' },
                         { title: 'Spatial Visualization', desc: 'Interactive visual representations of complex data structures.', icon: '🧊', colorClass: 'bg-violet-500/10 text-violet-400' },
                         { title: 'Behavioral Profiling', desc: 'Psychometric evaluation of soft skills and leadership traits.', icon: '🧠', colorClass: 'bg-emerald-500/10 text-emerald-400' },
                         { title: 'Adaptive Difficulty', desc: 'Dynamic scaling based on your realtime performance metrics.', icon: '⚡', colorClass: 'bg-amber-500/10 text-amber-400' },
                         { title: 'Detailed Dossiers', desc: 'Comprehensive PDF reports acceptable by real hiring committees.', icon: '📄', colorClass: 'bg-rose-500/10 text-rose-400' }
                       ].map((f, i) => (
                         <div key={i} className="group p-8 rounded-3xl bg-slate-900 border border-white/5 hover:border-white/10 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/10">
                            <div className={`w-12 h-12 rounded-2xl ${f.colorClass} flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform`}>{f.icon}</div>
                            <h3 className="text-xl font-black text-white mb-3">{f.title}</h3>
                            <p className="text-sm text-slate-400 leading-relaxed font-medium">{f.desc}</p>
                         </div>
                       ))}
                    </div>
                 </div>
               </section>

               {/* Footer */}
               
            </div>
          </div>
        )}

        {mode === AppMode.INTERVIEW_ONBOARDING && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-[#020617] animate-in fade-in duration-500">
             <div className="w-full max-w-xl glass p-12 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                   <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em]">Audit Configuration</span>
                   <h2 className="text-4xl font-black tracking-tight">Set Parameters.</h2>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                   <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Domain</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Distributed Systems" 
                        value={interviewConfig.domain}
                        className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-blue-500/50 transition-all font-bold text-sm"
                        onChange={(e) => setInterviewConfig(prev => ({ ...prev, domain: e.target.value }))}
                      />
                   </div>
                   <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Experience</label>
                      <select 
                        value={interviewConfig.experienceLevel}
                        className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-blue-500/50 transition-all font-bold text-sm appearance-none"
                        onChange={(e) => setInterviewConfig(prev => ({ ...prev, experienceLevel: e.target.value }))}
                      >
                         <option value="Junior">Junior</option>
                         <option value="Mid-Level">Mid-Level</option>
                         <option value="Senior">Senior</option>
                         <option value="Staff+">Staff+</option>
                      </select>
                   </div>
                   <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Company Type</label>
                      <input 
                        type="text" 
                        placeholder="e.g. FAANG" 
                        value={interviewConfig.companyType}
                        className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-blue-500/50 transition-all font-bold text-sm"
                        onChange={(e) => setInterviewConfig(prev => ({ ...prev, companyType: e.target.value }))}
                      />
                   </div>
                   <div className="flex flex-col gap-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Target Company</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Google" 
                        value={interviewConfig.targetCompany}
                        className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-blue-500/50 transition-all font-bold text-sm"
                        onChange={(e) => setInterviewConfig(prev => ({ ...prev, targetCompany: e.target.value }))}
                      />
                   </div>
                </div>

                <button 
                  onClick={() => { setMode(AppMode.INTERVIEW_LIVE); startSession(interviewConfig); }}
                  disabled={!interviewConfig.domain || !interviewConfig.targetCompany}
                  className="w-full py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-xl shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  Enter Audit Chamber
                </button>
             </div>
          </div>
        )}

        {mode === AppMode.INTERVIEW_LIVE && (
          <div className="h-full w-full flex bg-[#020617] p-6 gap-6 relative overflow-hidden">
            {/* Left Control Column */}
            <div className="w-[420px] flex flex-col gap-6 shrink-0 z-10">
               
               {/* Camera Feed */}
               <div className="relative h-[320px] rounded-[2.5rem] overflow-hidden bg-black border border-white/10 shadow-2xl shrink-0 group">
                  <CameraView isActive={true} videoRef={videoRef} className="w-full h-full grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700 opacity-90 group-hover:opacity-100" />
                  
                  {/* Camera overlays
                  <div style="display: none;" className="absolute top-6 left-6 flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full backdrop-blur-md">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[10px] font-black text-red-500 tracking-widest uppercase">LIVE FEED</span>
                    </div>
                  </div> */}
                  
                  <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />
                  <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
                     <div>
                       <p className="text-[10px] text-blue-400 font-black tracking-widest uppercase mb-1">Subject</p>
                       <p className="text-white font-bold text-lg">Candidate</p>
                     </div>
                     <div className="text-right">
                       <p className="text-slate-300 font-mono text-xs">Recording Analysis </p>
                     </div>
                  </div>
               </div>

               {/* Neural Diagnostic Panel */}
               <div className="flex-1 glass p-8 rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col gap-6 overflow-hidden relative">
                   {/* Decorative background elements */}
                   <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-[80px] pointer-events-none" />
                   
                   <div className="flex items-center justify-between pb-4 border-b border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <span className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] leading-none pt-1">Neural Diagnostics</span>
                      </div>
                   </div>
                   
                   {/* CODE AUDIT REPORT IN-UI */}
                   <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
                     {comprehensiveCodeFeedback ? (
                       <div className="animate-in slide-in-from-bottom duration-500">
                          <CodeFeedbackDisplay feedback={comprehensiveCodeFeedback} isLoading={isAnalyzingCode} />
                       </div>
                     ) : codeAnalysis ? (
                       <div className="space-y-4 animate-in slide-in-from-bottom duration-500">
                          <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl relative overflow-hidden group">
                             <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
                             <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3">Execution Flow</h4>
                             <ul className="space-y-3">
                               {codeAnalysis.steps.slice(0, 3).map((s, i) => (
                                 <li key={i} className="flex gap-3 text-[11px] text-slate-400 leading-relaxed">
                                   <span className="font-mono text-blue-500/50 text-[10px] pt-0.5">{(i+1).toString().padStart(2, '0')}</span>
                                   {s}
                                 </li>
                               ))}
                             </ul>
                          </div>
                          
                          {codeAnalysis.bugs.length > 0 && (
                            <div className="p-5 bg-red-900/10 border border-red-900/20 rounded-2xl relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50" />
                              <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-3">Detected Anomalies</h4>
                              <ul className="space-y-3">
                                {codeAnalysis.bugs.map((b, i) => (
                                  <li key={i} className="flex gap-3 text-[11px] text-red-300/80 leading-relaxed">
                                    <span className="text-red-500 font-bold">!</span>
                                    {b}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          <div className="p-4 rounded-xl border border-white/5 bg-white/5 flex items-center justify-between">
                             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Complexity</span>
                             <span className="text-xs font-mono text-orange-400">{codeAnalysis.complexity}</span>
                          </div>
                       </div>
                     ) : (
                       <div className="h-full flex flex-col items-center justify-center opacity-30 text-center gap-4">
                         <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-500 animate-spin-slow" />
                         <p className="text-[10px] uppercase tracking-widest font-black text-slate-500">Awaiting Code Submission</p>
                       </div>
                     )}
                   </div>

                   <div className="mt-auto pt-6 border-t border-white/5 space-y-3">
                      <button 
                         onClick={handleAnalyzeCode}
                         className="group w-full py-4 bg-orange-600/90 hover:bg-orange-500 text-white font-black rounded-xl text-[10px] tracking-[0.2em] shadow-lg shadow-orange-900/20 transition-all active:scale-95 uppercase flex items-center justify-center gap-3 relative overflow-hidden"
                      >
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                         <span>Analyze Code</span>
                         <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </button>
                      <button 
                         onClick={async () => { await cleanupSession(); generateHonestFeedback(); }}
                         className="w-full py-4 bg-slate-800 hover:bg-red-600/90 text-slate-400 hover:text-white font-black rounded-xl text-[10px] tracking-[0.2em] shadow-lg transition-all active:scale-95 uppercase border border-white/5 hover:border-red-500/50"
                      >
                         End Session
                      </button>
                   </div>
               </div>
            </div>
            
            {/* Right Code Editor Area */}
            <div className="flex-1 h-full rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl relative border border-white/10 bg-[#0B1221]">
                {/* Editor Header Overlay */}
                <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-[#0B1221] to-transparent z-10 pointer-events-none" />
                
                <CodeEditor code={userCode} onCodeChange={setUserCode} onRun={handleRunCode} isLoading={isAiThinking} feedbackData={codeAnalysis} />
            </div>
          </div>
        )}

        {mode === AppMode.TEACHING_LIVE && (
          <div className="relative h-screen w-screen text-slate-200 overflow-hidden font-sans">
            {/* Absolute Background Camera Layer */}
            <HologramCameraLayer />

            {/* Main UI Overlay - Use transparency to let camera through */}
            <div className="relative z-10 flex flex-col h-full bg-transparent">
              {/* Header */}
              <header className="h-20 px-10 flex items-center justify-between shrink-0 bg-slate-950/60 backdrop-blur-xl border-b border-white/5">
                <div className="flex items-center space-x-5">
                  <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-600/30 overflow-hidden">
                    <img src="/HireLens.png" alt="HireLens" className="w-10 h-10 object-contain" />
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-white leading-none">HireLens</h1>
                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.4em] mt-1.5 opacity-80">Virtual Camera Interface</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6">
                  {isHologramLoading && (
                    <div className="flex items-center space-x-3 text-indigo-400 text-[11px] font-black tracking-widest animate-pulse">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full"></div>
                      <span>SYNCING_NEURAL_TRACE</span>
                    </div>
                  )}
                  {!isHologramLoading && algoMetadata && (
                    <div className="bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20 text-[10px] font-black text-indigo-300 tracking-widest uppercase">
                      {algoMetadata.steps.length} Simulation Cycles
                    </div>
                  )}
                  <button 
                    onClick={() => { setMode(AppMode.IDLE); }}
                    className="px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-red-600/80 hover:bg-red-500 transition-all"
                  >
                    Exit
                  </button>
                </div>
              </header>

              <main className="flex-1 flex overflow-hidden p-8 gap-8">
                {/* Sidebar Panel */}
                <aside className="w-[340px] flex flex-col">
                  <div className="flex-1 bg-slate-900/70 backdrop-blur-2xl border border-white/5 rounded-[40px] p-8 shadow-2xl flex flex-col overflow-auto resize" style={{ minWidth: 260, minHeight: 320 }}>
                    {/* Code Editor */}
                    <div className="flex flex-col h-full gap-6">
                      <div className="flex flex-col flex-1 min-h-0">
                        <div className="flex items-center justify-between mb-3 px-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Source Code</label>
                          <div className="w-2 h-2 rounded-full bg-indigo-500/40"></div>
                        </div>
                        <div className="relative flex-1 bg-slate-950/50 border border-slate-800 rounded-2xl overflow-hidden font-mono text-xs">
                          <textarea
                            value={hologramCode}
                            onChange={(e) => setHologramCode(e.target.value)}
                            className="absolute inset-0 w-full h-full bg-transparent text-slate-300 p-6 outline-none resize-none leading-relaxed z-10 selection:bg-indigo-500/40"
                            spellCheck={false}
                          />
                          <div className="absolute top-0 left-0 w-full pointer-events-none p-6 pt-6">
                            {hologramCode.split('\n').map((_, idx) => (
                              <div 
                                key={idx} 
                                className={`h-[1.5rem] -mx-6 px-6 w-[calc(100%+3rem)] transition-colors duration-200 ${currentHologramStep?.codeLine === idx + 1 ? 'bg-indigo-500/10 border-l-4 border-indigo-500' : ''}`}
                              ></div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Initial Input</label>
                        <input 
                          type="text" 
                          value={hologramInputData}
                          onChange={(e) => setHologramInputData(e.target.value)}
                          placeholder="e.g. [1, 5, 10]"
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 text-slate-200 font-mono text-[11px] focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700"
                        />
                      </div>

                      <button
                        onClick={handleHologramAnalyze}
                        disabled={isHologramLoading}
                        className={`w-full py-4 rounded-2xl font-bold uppercase tracking-[0.15em] text-[11px] transition-all flex items-center justify-center
                          ${isHologramLoading 
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-xl shadow-indigo-500/20 active:scale-[0.97]'
                          }`}
                      >
                        {isHologramLoading ? (
                          <span className="flex items-center gap-3">
                            <svg className="animate-spin h-4 w-4 text-white/50" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating Trace
                          </span>
                        ) : (
                          'Run Visualization'
                        )}
                      </button>
                    </div>
                  </div>
                </aside>

                {/* Visualizer Canvas */}
                <section className="flex-1 relative flex flex-col">
                  <div className="flex-1 bg-gradient-to-br from-slate-900/40 via-slate-800/30 to-slate-900/40 rounded-[40px] overflow-hidden relative border border-white/10 shadow-2xl">
                     {/* Hologram Renderer */}
                     <HologramRendererInline 
                      metadata={algoMetadata} 
                      currentStep={currentHologramStep}
                      onManualAction={() => setIsHologramPlaying(false)}
                    />
                    
                    {/* Floating Dashboard */}
                    <div className="absolute top-10 right-10 z-40">
                      <HologramDashboardOverlay 
                        metadata={algoMetadata} 
                        currentStepIndex={currentStepIndex}
                        isLoading={isHologramLoading}
                      />
                    </div>

                    {/* Description HUD */}
                    {currentHologramStep && (
                      <div className="absolute top-10 left-10 max-w-sm z-30">
                        <div className="bg-slate-900/80 backdrop-blur-2xl border border-white/5 p-6 rounded-3xl shadow-2xl">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] block mb-3">Cycle Insight</span>
                          <p className="text-sm text-slate-100 leading-relaxed font-medium">
                            {currentHologramStep.description}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </main>

              {/* Timeline Control Island */}
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 w-full px-8 transition-all duration-700 ease-in-out" style={{ maxWidth: isTimelineMinimized ? '140px' : '900px' }}>
                <div className="bg-slate-900/80 backdrop-blur-3xl border border-white/10 p-3 rounded-[32px] shadow-[0_25px_60px_rgba(0,0,0,0.6)]">
                  <HologramTimelineControls 
                    totalSteps={algoMetadata?.steps.length || 0}
                    currentStep={currentStepIndex}
                    isPlaying={isHologramPlaying}
                    onPlayPause={() => setIsHologramPlaying(!isHologramPlaying)}
                    onNext={hologramNextStep}
                    onPrev={hologramPrevStep}
                    onSeek={setCurrentStepIndex}
                    speed={playbackSpeed}
                    onSpeedChange={setPlaybackSpeed}
                    isMinimized={isTimelineMinimized}
                    onToggleMinimize={() => setIsTimelineMinimized(!isTimelineMinimized)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === AppMode.INTERVIEW_FEEDBACK && (
          <div className="absolute inset-0 bg-[#020617] p-10 overflow-y-auto animate-in fade-in duration-1000">
              {isGeneratingFeedback && (
                <div className="absolute inset-0 bg-[#020617]/80 backdrop-blur-md flex flex-col items-center justify-center gap-6 z-[60]">
                   <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                   <div className="flex flex-col items-center gap-2">
                      <h2 className="text-2xl font-black tracking-tighter">Synthesizing Dossier...</h2>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Neural Performance Audit</p>
                   </div>
                </div>
              )}
              
              {richFeedback && (
                <div className="max-w-6xl mx-auto pb-40" ref={reportRef}>
                   <div className="flex justify-between items-end mb-16 px-4">
                     <div>
                       <span className="text-[12px] font-black text-blue-500 uppercase tracking-[0.4em] mb-4 block">Final Performance Dossier</span>
                       <h2 className="text-7xl font-black tracking-tighter">Audit Result.</h2>
                     </div>
                     <div className="text-right">
                       <div className={`text-[12rem] font-black leading-none drop-shadow-2xl ${richFeedback.overallScore < 50 ? 'text-red-500' : 'text-white'}`}>
                         {richFeedback.overallScore}
                       </div>
                     </div>
                   </div>

                   <div className="grid grid-cols-4 gap-7 mb-12 px-4">
                      {[
                        { label: 'Technical depth', score: richFeedback.technical, color: 'text-blue-500' },
                        { label: 'Communication', score: richFeedback.communication, color: 'text-emerald-400' },
                        { label: 'Spatial Presence', score: richFeedback.postureScore, color: 'text-indigo-400' },
                        { label: 'Linguistic Fluency', score: richFeedback.fluency, color: 'text-orange-400' }
                      ].map((m, i) => (
                        <div key={i} className="glass p-10 rounded-[2.5rem] border border-white/10 flex flex-col items-center gap-6 shadow-2xl">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">{m.label}</span>
                          <div className="relative w-32 h-32 flex items-center justify-center">
                             <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                               <circle cx="64" cy="64" r="40" fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                               <circle 
                                 cx="64" cy="64" r="40" 
                                 fill="transparent" 
                                 stroke="currentColor" 
                                 strokeWidth="10" 
                                 strokeDasharray={2 * Math.PI * 40} 
                                 strokeDashoffset={2 * Math.PI * 40 * (1 - m.score / 100)} 
                                 strokeLinecap="round" 
                                 className={`${m.score < 50 ? 'text-red-500' : m.score < 80 ? 'text-orange-400' : m.color} transition-all duration-1000`} 
                               />
                             </svg>
                             <span className="text-2xl font-black tracking-tighter">{m.score}%</span>
                          </div>
                        </div>
                      ))}
                   </div>

                   <div className="px-4 mb-20">
                     <div className="glass p-12 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col gap-10">
                        <div className="flex flex-col gap-4">
                          <h3 className="text-2xl font-black tracking-tight">Qualitative Breakdown</h3>
                          <div className="grid grid-cols-2 gap-10">
                             <div>
                               <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-4">Neural Linguistics</label>
                               <p className="text-sm text-slate-400 leading-relaxed italic">"{richFeedback.speechAnalysis}"</p>
                             </div>
                             <div>
                               <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-4">Spatial Interaction</label>
                               <p className="text-sm text-slate-400 leading-relaxed italic">"{richFeedback.postureAnalysis}"</p>
                             </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4">
                           <h3 className="text-xl font-black tracking-tight">Actionable Neural Upgrades</h3>
                           <ul className="grid grid-cols-1 gap-3">
                              {richFeedback.improvementSuggestions.map((s, i) => (
                                <li key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                                   <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                   <span className="text-sm font-bold text-slate-300">{s}</span>
                                </li>
                              ))}
                           </ul>
                        </div>
                     </div>
                   </div>

                   {/* Detailed Speaker Performance Analysis */}
                   {(richFeedback.speechPaceAnalysis || richFeedback.fillerWordsAnalysis) && (
                     <div className="px-4 mb-20">
                       <div className="glass p-12 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col gap-8">
                          <h3 className="text-3xl font-black tracking-tight mb-4">Detailed Performance Analysis</h3>
                          
                          <div className="grid grid-cols-2 gap-8">
                             {richFeedback.speechPaceAnalysis && (
                               <div className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-2xl">
                                 <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                   Speech Pace
                                 </h4>
                                 <p className="text-sm text-slate-300 leading-relaxed">{richFeedback.speechPaceAnalysis}</p>
                               </div>
                             )}
                             
                             {richFeedback.fillerWordsAnalysis && (
                               <div className="p-6 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20 rounded-2xl">
                                 <h4 className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                                   Filler Words Usage
                                 </h4>
                                 <p className="text-sm text-slate-300 leading-relaxed">{richFeedback.fillerWordsAnalysis}</p>
                               </div>
                             )}
                             
                             {richFeedback.attireAnalysis && (
                               <div className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-2xl">
                                 <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                                   Attire & Appearance
                                 </h4>
                                 <p className="text-sm text-slate-300 leading-relaxed">{richFeedback.attireAnalysis}</p>
                               </div>
                             )}
                             
                             {richFeedback.eyeContactAnalysis && (
                               <div className="p-6 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                                 <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                   Eye Contact
                                 </h4>
                                 <p className="text-sm text-slate-300 leading-relaxed">{richFeedback.eyeContactAnalysis}</p>
                               </div>
                             )}
                             
                             {richFeedback.facialExpressionsAnalysis && (
                               <div className="p-6 bg-gradient-to-br from-pink-500/10 to-pink-500/5 border border-pink-500/20 rounded-2xl">
                                 <h4 className="text-[10px] font-black text-pink-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                                   Facial Expressions
                                 </h4>
                                 <p className="text-sm text-slate-300 leading-relaxed">{richFeedback.facialExpressionsAnalysis}</p>
                               </div>
                             )}
                             
                             {richFeedback.bodyPostureAnalysis && (
                               <div className="p-6 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/20 rounded-2xl">
                                 <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                                   Body Posture
                                 </h4>
                                 <p className="text-sm text-slate-300 leading-relaxed">{richFeedback.bodyPostureAnalysis}</p>
                               </div>
                             )}
                             
                             {richFeedback.handGesturesAnalysis && (
                               <div className="p-6 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/20 rounded-2xl">
                                 <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                                   Hand Gestures
                                 </h4>
                                 <p className="text-sm text-slate-300 leading-relaxed">{richFeedback.handGesturesAnalysis}</p>
                               </div>
                             )}
                          </div>
                          
                          {richFeedback.overallCommunicationScore && (
                            <div className="mt-4 p-8 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-3xl flex items-center justify-between">
                              <div>
                                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Overall Communication Effectiveness</h4>
                                <p className="text-sm text-slate-400">Comprehensive communication performance score</p>
                              </div>
                              <div className="text-6xl font-black text-white">{richFeedback.overallCommunicationScore}%</div>
                            </div>
                          )}
                       </div>
                     </div>
                   )}

                   {/* Key Improvements & Practice Recommendations */}
                   {(richFeedback.keyImprovements || richFeedback.practiceRecommendations) && (
                     <div className="px-4 mb-20">
                       <div className="grid grid-cols-2 gap-8">
                         {richFeedback.keyImprovements && richFeedback.keyImprovements.length > 0 && (
                           <div className="glass p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
                             <h3 className="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
                               <span className="w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center text-red-400 text-sm">!</span>
                               Key Improvements Needed
                             </h3>
                             <ul className="space-y-3">
                               {richFeedback.keyImprovements.map((improvement, i) => (
                                 <li key={i} className="flex items-start gap-3 p-4 bg-red-500/5 border border-red-500/10 rounded-xl">
                                   <span className="text-red-400 font-black text-xs mt-0.5">{i + 1}.</span>
                                   <span className="text-sm text-slate-300 leading-relaxed">{improvement}</span>
                                 </li>
                               ))}
                             </ul>
                           </div>
                         )}
                         
                         {richFeedback.practiceRecommendations && richFeedback.practiceRecommendations.length > 0 && (
                           <div className="glass p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
                             <h3 className="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
                               <span className="w-8 h-8 bg-green-500/20 rounded-xl flex items-center justify-center text-green-400 text-sm">✓</span>
                               Practice Recommendations
                             </h3>
                             <ul className="space-y-3">
                               {richFeedback.practiceRecommendations.map((recommendation, i) => (
                                 <li key={i} className="flex items-start gap-3 p-4 bg-green-500/5 border border-green-500/10 rounded-xl">
                                   <span className="text-green-400 font-black text-xs mt-0.5">→</span>
                                   <span className="text-sm text-slate-300 leading-relaxed">{recommendation}</span>
                                 </li>
                               ))}
                             </ul>
                           </div>
                         )}
                       </div>
                     </div>
                   )}

                   {/* HR Round Eligibility */}
                   {richFeedback.overallScore >= 50 && (
                     <div className="px-4 mb-12 no-print">
                       <div className="glass p-12 rounded-[3rem] border-2 border-green-500/30 shadow-2xl shadow-green-500/20">
                         <div className="flex items-center gap-4 mb-6">
                           <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center">
                             <span className="text-4xl">🎉</span>
                           </div>
                           <div>
                             <h3 className="text-3xl font-black tracking-tight text-green-400">Congratulations!</h3>
                             <p className="text-sm text-slate-400 mt-1">You've qualified for the HR Round</p>
                           </div>
                         </div>
                         <p className="text-slate-300 mb-8 text-lg leading-relaxed">
                           Your technical performance score of <span className="text-green-400 font-black">{richFeedback.overallScore}</span> meets our threshold. 
                           Would you like to proceed to the HR interview round?
                         </p>
                         <div className="flex gap-4">
                           <button 
                             onClick={() => {
                               setShowHrResumeModal(true);
                               setMode(AppMode.HR_LIVE);
                             }}
                             className="flex-1 py-6 bg-green-600 hover:bg-green-500 text-white rounded-2xl font-black text-sm transition-all uppercase tracking-[0.3em] shadow-xl shadow-green-600/30"
                           >
                             Yes, Proceed to HR Round
                           </button>
                           <button 
                             onClick={() => setMode(AppMode.IDLE)}
                             className="px-8 py-6 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black text-sm transition-all border border-white/10"
                           >
                             Not Now
                           </button>
                         </div>
                       </div>
                     </div>
                   )}

                   {/* Recommended Learning Resources */}
                   {richFeedback.youtubeRecs && richFeedback.youtubeRecs.length > 0 && (
                     <div className="px-4 mb-12 no-print">
                       <div className="glass p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
                         <div className="flex items-center gap-3 mb-6">
                           <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-600/30">
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                           </div>
                           <h3 className="text-xl font-black tracking-tight flex items-center gap-3">
                             Recommended Resources
                           </h3>
                         </div>
                         
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                           {richFeedback.youtubeRecs.map((video, i) => {
                             const videoId = video.url.split('v=')[1]?.split('&')[0];
                             return (
                               <a 
                                 key={i} 
                                 href={video.url} 
                                 target="_blank" 
                                 rel="noopener noreferrer"
                                 className="group relative rounded-2xl overflow-hidden border-2 border-white/5 hover:border-red-500/50 transition-all block bg-black/40 hover:bg-black/60"
                               >
                                 <div className="relative w-full pt-[56.25%] bg-slate-800">
                                   {videoId ? (
                                      <img
                                        src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                                        alt={video.title}
                                        className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                      />
                                   ) : (
                                      <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-slate-600">
                                        No Thumbnail
                                      </div>
                                   )}
                                   <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                                     <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-xl">
                                       <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                     </div>
                                   </div>
                                 </div>
                                 <div className="p-4">
                                   <p className="text-xs font-bold text-slate-200 line-clamp-2 leading-relaxed group-hover:text-white transition-colors">{video.title}</p>
                                   <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
                                     <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                     YouTube
                                   </p>
                                 </div>
                               </a>
                             );
                           })}
                         </div>
                       </div>
                     </div>
                   )}

                   <div className="flex gap-5 px-4 mt-12 no-print">
                      <button onClick={() => setMode(AppMode.IDLE)} className="flex-1 py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-3xl font-black text-xs transition-all uppercase tracking-[0.3em]">Command Center</button>
                      <button onClick={handleExportPDF} disabled={isExporting} className="flex-1 py-6 bg-white/5 hover:bg-white/10 text-white rounded-3xl font-black text-xs transition-all border border-white/10 shadow-2xl uppercase tracking-[0.3em] disabled:opacity-50">
                         {isExporting ? 'Exporting...' : 'Export Audit Report (PDF)'}
                      </button>
                   </div>
                </div>
              )}
          </div>
        )}

        {mode === AppMode.HR_RESUME_UPLOAD && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-[#020617] animate-in fade-in duration-500">
             <div className="w-full max-w-2xl glass p-12 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col gap-8">
                <div className="flex flex-col gap-2 items-center text-center">
                   <div className="w-20 h-20 bg-green-500/20 rounded-2xl flex items-center justify-center mb-4">
                     <span className="text-5xl">📄</span>
                   </div>
                   <span className="text-[10px] font-black text-green-500 uppercase tracking-[0.4em]">HR Round - Step 1</span>
                   <h2 className="text-4xl font-black tracking-tight">Upload Your Resume</h2>
                   <p className="text-sm text-slate-400 mt-2">We'll analyze your experience and tailor the interview accordingly</p>
                </div>
                
                {isAnalyzingResume ? (
                  <div className="flex flex-col items-center gap-6 py-12">
                    <div className="w-16 h-16 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
                    <p className="text-lg font-bold text-slate-300">Analyzing your resume...</p>
                  </div>
                ) : (
                  <>
                    <div className="border-2 border-dashed border-white/20 rounded-3xl p-12 hover:border-green-500/50 transition-all cursor-pointer bg-white/5"
                         onClick={() => document.getElementById('resume-upload')?.click()}>
                      <div className="flex flex-col items-center gap-4">
                        <div className="text-6xl">📎</div>
                        <p className="text-lg font-bold">Click to upload resume</p>
                        <p className="text-sm text-slate-500">PDF or TXT format</p>
                      </div>
                      <input 
                        id="resume-upload"
                        type="file" 
                        accept=".pdf,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleResumeUpload(file);
                        }}
                      />
                    </div>
                    
                    <button 
                      onClick={() => setMode(AppMode.INTERVIEW_FEEDBACK)}
                      className="py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-sm transition-all"
                    >
                      Back to Results
                    </button>
                  </>
                )}
             </div>
          </div>
        )}

        {mode === AppMode.HR_LIVE && (
          <div className="h-full w-full relative overflow-hidden bg-[#020617]">
            
            {/* Synthesizing Loader Modal */}
            {isGeneratingHRFeedback && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-8">
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 animate-spin" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(34, 197, 94, 0.2)" strokeWidth="8" />
                      <circle 
                        cx="50" cy="50" r="45" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="8" 
                        className="text-green-500"
                        strokeDasharray="70.7 282.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-black text-white mb-2">Synthesizing Results</h3>
                    <p className="text-slate-400 text-sm">Analyzing your interview performance...</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* HR Resume Upload Modal */}
            {showHrResumeModal && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="w-full max-w-2xl glass p-12 rounded-[2rem] border border-white/10 shadow-2xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom duration-500">
                  <div className="flex flex-col gap-2 items-center text-center">
                    <div className="w-20 h-20 bg-green-500/20 rounded-2xl flex items-center justify-center mb-4">
                      <span className="text-5xl">📄</span>
                    </div>
                    <span className="text-[10px] font-black text-green-500 uppercase tracking-[0.4em]">HR Round</span>
                    <h2 className="text-3xl font-black tracking-tight">Upload Your Resume</h2>
                    <p className="text-sm text-slate-400 mt-2">Please upload your resume in PDF format so I can ask targeted questions based on your experience</p>
                  </div>
                  
                  {hrResumeUploading ? (
                    <div className="flex flex-col items-center gap-6 py-12">
                      <div className="w-16 h-16 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
                      <p className="text-lg font-bold text-slate-300">Processing your resume...</p>
                    </div>
                  ) : (
                    <>
                      <div className="border-2 border-dashed border-white/20 rounded-2xl p-12 hover:border-green-500/50 transition-all cursor-pointer bg-white/5"
                           onClick={() => document.getElementById('hr-resume-upload')?.click()}>
                        <div className="flex flex-col items-center gap-4">
                          <div className="text-5xl">📎</div>
                          <p className="text-lg font-bold">Click to upload your resume</p>
                          <p className="text-sm text-slate-500">PDF format (recommended)</p>
                        </div>
                        <input 
                          id="hr-resume-upload"
                          type="file" 
                          accept=".pdf,.txt"
                          className="hidden"
                          disabled={hrResumeUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleHRResumeUpload(file);
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* Full Screen Camera */}
            <div className="absolute inset-0">
              <CameraView isActive={true} videoRef={videoRef} className="w-full h-full" />
            </div>
            
            {/* Greeting Overlay (Top Center) */}
            {hrAnswersCount === 0 && !showHrResumeModal && (
              <div className="absolute top-0 left-0 right-0 flex items-center justify-center pt-20 z-30 pointer-events-none">
                <div className="glass p-8 rounded-[2rem] border border-green-500/30 shadow-2xl max-w-xl animate-in fade-in slide-in-from-top duration-1000">
                  <p className="text-center text-slate-200 text-lg leading-relaxed">
                    <span className="text-green-400 font-black block mb-2">Welcome, {resumeAnalysis?.candidateName}! 👋</span>
                    Congratulations on clearing the technical round! I'm impressed by your performance. Let's dive deeper into your experience and explore your professional journey.
                  </p>
                </div>
              </div>
            )}
            
            {/* Bottom Control Panel */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-8 z-30">
              <div className="max-w-2xl mx-auto flex items-center justify-end">
                {/* End Button */}
                <button 
                  onClick={async () => { 
                    await cleanupSession(); 
                    generateHRFeedback(); 
                  }}
                  className="ml-6 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-black rounded-full text-sm tracking-wider shadow-xl shadow-green-600/30 transition-all active:scale-95 whitespace-nowrap"
                >
                  End HR Round
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === AppMode.HR_FEEDBACK && hrFeedback && (
          <div className="absolute inset-0 bg-[#020617] p-10 overflow-y-auto animate-in fade-in duration-1000">
              <div className="max-w-6xl mx-auto pb-40">
                   <div className="flex justify-between items-end mb-16 px-4">
                     <div>
                       <span className="text-[12px] font-black text-green-500 uppercase tracking-[0.4em] mb-4 block">HR Round Results</span>
                       <h2 className="text-7xl font-black tracking-tighter">Final Evaluation.</h2>
                       {resumeAnalysis && (
                         <p className="text-lg text-slate-400 mt-4">Candidate: <span className="text-white font-bold">{resumeAnalysis.candidateName}</span></p>
                       )}
                     </div>
                     <div className="text-right">
                       <div className={`text-[12rem] font-black leading-none drop-shadow-2xl ${hrFeedback.overallScore < 50 ? 'text-red-500' : 'text-green-400'}`}>
                         {hrFeedback.overallScore}
                       </div>
                     </div>
                   </div>

                   <div className="grid grid-cols-4 gap-7 mb-12 px-4">
                      {[
                        { label: 'Experience Depth', score: hrFeedback.technical, color: 'text-green-500' },
                        { label: 'Communication', score: hrFeedback.communication, color: 'text-emerald-400' },
                        { label: 'Professional Presence', score: hrFeedback.postureScore, color: 'text-teal-400' },
                        { label: 'Behavioral Fit', score: hrFeedback.fluency, color: 'text-cyan-400' }
                      ].map((m, i) => (
                        <div key={i} className="glass p-10 rounded-[2.5rem] border border-white/10 flex flex-col items-center gap-6 shadow-2xl">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">{m.label}</span>
                          <div className="relative w-32 h-32 flex items-center justify-center">
                             <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                               <circle cx="64" cy="64" r="40" fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                               <circle 
                                 cx="64" cy="64" r="40" 
                                 fill="transparent" 
                                 stroke="currentColor" 
                                 strokeWidth="10" 
                                 strokeDasharray={2 * Math.PI * 40} 
                                 strokeDashoffset={2 * Math.PI * 40 * (1 - m.score / 100)} 
                                 strokeLinecap="round" 
                                 className={`${m.score < 50 ? 'text-red-500' : m.score < 80 ? 'text-orange-400' : m.color} transition-all duration-1000`} 
                               />
                             </svg>
                             <span className="text-2xl font-black tracking-tighter">{m.score}%</span>
                          </div>
                        </div>
                      ))}
                   </div>

                   <div className="px-4 mb-20">
                     <div className="glass p-12 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col gap-10">
                        <div className="flex flex-col gap-4">
                          <h3 className="text-2xl font-black tracking-tight">HR Evaluation Summary</h3>
                          <div className="grid grid-cols-2 gap-10">
                             <div>
                               <label className="text-[9px] font-black text-green-400 uppercase tracking-widest block mb-4">Communication Assessment</label>
                               <p className="text-sm text-slate-400 leading-relaxed italic">"{hrFeedback.speechAnalysis}"</p>
                             </div>
                             <div>
                               <label className="text-[9px] font-black text-green-400 uppercase tracking-widest block mb-4">Behavioral Assessment</label>
                               <p className="text-sm text-slate-400 leading-relaxed italic">"{hrFeedback.postureAnalysis}"</p>
                             </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4">
                           <h3 className="text-xl font-black tracking-tight">Development Areas</h3>
                           <ul className="grid grid-cols-1 gap-3">
                              {hrFeedback.improvementSuggestions.map((s, i) => (
                                <li key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                                   <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                   <span className="text-sm font-bold text-slate-300">{s}</span>
                                </li>
                              ))}
                           </ul>
                        </div>
                     </div>
                   </div>

                   <div className="flex gap-5 px-4 mt-12">
                      <button onClick={() => setMode(AppMode.IDLE)} className="flex-1 py-6 bg-green-600 hover:bg-green-500 text-white rounded-3xl font-black text-xs transition-all uppercase tracking-[0.3em]">Return Home</button>
                      <button onClick={handleExportPDF} disabled={isExporting} className="flex-1 py-6 bg-white/5 hover:bg-white/10 text-white rounded-3xl font-black text-xs transition-all border border-white/10 shadow-2xl uppercase tracking-[0.3em] disabled:opacity-50">
                         Export HR Report
                      </button>
                   </div>
              </div>
          </div>
        )}
      </main>
      {/* Hidden helper for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
