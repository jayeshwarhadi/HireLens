import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
if (!apiKey) {
  console.error("❌ API_KEY not found. Set GEMINI_API_KEY or API_KEY environment variable.");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

async function check() {
  console.log("Checking API Key...");
  try {
    const list = await ai.models.list();
    console.log("✅ API Key is Valid! (Success listing models)");
  } catch (e) {
    console.log("❌ API Key check failed:", e.message);
  }
}

check();