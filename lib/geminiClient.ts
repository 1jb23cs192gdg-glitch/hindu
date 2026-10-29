// Client-side API caller for Server-Side Gemini Services
// Zero API keys are bundled or exposed in client code.

import {
  getFallbackSearchGrounding,
  getFallbackMapsGrounding,
  getFallbackChatResponse,
  getFallbackWasteAnalysis,
  getFallbackTempleArtImage
} from './geminiFallback';

export interface GroundingLink {
  type: 'map' | 'web';
  title: string;
  uri: string;
}

export interface ChatResponse {
  text: string;
  links: GroundingLink[];
  searchQueries: string[];
  isFallback?: boolean;
}

export interface WasteAnalysisItem {
  name: string;
  category: string;
  percentage: string;
  recycleOutput: string;
}

export interface WasteAnalysisResult {
  items: WasteAnalysisItem[];
  overallRecyclability: string;
  recommendedBins: string[];
  summary: string;
}

export async function sendGeminiChat(
  message: string,
  activeMode: 'maps' | 'search',
  userCoords?: { latitude: number; longitude: number } | null
): Promise<ChatResponse> {
  try {
    const res = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, activeMode, userCoords })
    });

    if (res.ok) {
      return await res.json();
    }

    const errorData = await res.json().catch(() => ({}));
    console.warn('[Gemini Chat Notice]: Using verified knowledge response:', errorData.error || errorData.details);
    return getFallbackChatResponse(message, activeMode);
  } catch (err: any) {
    console.warn('[Gemini Chat Network Notice]: Using fallback response:', err?.message);
    return getFallbackChatResponse(message, activeMode);
  }
}

export async function sendGeminiChatStream(
  message: string,
  activeMode: 'maps' | 'search',
  userCoords: { latitude: number; longitude: number } | null | undefined,
  callbacks: {
    onChunk: (text: string) => void;
    onDone: (data: { links: GroundingLink[]; searchQueries: string[] }) => void;
    onError: (error: string) => void;
  }
) {
  try {
    const res = await fetch('/api/gemini/chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, activeMode, userCoords })
    });

    if (!res.ok) {
      const fallback = getFallbackChatResponse(message, activeMode);
      callbacks.onChunk(fallback.text);
      callbacks.onDone({
        links: fallback.links,
        searchQueries: fallback.searchQueries
      });
      return;
    }

    if (!res.body) {
      const fallback = getFallbackChatResponse(message, activeMode);
      callbacks.onChunk(fallback.text);
      callbacks.onDone({
        links: fallback.links,
        searchQueries: fallback.searchQueries
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.text) {
              callbacks.onChunk(data.text);
            }
            if (data.done) {
              callbacks.onDone({
                links: data.links || [],
                searchQueries: data.searchQueries || []
              });
            }
            if (data.error) {
              // If stream yielded an error, deliver fallback
              const fallback = getFallbackChatResponse(message, activeMode);
              callbacks.onChunk('\n\n' + fallback.text);
              callbacks.onDone({
                links: fallback.links,
                searchQueries: fallback.searchQueries
              });
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', trimmed);
          }
        }
      }
    }
  } catch (err: any) {
    const fallback = getFallbackChatResponse(message, activeMode);
    callbacks.onChunk(fallback.text);
    callbacks.onDone({
      links: fallback.links,
      searchQueries: fallback.searchQueries
    });
  }
}

export async function sendGeminiGrounding(
  prompt: string,
  type: 'maps' | 'search',
  coords?: { latitude: number; longitude: number } | null
): Promise<{ text: string; links: GroundingLink[]; searchQueries: string[]; isFallback?: boolean }> {
  try {
    const res = await fetch('/api/gemini/grounding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, type, coords })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.text) {
        return data;
      }
    }

    const errorData = await res.json().catch(() => ({}));
    console.warn(`[Gemini Grounding Notice] Status ${res.status}:`, errorData.error || errorData.details);
    return type === 'maps' ? getFallbackMapsGrounding(prompt) : getFallbackSearchGrounding(prompt);
  } catch (err: any) {
    console.warn('[Gemini Grounding Network Notice]: Using verified knowledge fallback');
    return type === 'maps' ? getFallbackMapsGrounding(prompt) : getFallbackSearchGrounding(prompt);
  }
}

export async function sendGeminiWasteAnalysis(
  base64Data: string,
  mimeType: string,
  prompt?: string
): Promise<WasteAnalysisResult> {
  try {
    const res = await fetch('/api/gemini/analyze-waste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data, mimeType, prompt })
    });

    if (res.ok) {
      const json = await res.json();
      if (json.analysis) {
        return json.analysis;
      }
    }

    const errorData = await res.json().catch(() => ({}));
    console.warn(`[Gemini Waste Analysis Notice] Status ${res.status}:`, errorData.error || errorData.details);
    return getFallbackWasteAnalysis();
  } catch (err: any) {
    console.warn('[Gemini Waste Analysis Network Notice]: Using botanical fallback');
    return getFallbackWasteAnalysis();
  }
}

export async function sendGeminiGenerateImage(prompt: string): Promise<string> {
  try {
    const res = await fetch('/api/gemini/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (res.ok) {
      const json = await res.json();
      if (json.image) {
        return json.image;
      }
    }

    return getFallbackTempleArtImage();
  } catch (err: any) {
    return getFallbackTempleArtImage();
  }
}
