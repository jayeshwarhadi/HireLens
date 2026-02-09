
import React, { useState, useEffect, useRef, useCallback } from 'react';
import CameraBackground from './components/CameraBackground';
import Visualizer from './components/Visualizer';
import { AlgorithmType, VizState, AnimationStep, PanelConfig } from './types';
import { simulateCode } from './services/geminiService';

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
  [AlgorithmType.LINKED_LIST]: 'function reverseList(head) {\n  let prev = null, curr = head;\n  while(curr) {\n    let next = curr.next;\n    curr.next = prev;\n    prev = curr;\n    curr = next;\n  }\n  return prev;\n}',
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
  [AlgorithmType.LINKED_LIST]: '{"value": 1, "next": {"value": 2}}',
  [AlgorithmType.BINARY_TREE]: '{"value": 10, "left": {"value": 5}, "right": {"value": 15}}',
  [AlgorithmType.DP]: '8',
  [AlgorithmType.BITS]: '255',
  [AlgorithmType.GRAPH]: '{"nodes": [{"id": "A"}, {"id": "B"}], "edges": [{"from": "A", "to": "B"}]}'
};

const App: React.FC = () => {
  const [algoType, setAlgoType] = useState<AlgorithmType>(AlgorithmType.ARRAY);
  const [code, setCode] = useState(CODE_TEMPLATES[AlgorithmType.ARRAY]);
  const [language, setLanguage] = useState('javascript');
  const [inputVal, setInputVal] = useState(INPUT_TEMPLATES[AlgorithmType.ARRAY]);
  
  const [steps, setSteps] = useState<AnimationStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Hand tracking state
  const [handData, setHandData] = useState<any>(null);
  const handsRef = useRef<any>(null);

  // Panel states
  const [editorPanel, setEditorPanel] = useState<PanelConfig>({ visible: true, minimized: false, x: 20, y: 80 });

  useEffect(() => {
    // Initialize MediaPipe Hands
    // @ts-ignore
    const hands = new window.Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1, // Increased to 1 for higher spatial accuracy
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    hands.onResults((results: any) => {
      // Sync state update with browser repaint for smoothness
      requestAnimationFrame(() => setHandData(results));
    });

    handsRef.current = hands;
  }, []);

  const onCameraFrame = useCallback((video: HTMLVideoElement) => {
    const process = async () => {
      if (handsRef.current) {
        try {
          await handsRef.current.send({ image: video });
        } catch (e) {
          console.error("MP Frame Error", e);
        }
      }
      requestAnimationFrame(process);
    };
    process();
  }, []);

  const handleRun = async () => {
    setIsLoading(true);
    try {
      const resultSteps = await simulateCode(code, language, algoType, inputVal);
      setSteps(resultSteps);
      setCurrentStepIdx(0);
      if (resultSteps.length > 0) setIsPlaying(true);
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const onAlgoTypeChange = (val: AlgorithmType) => {
    setAlgoType(val);
    setCode(CODE_TEMPLATES[val]);
    setInputVal(INPUT_TEMPLATES[val]);
    setSteps([]);
    setCurrentStepIdx(0);
  };

  useEffect(() => {
    let timer: any;
    if (isPlaying && steps.length > 0) {
      timer = setInterval(() => {
        setCurrentStepIdx(prev => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1800);
    }
    return () => clearInterval(timer);
  }, [isPlaying, steps]);

  return (
    <div className="relative w-full h-full text-white font-sans overflow-hidden bg-black select-none">
      <CameraBackground onFrame={onCameraFrame} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-10 z-50 glass border-none bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center font-bold shadow-[0_0_30px_rgba(79,70,229,0.4)] transform hover:rotate-6 transition-transform">AV</div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter leading-none">AlgoVision <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">Spatial</span></h1>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 mt-1">Immersive AR Code Laboratory</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <select 
            value={algoType} 
            onChange={(e) => onAlgoTypeChange(e.target.value as AlgorithmType)}
            className="bg-white/10 border border-white/20 rounded-2xl px-6 py-2.5 text-sm font-bold outline-none focus:ring-2 ring-blue-500/50 transition-all cursor-pointer backdrop-blur-xl"
          >
            {Object.values(AlgorithmType).map(t => <option key={t} value={t} className="bg-slate-900">{t}</option>)}
          </select>
          <button 
            onClick={handleRun}
            disabled={isLoading}
            className={`px-10 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all shadow-2xl active:scale-95 ${isLoading ? 'bg-slate-700 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/40'}`}
          >
            {isLoading ? 'Analysing...' : 'Visualize Space'}
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="absolute inset-0 z-10 pt-20 flex">
        {/* Left: Editor Panel */}
        <div 
          className={`relative z-40 glass rounded-r-[3rem] transition-all duration-700 overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] h-[calc(100vh-140px)] my-auto ml-0 border-none ${editorPanel.minimized ? 'w-20' : 'w-[420px]'}`}
        >
          <div className="h-16 px-8 flex items-center justify-between bg-white/5 border-b border-white/5">
            {!editorPanel.minimized && <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Code Workspace</span>}
            <button 
              onClick={() => setEditorPanel(p => ({...p, minimized: !p.minimized}))} 
              className="p-3 hover:bg-white/10 rounded-2xl transition-all"
            >
              {editorPanel.minimized ? '→' : '←'}
            </button>
          </div>
          {!editorPanel.minimized && (
            <div className="p-8 flex flex-col gap-8 h-[calc(100%-64px)] overflow-y-auto custom-scrollbar">
              <div className="flex flex-col gap-3">
                <label className="text-[9px] font-black text-white/30 tracking-widest uppercase">Input Data</label>
                <input 
                  value={inputVal} 
                  onChange={e => setInputVal(e.target.value)} 
                  className="bg-black/50 p-4 rounded-2xl text-xs border border-white/10 outline-none focus:ring-2 ring-blue-500/30 transition-all font-mono" 
                />
              </div>
              <div className="flex-1 flex flex-col gap-3">
                <label className="text-[9px] font-black text-white/30 tracking-widest uppercase">Source Code</label>
                <textarea
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="flex-1 bg-black/50 p-5 rounded-[2rem] font-mono text-[14px] outline-none resize-none border border-white/10 leading-relaxed custom-scrollbar shadow-inner"
                  spellCheck={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Interaction Canvas */}
        <div className="flex-1 relative">
           <Visualizer state={steps[currentStepIdx]?.viz || null} handData={handData} />
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-12 left-[55%] -translate-x-1/2 z-50 glass px-10 py-5 rounded-[3.5rem] flex items-center gap-10 border-white/10 shadow-2xl backdrop-blur-3xl">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => { setCurrentStepIdx(Math.max(0, currentStepIdx - 1)); setIsPlaying(false); }} 
            className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10 active:scale-90"
          >
            <svg className="w-6 h-6 rotate-180" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
          
          <button 
            onClick={() => setIsPlaying(!isPlaying)} 
            className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/40 hover:scale-105 transition-all active:scale-90"
          >
            {isPlaying ? (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg className="w-10 h-10 ml-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>

          <button 
            onClick={() => { setCurrentStepIdx(Math.min(steps.length - 1, currentStepIdx + 1)); setIsPlaying(false); }} 
            className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10 active:scale-90"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <div className="hidden md:flex flex-col gap-2 w-40">
           <div className="flex justify-between text-[9px] font-black tracking-widest text-white/40 uppercase">
             <span>Simulation Frame</span>
             <span>{currentStepIdx + 1} / {steps.length || 0}</span>
           </div>
           <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
             <div 
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" 
              style={{ width: `${steps.length > 0 ? ((currentStepIdx + 1) / steps.length) * 100 : 0}%` }}
             />
           </div>
        </div>
      </div>

      {/* AR Hints */}
      <div className="absolute top-28 right-12 z-0 text-right">
        <p className="text-[11px] font-black tracking-[0.4em] text-blue-500 mb-2 uppercase drop-shadow-xl">Precision AR Gestures</p>
        <div className="space-y-1 opacity-50">
          <p className="text-xs font-bold leading-relaxed">Pinch index/thumb to grab blocks</p>
          <p className="text-xs font-bold leading-relaxed">Overlap items to trigger spatial swap</p>
          <p className="text-xs font-bold leading-relaxed">Clamped boundaries for stability</p>
        </div>
      </div>
    </div>
  );
};

export default App;
