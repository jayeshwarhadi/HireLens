
import { GoogleGenAI, Type } from "@google/genai";
import { AlgorithmType, AnimationStep } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function simulateCode(code: string, language: string, type: AlgorithmType, input: string): Promise<AnimationStep[]> {
  console.log("simulateCode called with:", { codeLen: code.length, language, type, input });
  
  const response = await ai.models.generateContent({
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
  });

  console.log("Gemini response received:", response.text.substring(0, 200));

  try {
    const rawSteps = JSON.parse(response.text);
    console.log("Parsed raw steps count:", rawSteps.length);
    
    const processedSteps = rawSteps.map((s: any) => {
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

      const result = {
        ...s,
        viz: {
          ...s.viz,
          type: type,  // IMPORTANT: Include the algorithm type so Visualizer knows how to render
          data: parsedData,
          pointers: parsedPointers
        }
      };
      
      console.log("Processed step:", { codeLine: result.codeLine, hasData: !!result.viz.data, dataKeys: result.viz.data && typeof result.viz.data === 'object' ? Object.keys(result.viz.data) : 'N/A' });
      return result;
    });
    
    console.log("Returning", processedSteps.length, "animation steps");
    return processedSteps;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}
