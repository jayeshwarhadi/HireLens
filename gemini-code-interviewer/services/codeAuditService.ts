/**
 * Code Audit Service - AI-Powered Real-Time Analysis
 * 
 * Sends code to Google Generative AI and gets comprehensive feedback:
 * - Correctness analysis
 * - Efficiency (time/space complexity)
 * - Code structure & readability
 * - Best practices compliance
 */

import { GoogleGenAI } from '@google/genai';

export interface CodeIssue {
  type: 'error' | 'warning' | 'info' | 'suggestion';
  category: 'correctness' | 'efficiency' | 'structure' | 'best-practice';
  severity: 'critical' | 'high' | 'medium' | 'low';
  line?: number;
  message: string;
  suggestion?: string;
}

export interface AuditResult {
  code: string;
  language: string;
  timestamp: number;
  
  // Scoring (0-100, matching interview feedback structure)
  scores: {
    correctness: number;
    efficiency: number;
    readability: number;
    bestPractices: number;
    overall: number;
  };
  
  // Detailed findings
  issues: CodeIssue[];
  
  // Summary feedback (matching interview verbal review style)
  summary: {
    strengths: string[];
    improvements: string[];
    complexityAnalysis?: string;
    finalRecommendation: string;
  };
}

export class CodeAuditService {
  /**
   * Main entry point: Analyze code using AI with detailed evaluation
   */
  static async analyzeCode(
    code: string, 
    language: string = 'typescript', 
    questionContext?: string,
    messages: {role: string, text: string}[] = []
  ): Promise<AuditResult> {
    const timestamp = Date.now();
    
    try {
      // Send to Gemini AI for comprehensive analysis
      const ai = new GoogleGenAI({ apiKey: process.env.REACT_APP_API_KEY || process.env.API_KEY });
      
      const transcriptText = messages.length > 0
        ? messages.map(m => `[${m.role.toUpperCase()}]: ${m.text}`).join('\n')
        : "No interview transcript available.";

      const contextPrompt = questionContext 
        ? `\n\nCONTEXT - THE CANDIDATE WAS ASKED THE FOLLOWING QUESTION:\n"${questionContext}"\n\nIMPORTANT: Evaluate if the code CORRECTLY solves THIS specific problem. Points should be deducted significantly if the solution does not address the question requirements, even if the code itself is valid.` 
        : '';

      const analysisPrompt = `You are an expert code reviewer conducting a professional code audit. Analyze this code thoroughly and provide structured feedback.${contextPrompt}

INTERVIEW TRANSCRIPT (for context on intent and explanation):
\`\`\`text
${transcriptText}
\`\`\`

CODE TO ANALYZE:
\`\`\`${language}
${code}
\`\`\`

PROVIDE ANALYSIS IN THIS EXACT JSON FORMAT (no markdown, pure JSON):
{
  "correctness_score": <0-100>,
  "correctness_issues": [
    {"severity": "critical|high|medium|low", "message": "...", "suggestion": "..."},
    ...
  ],
  "efficiency_score": <0-100>,
  "efficiency_issues": [
    {"severity": "critical|high|medium|low", "message": "...", "suggestion": "..."},
    ...
  ],
  "readability_score": <0-100>,
  "readability_issues": [
    {"severity": "critical|high|medium|low", "message": "...", "suggestion": "..."},
    ...
  ],
  "best_practices_score": <0-100>,
  "best_practices_issues": [
    {"severity": "critical|high|medium|low", "message": "...", "suggestion": "..."},
    ...
  ],
  "strengths": ["strength 1", "strength 2", ...],
  "improvements": ["improvement 1", "improvement 2", ...],
  "complexity_analysis": "time and space complexity explanation",
  "final_recommendation": "overall assessment and recommendation"
}

EVALUATION CRITERIA:
1. **Correctness**: Is the code syntactically correct? Does it solve the problem? Any logic errors or edge case issues?
2. **Efficiency**: Time/space complexity? Optimization opportunities? Unnecessary operations?
3. **Readability**: Variable naming, comments, structure, formatting?
4. **Best Practices**: TypeScript types, error handling, design patterns, professional standards?

Be thorough but fair. Rate each criterion from 0-100 where 100 is perfect.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: analysisPrompt,
      });

      const analysisText = response.text;
      
      // Extract JSON from response (might have markdown code blocks)
      let analysisData: any;
      try {
        // Try to parse directly
        analysisData = JSON.parse(analysisText);
      } catch (e) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          analysisData = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse AI response as JSON');
        }
      }

      // Build issues array from AI response
      const issues: CodeIssue[] = [];
      
      // Add correctness issues
      (analysisData.correctness_issues || []).forEach((issue: any) => {
        issues.push({
          type: this.severityToType(issue.severity),
          category: 'correctness',
          severity: issue.severity,
          message: issue.message,
          suggestion: issue.suggestion
        });
      });

      // Add efficiency issues
      (analysisData.efficiency_issues || []).forEach((issue: any) => {
        issues.push({
          type: this.severityToType(issue.severity),
          category: 'efficiency',
          severity: issue.severity,
          message: issue.message,
          suggestion: issue.suggestion
        });
      });

      // Add readability issues
      (analysisData.readability_issues || []).forEach((issue: any) => {
        issues.push({
          type: this.severityToType(issue.severity),
          category: 'structure',
          severity: issue.severity,
          message: issue.message,
          suggestion: issue.suggestion
        });
      });

      // Add best practices issues
      (analysisData.best_practices_issues || []).forEach((issue: any) => {
        issues.push({
          type: this.severityToType(issue.severity),
          category: 'best-practice',
          severity: issue.severity,
          message: issue.message,
          suggestion: issue.suggestion
        });
      });

      // Build scores
      const scores = {
        correctness: analysisData.correctness_score || 75,
        efficiency: analysisData.efficiency_score || 75,
        readability: analysisData.readability_score || 75,
        bestPractices: analysisData.best_practices_score || 75,
        overall: Math.round(
          (analysisData.correctness_score || 75 +
            analysisData.efficiency_score || 75 +
            analysisData.readability_score || 75 +
            analysisData.best_practices_score || 75) / 4
        )
      };

      // Build summary
      const summary = {
        strengths: analysisData.strengths || [],
        improvements: analysisData.improvements || [],
        complexityAnalysis: analysisData.complexity_analysis,
        finalRecommendation: analysisData.final_recommendation || 'Code requires review.'
      };

      return {
        code,
        language,
        timestamp,
        scores,
        issues,
        summary
      };
    } catch (error) {
      console.error('Code audit error:', error);
      
      // Return fallback result on error
      return {
        code,
        language,
        timestamp: Date.now(),
        scores: {
          correctness: 0,
          efficiency: 0,
          readability: 0,
          bestPractices: 0,
          overall: 0
        },
        issues: [{
          type: 'error',
          category: 'correctness',
          severity: 'critical',
          message: 'Failed to analyze code with AI service',
          suggestion: 'Please try again. Ensure your code is valid and the API is accessible.'
        }],
        summary: {
          strengths: [],
          improvements: ['Re-submit code for analysis'],
          finalRecommendation: 'Analysis failed. Please try again.'
        }
      };
    }
  }

  /**
   * Convert severity level to type
   */
  private static severityToType(severity: string): 'error' | 'warning' | 'info' | 'suggestion' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'suggestion';
      default:
        return 'info';
    }
  }
}

