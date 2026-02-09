
import { GoogleGenAI, Type } from "@google/genai";
import { AlgorithmType, AnimationStep } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Retry utility with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 2000): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      const isRetryable = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('429');
      if (!isRetryable || attempt === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`API busy, retrying in ${Math.round(delay/1000)}s... (attempt ${attempt + 2}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function simulateCode(code: string, language: string, type: AlgorithmType, input: string): Promise<AnimationStep[]> {
  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the following ${language} code and simulate its execution for the input "${input}". 
    Return a list of steps for visualization. 
    The algorithm category is: ${type}.

    CRITICAL DATA FORMATS for "viz.data":
    - ARRAY: A JSON array of values (e.g., [1, 2, 3]).
    - STRINGS: A JSON string (e.g., "hello") or array of chars (["h", "e", "l", "l", "o"]).
    - LINKED_LIST: A nested object { value: 1, next: { value: 2, next: null } }.
    - BINARY_TREE: A nested object { value: 1, left: { value: 2 }, right: { value: 3 } }.
    - GRAPH: { nodes: [{id: "1"}, {id: "2"}], edges: [{from: "1", to: "2"}] }.
    - DP: A 2D array representing the memoization table (e.g., [[0,1],[1,2]]).
    - BITS: A string of 0s and 1s (e.g., "00101011").

    For each step, provide:
    1. The codeLine (integer).
    2. A message explaining the logic.
    3. The viz object with the current state of the main data structure in "data" (stringified JSON).
    4. Optional "pointers" as stringified JSON (e.g., '{"i": 2, "curr": "node_1"}').

    Code:
    ${code}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            codeLine: { type: Type.INTEGER },
            message: { type: Type.STRING },
            viz: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                data: { type: Type.STRING, description: "JSON stringified state of the data structure" },
                pointers: { type: Type.STRING, description: "JSON stringified pointers like { \"i\": 0 }" }
              },
              required: ["type", "data"]
            }
          },
          required: ["codeLine", "message", "viz"]
        }
      }
    }
  }));

  try {
    const rawSteps = JSON.parse(response.text);
    return rawSteps.map((s: any) => {
      let parsedData;
      try {
        parsedData = JSON.parse(s.viz.data);
      } catch {
        // Fallback for cases where Gemini returns raw string instead of stringified JSON string
        parsedData = s.viz.data;
      }

      let parsedPointers = {};
      try {
        parsedPointers = s.viz.pointers ? JSON.parse(s.viz.pointers) : {};
      } catch {
        parsedPointers = {};
      }

      return {
        ...s,
        viz: {
          ...s.viz,
          data: parsedData,
          pointers: parsedPointers
        }
      };
    });
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}
