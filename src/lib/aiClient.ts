import { getActiveAIProvider, getApiKeyForProvider, getModelCandidates, type AIProvider } from './aiConfig';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface AIImageData {
  base64: string;
  mimeType: string;
}

export interface AIGenerateInput {
  prompt: string;
  imageData?: AIImageData;
  provider?: AIProvider;
  apiKey?: string;
  modelCandidates?: string[];
}

export interface AIGenerateResult {
  text: string;
  provider: AIProvider;
  model: string;
}

const API_TIMEOUT_MS = 30_000; // 30 seconds

// Native Gemini implementation to avoid "Failed to fetch" errors in WebView
const callGeminiNative = async (apiKey: string, model: string, prompt: string, imageData?: AIImageData): Promise<string> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const parts: Record<string, unknown>[] = [{ text: prompt }];

  if (imageData) {
    parts.push({
      inline_data: {
        mime_type: imageData.mimeType,
        data: imageData.base64
      }
    });
  }

  const body = {
    contents: [{ parts }],
    tools: [{ googleSearch: {} }]
  };

  const response = await CapacitorHttp.post({
    url,
    headers: {
      'Content-Type': 'application/json'
    },
    data: body,
    connectTimeout: API_TIMEOUT_MS,
    readTimeout: API_TIMEOUT_MS
  });

  if (response.status !== 200) {
    const errorMsg = response.data?.error?.message || JSON.stringify(response.data) || 'Unknown error';
    throw new Error(`Gemini Native Error ${response.status}: ${errorMsg}`);
  }

  const candidates = response.data?.candidates;
  const content = candidates?.[0]?.content;
  const partsResponse = content?.parts;
  
  if (Array.isArray(partsResponse)) {
    return partsResponse.map((p: Record<string, unknown>) => (typeof p.text === 'string' ? p.text : '')).join('').trim();
  }
  
  return '';
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<Response> => {
  if (Capacitor.isNativePlatform()) {
    try {
      const response = await CapacitorHttp.request({
        method: init.method || 'GET',
        url: url,
        headers: (init.headers as Record<string, string>) || {},
        data: init.body ? JSON.parse(init.body as string) : undefined,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });

      // Convert Capacitor response to a fetch-like Response object
      return new Response(JSON.stringify(response.data), {
        status: response.status,
        headers: new Headers(response.headers as HeadersInit),
      });
    } catch (error) {
       throw new Error(`Native HTTP request failed: ${(error as Error).message}`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`API request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const isRateOrQuotaIssue = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes('429') || lower.includes('quota') || lower.includes('rate limit') || lower.includes('capacity');
};

const extractOpenAiText = (payload: unknown): string => {
  const cPayload = payload as Record<string, unknown>;
  const content = (cPayload?.choices as { message?: { content?: string | { text?: string }[] } }[])?.[0]?.message?.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }

  return '';
};

const callGemini = async (apiKey: string, model: string, prompt: string, imageData?: AIImageData): Promise<string> => {
  // Use native HTTP on Android/iOS to bypass CORS/SSL issues with WebView fetch
  if (Capacitor.isNativePlatform()) {
    return callGeminiNative(apiKey, model, prompt, imageData);
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const aiModel = genAI.getGenerativeModel({ 
    model,
    // @ts-expect-error - googleSearch is supported by the API but might not be in the strict 'Tool' type yet
    tools: [{ googleSearch: {} }]
  });

  const parts: (string | { inlineData: { data: string; mimeType: string } })[] = [prompt];
  if (imageData) {
    parts.push({
      inlineData: {
        data: imageData.base64,
        mimeType: imageData.mimeType,
      },
    });
  }

  const result = await aiModel.generateContent(parts);
  const response = await result.response;
  return response.text();
};

const callOpenAI = async (apiKey: string, model: string, prompt: string, imageData?: AIImageData): Promise<string> => {
  const content = imageData
    ? [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imageData.mimeType};base64,${imageData.base64}`,
          },
        },
      ]
    : prompt;

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI ${response.status}: ${errText}`);
  }

  const payload = await response.json();
  const text = extractOpenAiText(payload);
  if (!text) {
    throw new Error('OpenAI response did not include text content.');
  }

  return text;
};

const callAnthropic = async (apiKey: string, model: string, prompt: string, imageData?: AIImageData): Promise<string> => {
  const content = imageData
    ? [
        { type: 'text', text: prompt },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageData.mimeType,
            data: imageData.base64,
          },
        },
      ]
    : [{ type: 'text', text: prompt }];

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic ${response.status}: ${errText}`);
  }

  const payload = await response.json();
  const text = Array.isArray(payload?.content)
    ? payload.content
        .filter((entry: Record<string, unknown>) => entry?.type === 'text' && typeof entry?.text === 'string')
        .map((entry: Record<string, unknown>) => entry.text)
        .join('')
        .trim()
    : '';

  if (!text) {
    throw new Error('Anthropic response did not include text content.');
  }

  return text;
};

const callProviderModel = async (
  provider: AIProvider,
  apiKey: string,
  model: string,
  prompt: string,
  imageData?: AIImageData
): Promise<string> => {
  if (provider === 'openai') {
    return callOpenAI(apiKey, model, prompt, imageData);
  }

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, prompt, imageData);
  }

  return callGemini(apiKey, model, prompt, imageData);
};

export const generateWithConfiguredProvider = async (input: AIGenerateInput): Promise<AIGenerateResult> => {
  const provider = input.provider || getActiveAIProvider();
  const apiKey = (input.apiKey || getApiKeyForProvider(provider)).trim();
  if (!apiKey) {
    throw new Error(`API key missing for ${provider}. Please set it in Settings.`);
  }

  const models = input.modelCandidates?.filter(Boolean) ?? getModelCandidates(provider);
  if (models.length === 0) {
    throw new Error(`No models configured for provider ${provider}.`);
  }

  let sawQuotaOrRateError = false;
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const text = await callProviderModel(provider, apiKey, model, input.prompt, input.imageData);
      return { text, provider, model };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (isRateOrQuotaIssue(message)) {
        sawQuotaOrRateError = true;
      }
    }
  }

  if (sawQuotaOrRateError) {
    throw new Error(
      `${provider} model capacity/quota reached. The app auto-falls back across configured models (${models.join(', ')}).`
    );
  }

  throw new Error(lastError instanceof Error ? lastError.message : 'All configured models failed.');
};
