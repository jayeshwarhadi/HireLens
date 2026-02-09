
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import CodeEditor from './components/CodeEditor';
import VoiceVisualizer from './components/VoiceVisualizer';
import CodeAudit from './components/CodeAudit';
import { InterviewStatus, Message, FeedbackData } from './types';
import { decode, decodeAudioData, float32ToPcmBase64 } from './utils/audio-helpers';

const MicIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 013 3v5a3 3 0 01-6 0V7a3 3 0 013-3z" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H10a1 1 0 01-1-1v-4z" />
  </svg>
);

const App: React.FC = () => {
  const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.IDLE);
  const [code, setCode] = useState<string>(`// Write your solution here\nfunction solution() {\n\n}`);
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcription, setTranscription] = useState<string>('');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [showAudit, setShowAudit] = useState<boolean>(false);
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const snapshotIntervalRef = useRef<number | null>(null);
  const cameraIntervalRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const SAMPLE_RATE_IN = 16000;
  const SAMPLE_RATE_OUT = 24000;

  const addMessage = (role: 'interviewer' | 'candidate', text: string) => {
    setMessages(prev => [...prev, { role, text, timestamp: Date.now() }]);
  };

  const sendCodeSnapshot = useCallback(() => {
    if (!sessionRef.current || status !== InterviewStatus.ACTIVE) return;

    // ═══════════════════════════════════════════════════════════════════════════════
    // MULTIMODAL LIVE VISION: CODE SNAPSHOT TRANSMISSION
    // ═══════════════════════════════════════════════════════════════════════════════
    // This function implements a critical part of the interview system:
    // 1. CODE STATE CAPTURE: Monitors the `code` state variable (updated on every keystroke)
    // 2. VISUAL RASTERIZATION: Renders code onto an off-screen HTML5 canvas with formatting
    // 3. IMAGE ENCODING: Converts the canvas to a Base64-encoded JPEG
    // 4. REAL-TIME TRANSMISSION: Sends the JPEG to Gemini via session.sendRealtimeInput()
    // 5. AUTONOMOUS INTERVAL: Runs every 8 seconds via useEffect (no user action needed)
    //
    // Why this approach?
    // - Gemini's multimodal models are excellent at understanding code visually
    // - Unlike raw text, visual snapshots allow Gemini to see:
    //   * Indentation and structure
    //   * Comments and formatting
    //   * Errors more naturally (e.g., mismatched braces)
    // - It mimics how a human interviewer would "watch" you code
    // - Reduces token usage compared to constant text updates
    // ═══════════════════════════════════════════════════════════════════════════════

    // Step 1: Create a high-resolution virtual canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1024;   // High-res for clarity
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Step 2: Draw editor styling to match IDE appearance
      ctx.fillStyle = '#0f172a';  // Dark editor background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Add title header
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 28px "Fira Code", monospace';
      ctx.fillText("CANDIDATE CODE SNAPSHOT", 40, 50);
      
      // Add separator line
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(40, 70);
      ctx.lineTo(980, 70);
      ctx.stroke();
      
      // Step 3: Render the code text with line numbers
      ctx.font = '22px "Fira Code", monospace';
      ctx.fillStyle = '#94a3b8';
      const lines = code.split('\n');
      lines.forEach((line, i) => {
        // Format: "001 | function solution() {"
        const lineNumber = (i + 1).toString().padStart(3, '0');
        ctx.fillText(`${lineNumber} | ${line}`, 40, 110 + i * 30);
      });
      
      // Step 4: Convert canvas to JPEG and send
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            // Extract Base64 from data URL
            const base64 = (reader.result as string).split(',')[1];
            
            // Step 5: TRANSMIT TO GEMINI LIVE SESSION
            // This sends the visual representation of the code to Gemini's multimodal model
            sessionRef.current?.sendRealtimeInput({
              media: { 
                data: base64, 
                mimeType: 'image/jpeg' 
              }
            });
            
            console.log('[MULTIMODAL VISION] Code snapshot sent to Gemini');
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.7); // 0.7 quality balances clarity vs transmission speed
    }
  }, [code, status]);

  const sendCameraFrame = useCallback(() => {
    // ═══════════════════════════════════════════════════════════════════════════════
    // CAMERA FRAME TRANSMISSION (Part of Multimodal Vision)
    // ═══════════════════════════════════════════════════════════════════════════════
    // Captures live video of the candidate and transmits it to Gemini
    // This enables the AI interviewer to observe:
    // - Facial expressions (confidence, confusion, frustration)
    // - Body language (engagement, stress levels)
    // - Non-verbal communication (head nods, hand gestures)
    // 
    // This creates a more human-like interview experience where the AI can respond
    // to the candidate's emotional state, not just their code.
    // ═══════════════════════════════════════════════════════════════════════════════
    
    if (!sessionRef.current || status !== InterviewStatus.ACTIVE || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Only capture if video data is ready
    if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
      // Match canvas dimensions to video stream
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw the current video frame onto the canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to JPEG and transmit
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            // Extract Base64 from data URL
            const base64 = (reader.result as string).split(',')[1];
            
            // Send to Gemini's multimodal model via live session
            sessionRef.current?.sendRealtimeInput({
              media: { 
                data: base64, 
                mimeType: 'image/jpeg' 
              }
            });
            
            console.log('[MULTIMODAL VISION] Camera frame sent to Gemini');
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.6); // 0.6 quality balances video quality vs transmission speed
    }
  }, [status]);

  const startInterview = async () => {
    if (status !== InterviewStatus.IDLE) return;

    try {
      setStatus(InterviewStatus.CONNECTING);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_IN });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_OUT });
      
      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { width: 640, height: 480 } 
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(InterviewStatus.ACTIVE);
            
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (sessionRef.current) {
                const inputData = e.inputBuffer.getChannelData(0);
                const base64Data = float32ToPcmBase64(inputData);
                sessionRef.current.sendRealtimeInput({ 
                  media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } 
                });
              }
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);

            sendCodeSnapshot();
            sendCameraFrame();
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const buffer = await decodeAudioData(decode(audioData), ctx, SAMPLE_RATE_OUT, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.outputTranscription) {
              setTranscription(prev => prev + message.serverContent!.outputTranscription!.text);
            }

            if (message.serverContent?.turnComplete) {
              setTranscription(current => {
                if (current.trim()) {
                  addMessage('interviewer', current);
                  
                  // DETECT AND TRACK CURRENT QUESTION
                  const text = current;
                  const lowercaseText = text.toLowerCase();
                  if ((lowercaseText.includes("?") || lowercaseText.includes("question") || lowercaseText.includes("challenge")) && text.length > 20) {
                     setCurrentQuestion(text.trim());
                     console.log('[QUESTION DETECTED]', text.trim());
                  }
                }
                return '';
              });
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Interview Error:', e);
            setStatus(InterviewStatus.ERROR);
          },
          onclose: () => setStatus(InterviewStatus.IDLE)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: `You are a Senior Principal Engineer at Google. 
          YOUR MISSION: Conduct a rigorous technical coding interview with real-time multimodal vision.
          
          ═══════════════════════════════════════════════════════════════════════════════
          MULTIMODAL LIVE VISION SYSTEM
          ═══════════════════════════════════════════════════════════════════════════════
          
          WHAT YOU RECEIVE:
          1. **Camera Frames** (every 2 seconds): Live video of the candidate at their desk
             - You can see their facial expressions, body language, confidence level
             - Use this to offer encouragement, detect confusion, gauge understanding
          
          2. **Code Snapshots** (every 8 seconds): Visual JPEG images of their code editor
             - The code is rendered on a canvas with line numbers and IDE-style formatting
             - This is NOT raw text—it's a visual representation
             - You can directly observe syntax errors, indentation issues, structural problems
             - Analyze the code visually, as a human code reviewer would
          
          HOW TO INTERPRET CODE SNAPSHOTS:
          - Read the code from the image like you would a screenshot
          - Look for: syntax errors, logic gaps, unmatched braces, incomplete functions
          - Follow the line numbers to reference specific lines when giving feedback
          - If you see a bug, explain it as you see it visually (e.g., "I notice line 5...")
          
          ═══════════════════════════════════════════════════════════════════════════════
          INTERVIEW PHASES
          ═══════════════════════════════════════════════════════════════════════════════
          
          PHASE 1 (INITIALIZATION): 
          - Greet the candidate warmly. Comment on their camera presence (e.g., "Good to see you")
          - This shows you can see them, building rapport
          - Present ONE specific coding challenge immediately. Pick one: 
            * "Implement a function to find the longest substring without repeating characters."
            * "Given a string, check if it is a valid palindrome after removing at most one character."
            * "Implement a basic rate limiter using a sliding window."
          
          PHASE 2 (LIVE CODING SUPPORT - Autonomous Vision Mode):
          - Monitor the code snapshots as they arrive automatically every 8 seconds
          - Watch the camera for signs of confusion, struggle, or confidence
          - DO NOT interrupt unless they ask for help or you notice critical errors
          - If they look stuck (hesitation, confusion in body language):
            * Offer subtle encouragement: "You're on the right track!"
            * Ask them to walk through their logic: "Tell me your approach so far"
          - If you spot syntax errors in the code snapshot:
            * Give gentle hints without spoiling: "I see an issue on line 12. What do you think the problem might be?"
          - If they're silent for extended time:
            * Check their code snapshot → If incomplete, ask: "How's the code coming along?"
            * Interactive check: "Can you talk through your approach?"
          
          PHASE 3 (CODE ANALYSIS - When Candidate Clicks "ANALYSE CODE"):
          When the interview enters analysis mode (you receive an explicit ANALYSIS REQUEST):
          
          **IF CODE IS CORRECT & COMPLETE**:
          1. Start: "Excellent! Your code is correct!"
          2. Praise: Reference what they did well (algorithm choice, clean code, efficiency)
          3. Complexity: Discuss time/space complexity (e.g., "This runs in O(n) time and O(1) space")
          4. Ask: "Would you like to optimize further or discuss edge cases?"
          5. Conclude: "Great work! Let's move to the next challenge."
          6. Present a NEW and DIFFERENT problem - increase difficulty slightly
          
          **IF CODE IS WRONG, INCOMPLETE, OR HAS BUGS**:
          1. Start: "I see some issues with your code."
          2. Identify: Reference the visual code snapshot: "Looking at line X, I notice..."
          3. Guide: Provide the APPROACH without spoiling the exact solution
          4. Hint: Suggest direction: "You might want to use a Set here for O(1) lookups"
          5. Encourage: "Try revising and resubmit. I'm here to help!"
          6. Wait: Let them fix their code before moving ahead
          
          ═══════════════════════════════════════════════════════════════════════════════
          CRITICAL BEHAVIORAL GUIDELINES
          ═══════════════════════════════════════════════════════════════════════════════
          
          1. **Always Use Voice**: Every response should be natural spoken language (not text)
          2. **Reference You Actually See**: Use details from the camera/code images
             - "I can see you're thinking..." (from camera)
             - "Looking at line 5..." (from code snapshot)
          3. **Be Conversational**: Act like a human interviewer, not a robot
          4. **Track Progress**: Remember what problem they're on. Never repeat the same challenges.
          5. **Adapt Difficulty**: After a correct solution, present a harder challenge
          6. **Encourage Authentically**: If they struggle, offer real help without giving away the answer
          7. **Respect the Interactive Model**: You're watching them code in real-time—treat it like live pairing
          `
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err) {
      console.error('Start failed:', err);
      setStatus(InterviewStatus.ERROR);
    }
  };

  const endInterview = () => {
    if (sessionRef.current) sessionRef.current.close();
    if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
    if (cameraIntervalRef.current) clearInterval(cameraIntervalRef.current);
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    sessionRef.current = null;
    setStatus(InterviewStatus.IDLE);
    setMessages([]);
  };

  const submitCode = () => {
    if (!sessionRef.current) return;
    sendCodeSnapshot();
    addMessage('candidate', '[System] Code Submitted for Final Review');
  };

  const handleAnalyzeCode = () => {
    if (!sessionRef.current || status !== InterviewStatus.ACTIVE || !code.trim()) return;
    
    try {
      // Step 1: Immediately send code snapshot as image for visual reference
      console.log('[STEP 1] Capturing and sending code snapshot...');
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 768;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Dark background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Header
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 32px "Courier New", monospace';
        ctx.fillText('CODE ANALYSIS REQUEST', 40, 60);
        
        // Separator
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(40, 80);
        ctx.lineTo(980, 80);
        ctx.stroke();
        
        // Code content
        ctx.font = '18px "Courier New", monospace';
        ctx.fillStyle = '#94a3b8';
        const lines = code.split('\n');
        lines.forEach((line, i) => {
          ctx.fillText(`${(i + 1).toString().padStart(3, '0')} | ${line}`, 40, 130 + i * 24);
        });
        
        // Convert to blob and send as image
        canvas.toBlob((blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              try {
                const base64 = (reader.result as string).split(',')[1];
                console.log('[STEP 1 SUCCESS] Code snapshot sent as image');
                sessionRef.current?.sendRealtimeInput({
                  media: { data: base64, mimeType: 'image/jpeg' }
                });
              } catch (err) {
                console.error('[STEP 1 ERROR]', err);
              }
            };
            reader.readAsDataURL(blob);
          }
        }, 'image/jpeg', 0.85);
      }
      
      // Step 2: Send analysis request prompt for voice feedback
      addMessage('candidate', '[System] Code snapshot sent. Requesting AI analysis...');
      
      const context = currentQuestion ? `\n\nCONTEXT: The candidate was asked: "${currentQuestion}"\nAnalyze the code SPECIFICALLY in the context of solving this problem. Explain clearly if the solution fails to address the specific requirements of the question.` : '';

      const analysisFeedbackPrompt = `ANALYZE CODE SUBMISSION - PROVIDE VOICE FEEDBACK${context}

A candidate has submitted the following code for this challenge. Analyze it and provide detailed voice feedback.

CANDIDATE'S CODE:
\`\`\`typescript
${code}
\`\`\`

ANALYSIS INSTRUCTIONS:
You are a senior engineer conducting an interview. Evaluate the code and give immediate voice feedback.

EVALUATION CRITERIA:
1. Is the code syntactically correct?
2. Does it correctly solve the problem/challenge given?
3. What is the time and space complexity?
4. Are there any bugs, edge cases not handled, or logic errors?
5. Is the code clean, readable, and professional?

YOUR VOICE RESPONSE MUST BE:

**IF THE CODE IS CORRECT AND SOLVES THE PROBLEM:**
- Start with: "Excellent! Your code is correct!"
- Praise what they did well (algorithm choice, clarity, structure, etc)
- Briefly discuss time complexity: [mention O(n), O(log n), etc]
- Ask: "Would you like to optimize further or discuss any edge cases?"
- Then say: "Great work! Let's move to the next challenge."
- Present a NEW and DIFFERENT coding challenge (increase difficulty slightly)

**IF THE CODE IS WRONG, INCOMPLETE, OR HAS BUGS:**
- Start with: "I see some issues with your code."
- Explain EXACTLY what's wrong (e.g., "Your loop condition is incorrect", "You're not handling the edge case where...", "The logic here doesn't account for...")
- Guide them toward the APPROACH: "Think about how you would...", "Consider what happens when...", "Have you thought about..."
- Give hint WITHOUT spoiling: "You might want to use a [data structure/approach] here"
- End with: "Try revising and submit again when ready. I'm here to help!"
- Wait for their next attempt

TONE: Professional mentor. Be encouraging but honest. Speak directly to them.
ALWAYS USE VOICE. Speak naturally as if coaching them in real-time.`;

      console.log('[STEP 2] Sending analysis prompt to AI for voice feedback');
      sessionRef.current.send(analysisFeedbackPrompt);
      addMessage('candidate', '[System] Analysis prompt sent. Waiting for voice feedback...');
      
    } catch (err) {
      console.error('[ANALYZE CODE ERROR]', err);
      addMessage('interviewer', 'Failed to analyze your code. Please try again.');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTONOMOUS MULTIMODAL VISION SYNC
  // ═══════════════════════════════════════════════════════════════════════════════
  // This effect sets up the autonomous background transmission of code and camera frames
  // The interviewer receives a constant stream of visual context without needing user input.
  // This allows Gemini to proactively monitor code changes and candidate behavior.
  // ═══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (status === InterviewStatus.ACTIVE) {
      // CODE SNAPSHOTS: Every 8 seconds, capture and send the latest code state
      // This interval ensures Gemini always has a fresh visual of the code editor
      // Timing: 8 seconds gives enough time to see typing without excessive updates
      const codeInterval = window.setInterval(sendCodeSnapshot, 8000);
      
      // CAMERA FRAMES: Every 2 seconds, transmit the candidate's video feed  
      // This allows Gemini to observe facial expressions, body language, confidence
      // Timing: 2 seconds is fast enough to detect confusion but not excessive
      const camInterval = window.setInterval(sendCameraFrame, 2000);
      
      // Store interval IDs for cleanup
      snapshotIntervalRef.current = codeInterval;
      cameraIntervalRef.current = camInterval;
      
      // Cleanup: Stop transmission when interview ends
      return () => {
        window.clearInterval(codeInterval);
        window.clearInterval(camInterval);
      };
    }
  }, [status, sendCodeSnapshot, sendCameraFrame]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#020617] text-slate-100 overflow-hidden selection:bg-blue-500/30 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.1),transparent)] pointer-events-none"></div>

      {/* Header */}
      <header className="relative flex items-center justify-between px-8 py-4 border-b border-slate-800/50 bg-slate-900/20 backdrop-blur-xl z-20">
        <div className="flex items-center space-x-4">
          <div className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative p-2 bg-slate-900 rounded-lg border border-slate-700">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">GEMINI ELITE</h1>
            <div className="flex items-center space-x-2">
               <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Live Engineering Assessment</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {status === InterviewStatus.ACTIVE && (
            <>
              
              <button 
                onClick={submitCode}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
              >
                Submit Code
              </button>

              <button 
                onClick={handleAnalyzeCode}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-orange-900/20 transition-all active:scale-95 flex items-center space-x-2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Analyse Code</span>
              </button>
            </>
          )}

          <button 
            onClick={() => setShowAudit(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/20 transition-all active:scale-95"
          >
            Audit Code
          </button>

          {status === InterviewStatus.IDLE || status === InterviewStatus.ERROR ? (
            <button 
              onClick={startInterview}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg transition-all font-bold shadow-xl shadow-blue-600/20 active:scale-95 group"
            >
              <MicIcon />
              <span>Start Interview</span>
            </button>
          ) : (
            <button 
              onClick={endInterview}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-rose-900/20 hover:text-rose-400 text-slate-400 px-5 py-2.5 rounded-lg transition-all font-bold border border-slate-700 active:scale-95"
            >
              <StopIcon />
              <span>End Session</span>
            </button>
          )}
        </div>
      </header>

      {/* Main UI */}
      <main className="relative flex-grow flex p-4 space-x-4 overflow-hidden z-10">
        {/* Editor Container */}
        <div className="flex-grow flex flex-col h-full min-w-0">
          <CodeEditor 
            code={code} 
            onChange={setCode} 
            language="typescript" 
          />
        </div>

        {/* Sidebar */}
        <div className="w-[360px] flex flex-col space-y-4 h-full flex-shrink-0">
          
          {/* Candidate Camera Feed */}
          <div className="relative aspect-video bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl group">
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-500"
            />
            {status !== InterviewStatus.ACTIVE && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                <div className="text-center space-y-2">
                  <svg className="w-8 h-8 text-slate-700 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Camera Offline</p>
                </div>
              </div>
            )}
            <div className="absolute bottom-3 left-3 bg-slate-900/60 backdrop-blur-md px-2 py-1 rounded-md border border-slate-700/50 flex items-center space-x-2">
              <div className={`w-1.5 h-1.5 rounded-full ${status === InterviewStatus.ACTIVE ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
              <span className="text-[9px] font-bold text-slate-300 uppercase">Candidate (You)</span>
            </div>
          </div>

          {/* Interviewer Console */}
          <div className="flex flex-col bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/50 flex-grow shadow-2xl overflow-hidden min-h-0">
            <div className="p-4 border-b border-slate-800/50 flex items-center justify-between bg-slate-800/20">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">AI Interviewer</p>
                  <p className="text-xs font-bold text-slate-200">Senior Engineer</p>
                </div>
              </div>
              {status === InterviewStatus.CONNECTING && (
                <div className="flex space-x-0.5">
                   <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
                   <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0.1s]"></div>
                   <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                </div>
              )}
            </div>

            <div className="px-4 py-3">
              <VoiceVisualizer 
                isListening={status === InterviewStatus.ACTIVE} 
                isSpeaking={!!transcription} 
              />
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-30 grayscale">
                  <div className="p-4 bg-slate-800 rounded-full border border-slate-700">
                     <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 013 3v5a3 3 0 01-6 0V7a3 3 0 013-3z" />
                     </svg>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                    Awaiting Connection...<br/>Start session to begin.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'candidate' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-1`}>
                  <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                    m.role === 'candidate' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700/50'
                  }`}>
                    {m.text}
                  </div>
                  <span className="text-[8px] text-slate-600 mt-1 font-bold uppercase tracking-widest">
                    {m.role} • {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              {transcription && (
                <div className="flex flex-col items-start opacity-60">
                  <div className="max-w-[90%] rounded-xl px-3 py-2 text-xs bg-slate-800/50 text-slate-300 rounded-bl-none border border-slate-700/30 italic">
                    {transcription}...
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="px-8 py-2 border-t border-slate-800/50 bg-slate-900/40 backdrop-blur-md flex items-center justify-between text-[9px] text-slate-500 font-bold uppercase tracking-widest z-20">
        <div className="flex items-center space-x-6">
          <div className="flex items-center">
            <div className={`w-1.5 h-1.5 rounded-full mr-2 shadow-sm ${status === InterviewStatus.ACTIVE ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-slate-700'}`}></div>
            <span>Status: {status}</span>
          </div>
          <div className="flex items-center space-x-1 border-l border-slate-800 pl-6">
             <svg className="w-2.5 h-2.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             <span>Stream Sync: Active</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-slate-700">Protected Workspace</span>
          <div className="w-1 h-1 bg-slate-800 rounded-full"></div>
          <span>Env: v4.2.0-PRO</span>
        </div>
      </footer>

      {/* Hidden helper for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Code Audit Modal */}
      {showAudit && (
        <CodeAudit 
          code={code} 
          language="typescript" 
          onClose={() => setShowAudit(false)}
          messages={messages.map(m => ({role: m.role, text: m.text}))}
        />
      )}
    </div>
  );
};

export default App;
