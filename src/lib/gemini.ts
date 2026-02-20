import { generateWithConfiguredProvider, type AIImageData } from './aiClient';
import { getCurrentProviderApiKey } from './aiConfig';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const getApiKey = () => {
  return getCurrentProviderApiKey();
};

export interface ToolAnalysis {
  name: string;
  description: string;
  category: string;
  tags: string[];
  estimatedPrice?: string;
  specs?: Record<string, string | number | boolean>;
  manualSearchQuery?: string;
  videoSearchQuery?: string;
  productUrl?: string;
  manualUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
  requiresMaintenance?: boolean;
  maintenanceIntervalDays?: number | null;
  maintenanceTask?: string;
}

interface BarcodeLookupResult {
  title?: string;
  description?: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  productUrl?: string;
}

interface OpenFactsProduct {
  product_name?: string;
  generic_name?: string;
  brands?: string;
  categories?: string;
  image_front_url?: string;
  image_url?: string;
  product_url?: string;
  url?: string;
}

const BARCODE_ITEM_KEYS = ['upc', 'ean', 'gtin', 'barcode'] as const;

const normalizeBarcodeValue = (value: string): string => {
  return value.replace(/[^0-9A-Za-z]/g, '').trim().toUpperCase();
};

const normalizeBarcodeDigits = (value: string): string => {
  return value.replace(/\D/g, '');
};

const buildBarcodeVariants = (barcode: string): string[] => {
  const normalized = normalizeBarcodeValue(barcode);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  const digits = normalizeBarcodeDigits(normalized);

  if (digits) {
    variants.add(digits);

    if (digits.length === 12) {
      variants.add(`0${digits}`);
    }

    if (digits.length === 13 && digits.startsWith('0')) {
      variants.add(digits.slice(1));
    }
  }

  return Array.from(variants);
};

const collectItemBarcodeCandidates = (item: Record<string, unknown>): string[] => {
  const candidates = new Set<string>();

  for (const key of BARCODE_ITEM_KEYS) {
    const raw = item[key];
    if (typeof raw === 'string' || typeof raw === 'number') {
      const normalized = normalizeBarcodeValue(String(raw));
      if (normalized) candidates.add(normalized);
    }

    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === 'string' || typeof entry === 'number') {
          const normalized = normalizeBarcodeValue(String(entry));
          if (normalized) candidates.add(normalized);
        }
      }
    }
  }

  return Array.from(candidates);
};

const hasStrongBarcodeMatch = (item: Record<string, unknown>, barcode: string): boolean => {
  const expectedVariants = buildBarcodeVariants(barcode);
  if (expectedVariants.length === 0) return false;

  const expectedSet = new Set(expectedVariants);
  const expectedDigitSet = new Set(expectedVariants.map(normalizeBarcodeDigits).filter(Boolean));

  const candidates = collectItemBarcodeCandidates(item);
  for (const candidate of candidates) {
    if (expectedSet.has(candidate)) return true;

    const candidateDigits = normalizeBarcodeDigits(candidate);
    if (!candidateDigits) continue;

    if (expectedDigitSet.has(candidateDigits)) return true;

    if (candidateDigits.length === 13 && candidateDigits.startsWith('0') && expectedDigitSet.has(candidateDigits.slice(1))) {
      return true;
    }

    if (candidateDigits.length === 12 && expectedDigitSet.has(`0${candidateDigits}`)) {
      return true;
    }
  }

  return false;
};

/**
 * Sanitize user-provided text before interpolating into AI prompts.
 * Truncates excessively long input and strips characters that could
 * be used for prompt injection.
 */
function sanitizeForPrompt(text: string, maxLength = 2000): string {
  return text
    .slice(0, maxLength)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip control chars (keep \n \r \t)
    .trim();
}

export const isHttpUrl = (value?: string | null): boolean => {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
};

/**
 * Validate that a parsed object has expected ToolAnalysis shape.
 * Coerces missing fields to safe defaults so downstream code never sees undefined.
 */
function validateToolAnalysis(raw: unknown): ToolAnalysis {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' ? obj.name : 'Unknown Item',
    description: typeof obj.description === 'string' ? obj.description : '',
    category: typeof obj.category === 'string' ? obj.category : '',
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === 'string') : [],
    estimatedPrice: typeof obj.estimatedPrice === 'string' ? obj.estimatedPrice : undefined,
    specs: typeof obj.specs === 'object' && obj.specs !== null
      ? obj.specs as Record<string, string | number | boolean>
      : undefined,
    manualSearchQuery: typeof obj.manualSearchQuery === 'string' ? obj.manualSearchQuery : undefined,
    videoSearchQuery: typeof obj.videoSearchQuery === 'string' ? obj.videoSearchQuery : undefined,
    productUrl: typeof obj.productUrl === 'string' ? obj.productUrl : undefined,
    manualUrl: typeof obj.manualUrl === 'string' ? obj.manualUrl : undefined,
    videoUrl: typeof obj.videoUrl === 'string' ? obj.videoUrl : undefined,
    imageUrl: typeof obj.imageUrl === 'string' ? obj.imageUrl : undefined,
    requiresMaintenance: typeof obj.requiresMaintenance === 'boolean' ? obj.requiresMaintenance : false,
    maintenanceIntervalDays: typeof obj.maintenanceIntervalDays === 'number' ? obj.maintenanceIntervalDays : null,
    maintenanceTask: typeof obj.maintenanceTask === 'string' ? obj.maintenanceTask : undefined,
  };
}

/**
 * Safely parse JSON from AI response text.
 * Strips markdown fences, attempts to extract JSON object/array from text.
 */
function safeParseJSON<T>(text: string, fallback?: T): T {
  // Strip markdown code fences
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract JSON object or array from surrounding text
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as T;
      } catch {
        // Fall through
      }
    }
    if (fallback !== undefined) return fallback;
    throw new Error('Failed to parse AI response as JSON. The AI returned an unexpected format.');
  }
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Timed out')), timeoutMs);
    }),
  ]);
};

const getJson = async <T>(url: string, timeoutMs = 4500): Promise<T | null> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const response = await withTimeout(
        CapacitorHttp.get({
          url,
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
          headers: {
            Accept: 'application/json',
          },
        }),
        timeoutMs + 500
      );

      if (response.status < 200 || response.status >= 300) return null;

      if (typeof response.data === 'string') {
        try {
          return safeParseJSON<T>(response.data);
        } catch {
          return null;
        }
      }

      return response.data as T;
    }

    const response = await withTimeout(fetch(url), timeoutMs);
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
};

const lookupBarcodeProduct = async (barcode: string): Promise<BarcodeLookupResult | null> => {
  const barcodeVariants = buildBarcodeVariants(barcode);
  if (barcodeVariants.length === 0) return null;

  const queryVariants = Array.from(new Set(barcodeVariants.filter((variant) => /^\d+$/.test(variant))));

  try {
    for (const code of queryVariants) {
      const payload = await getJson<{ items?: unknown[] }>(
        `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
        4500
      );
      if (!payload) continue;

      const items = Array.isArray(payload?.items) ? payload.items : [];
      const matched = items.find((candidate: unknown) => {
        if (!candidate || typeof candidate !== 'object') return false;
        return hasStrongBarcodeMatch(candidate as Record<string, unknown>, barcode);
      });

      if (!matched || typeof matched !== 'object') {
        continue;
      }

      const item = matched as Record<string, unknown>;

      return {
        title: typeof item.title === 'string' ? item.title : undefined,
        description: typeof item.description === 'string' ? item.description : undefined,
        brand: typeof item.brand === 'string' ? item.brand : undefined,
        category: typeof item.category === 'string' ? item.category : undefined,
        imageUrl: Array.isArray(item.images) && typeof item.images[0] === 'string' ? item.images[0] : undefined,
        productUrl: Array.isArray(item.offers) && typeof item.offers[0]?.link === 'string' ? item.offers[0].link : undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
};

const lookupOpenFactsProduct = async (barcode: string): Promise<BarcodeLookupResult | null> => {
  const barcodeVariants = buildBarcodeVariants(barcode).filter((variant) => /^\d+$/.test(variant));
  if (barcodeVariants.length === 0) return null;

  const uniqueCodes = Array.from(new Set(barcodeVariants));
  const endpoints = [
    'https://world.openbeautyfacts.org/api/v2/product',
    'https://world.openfoodfacts.org/api/v2/product',
  ];

  try {
    for (const code of uniqueCodes) {
      for (const endpoint of endpoints) {
        const payload = await getJson<{ product?: OpenFactsProduct }>(
          `${endpoint}/${encodeURIComponent(code)}.json`,
          4500
        );
        if (!payload) continue;

        const product = payload?.product as OpenFactsProduct | undefined;
        if (!product || typeof product !== 'object') continue;

        const title = (product.product_name || product.generic_name || '').trim();
        const description = product.generic_name?.trim();
        const brand = product.brands?.split(',')[0]?.trim();
        const category = product.categories?.split(',')[0]?.trim();
        const imageUrl = product.image_front_url || product.image_url;
        const productUrl = product.product_url || product.url;

        if (!title && !brand && !description && !category) continue;

        return {
          title: title || undefined,
          description: description || undefined,
          brand: brand || undefined,
          category: category || undefined,
          imageUrl: isHttpUrl(imageUrl) ? imageUrl : undefined,
          productUrl: isHttpUrl(productUrl) ? productUrl : undefined,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
};

const fetchWebSearch = async (query: string): Promise<string | null> => {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  
  try {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        }
      });
      
      if (response.status >= 200 && response.status < 300 && typeof response.data === 'string') {
        return response.data;
      }
    } else {
      // On web, this will likely fail due to CORS unless using a proxy, 
      // but we'll try anyway or just return null to avoid errors.
      // For now, we'll skip web implementation to avoid CORS errors in console
      console.warn('Web search fallback is only fully supported on native devices due to CORS.');
      return null; 
    }
  } catch (e) {
    console.warn('Web search fallback failed:', e);
  }
  
  return null;
};

const lookupBarcodeViaWebSearch = async (barcode: string): Promise<string | null> => {
  const html = await fetchWebSearch(`${barcode} product`);
  if (!html) return null;
  
  // Basic cleaning to strip scripts/styles/tags, just keep text content for the LLM
  // This is a naive strip, but sufficient for LLM context
  const text = html
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, "")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
    
  return text.slice(0, 8000); // Limit context size
};

async function runWithModelFallback(
  prompt: string,
  imageData?: AIImageData
): Promise<string> {
  const result = await generateWithConfiguredProvider({ prompt, imageData });
  return result.text;
}

export const analyzeImage = async (base64Image: string, userContext?: string): Promise<ToolAnalysis> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key missing. Please set it in Settings.');
  }

  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  let prompt = `
    Analyze this image of a tool or hardware item.
    Identify the item and provide details in the following JSON format:
    {
      "name": "Short name of the tool",
      "description": "2-sentence description of what it is used for",
      "category": "General category (e.g., Hand Tools, Power Tools, Fasteners)",
      "tags": ["tag1", "tag2", "tag3"],
      "estimatedPrice": "Estimated price range in USD",
      "specs": {
         "Voltage": "18V",
         "Length": "5 in",
         "Material": "Steel"
      },
      "manualSearchQuery": "search query to find the product manual online (e.g. 'DeWalt DCD771 user manual PDF')",
      "videoSearchQuery": "search query to find a how-to or review video (e.g. 'DeWalt DCD771 drill review tutorial')",
      "requiresMaintenance": true/false,
      "maintenanceIntervalDays": 180 (estimated days between routine maintenance, or null if none),
      "maintenanceTask": "Identify primary maintenance needed (e.g. 'Change oil', 'Sharpen blade', 'Lubricate chain')"
    }
  `;

  if (userContext) {
    prompt += `\n\nAdditional User Context: ${sanitizeForPrompt(userContext)}`;
  }

  prompt += `\nReturn ONLY raw JSON, no markdown formatting.`;

  const text = await runWithModelFallback(prompt, {
    base64: base64Data,
    mimeType: "image/jpeg",
  });

  return validateToolAnalysis(safeParseJSON<Record<string, unknown>>(text));
};

export const analyzeBulkImage = async (base64Image: string, userContext?: string): Promise<ToolAnalysis[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key missing. Please set it in Settings.');
  }

  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  let prompt = `
    Analyze this image carefully. It may contain MULTIPLE tools or hardware items.
    Identify EVERY distinct tool/item visible in the image.

    For EACH item, provide details in the following JSON format.
    Return an array of objects:
    [
      {
        "name": "Short name of the tool",
        "description": "2-sentence description of what it is used for",
        "category": "General category (e.g., Hand Tools, Power Tools, Fasteners)",
        "tags": ["tag1", "tag2", "tag3"],
        "estimatedPrice": "Estimated price range in USD",
        "specs": { "key": "value" },
        "manualSearchQuery": "search query to find the product manual",
        "videoSearchQuery": "search query to find a how-to video",
        "requiresMaintenance": true/false,
        "maintenanceIntervalDays": 180,
        "maintenanceTask": "Primary maintenance task"
      }
    ]

    If only ONE item is visible, return an array with one object.
    Be thorough - identify every separate tool you can see.
  `;

  if (userContext) {
    prompt += `\n\nAdditional User Context: ${sanitizeForPrompt(userContext)}`;
  }

  prompt += `\nReturn ONLY raw JSON array, no markdown formatting.`;

  const text = await runWithModelFallback(prompt, {
    base64: base64Data,
    mimeType: "image/jpeg",
  });

  const parsed = safeParseJSON<unknown>(text);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map(validateToolAnalysis);
};

export const analyzeBarcode = async (
  barcode: string,
  userContext?: string,
  base64Image?: string
): Promise<ToolAnalysis> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key missing. Please set it in Settings.');
  }

  const lookedUp = (await lookupBarcodeProduct(barcode)) || (await lookupOpenFactsProduct(barcode));
  const hasLookupSignal = Boolean(
    lookedUp?.title || lookedUp?.brand || lookedUp?.description || lookedUp?.category
  );




  let webSearchContext: string | null = null;

  if (!hasLookupSignal) {
    // Attempt web search fallback
    try {
      webSearchContext = await lookupBarcodeViaWebSearch(barcode);
    } catch (e) {
      console.warn('Web search fallback lookup error:', e);
    }
  }

  let prompt = `
    You are a barcode + product enrichment expert.

    BARCODE VALUE: ${sanitizeForPrompt(barcode, 100)}

    BARCODE LOOKUP DATA (may be partial):
    ${JSON.stringify(lookedUp || {}, null, 2)}

    WEB SEARCH CONTEXT (fallback):
    ${webSearchContext ? sanitizeForPrompt(webSearchContext, 4000) : 'None'}

    Task:
    1) Infer the product represented by this barcode using BARCODE LOOKUP DATA as the primary source.
    2) If lookup data is missing, use WEB SEARCH CONTEXT to identify the product.
    3) USE YOUR GOOGLE SEARCH CAPABILITY. You have access to Google Search. ALWAYS do a Google Search for the barcode value if the lookup data and web search context are weak or missing.
    4) Do NOT invent a different product type/brand if all data is weak or ambiguous after searching.
    5) Use image/context only to supplement fields, never to contradict lookup data.
    6) Provide detailed specs when possible.

    Return JSON:
    {
      "name": "Product name",
      "description": "2-sentence practical description",
      "category": "Best category",
      "tags": ["tag1", "tag2", "tag3"],
      "estimatedPrice": "Estimated USD price/range",
      "specs": {
        "Barcode": "${sanitizeForPrompt(barcode, 100)}",
        "Brand": "...",
        "Model": "..."
      },
      "productUrl": "Direct product page URL when known, else a search URL",
      "manualUrl": "Direct manual URL when known, else a search URL",
      "videoUrl": "Direct tutorial/review URL when known, else a search URL",
      "imageUrl": "Direct main product image URL if known",
      "manualSearchQuery": "search query for manual",
      "videoSearchQuery": "search query for tutorial/review",
      "requiresMaintenance": true/false,
      "maintenanceIntervalDays": 180,
      "maintenanceTask": "Routine maintenance task description if applicable"
    }
  `;

  if (userContext) {
    prompt += `\n\nAdditional User Context: ${sanitizeForPrompt(userContext)}`;
  }

  prompt += `\nReturn ONLY raw JSON, no markdown formatting.`;

  let imageData: { base64: string; mimeType: string } | undefined;
  if (base64Image) {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    imageData = { base64: base64Data, mimeType: 'image/jpeg' };
  }

  const text = await runWithModelFallback(prompt, imageData);
  const parsed = validateToolAnalysis(safeParseJSON<Record<string, unknown>>(text));

  const nextSpecs = { ...(parsed.specs || {}) };
  if (!nextSpecs.Barcode) nextSpecs.Barcode = barcode;
  if (lookedUp?.brand && !nextSpecs.Brand) nextSpecs.Brand = lookedUp.brand;

  const enrichedFallbackProductSearch = `https://www.google.com/search?q=${encodeURIComponent(`${parsed.name || ''} ${barcode} product`)}`;
  const enrichedFallbackManualSearch = `https://www.google.com/search?q=${encodeURIComponent(parsed.manualSearchQuery || `${parsed.name || ''} manual PDF`)}`;
  const enrichedFallbackVideoSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(parsed.videoSearchQuery || `${parsed.name || ''} review tutorial`)}`;

  return {
    ...parsed,
    name: lookedUp?.title?.trim() || parsed.name,
    description: lookedUp?.description?.trim() || parsed.description,
    category: lookedUp?.category?.trim() || parsed.category,
    productUrl: isHttpUrl(parsed.productUrl)
      ? parsed.productUrl
      : (isHttpUrl(lookedUp?.productUrl) ? lookedUp?.productUrl : enrichedFallbackProductSearch),
    manualUrl: isHttpUrl(parsed.manualUrl) ? parsed.manualUrl : enrichedFallbackManualSearch,
    videoUrl: isHttpUrl(parsed.videoUrl) ? parsed.videoUrl : enrichedFallbackVideoSearch,
    imageUrl: isHttpUrl(parsed.imageUrl)
      ? parsed.imageUrl
      : (isHttpUrl(lookedUp?.imageUrl) ? lookedUp?.imageUrl : undefined),
    specs: nextSpecs,
  };
};

export const analyzeBarcodeFromImage = async (
  base64Image: string,
  userContext?: string
): Promise<{ barcode: string; analysis: ToolAnalysis }> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key missing. Please set it in Settings.');
  }

  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

  let prompt = `
    Analyze this image that contains a product barcode and packaging/label.

    Tasks:
    1) Read the barcode value from the image. Return only digits/letters, no spaces.
    2) Infer the product details/specs as accurately as possible.

    Return JSON:
    {
      "barcode": "detected barcode value",
      "analysis": {
        "name": "Product name",
        "description": "2-sentence practical description",
        "category": "Best category",
        "tags": ["tag1", "tag2", "tag3"],
        "estimatedPrice": "Estimated USD price/range",
        "specs": {
          "Barcode": "detected barcode",
          "Brand": "...",
          "Model": "..."
        },
        "productUrl": "Direct product page URL when known, else a search URL",
        "manualUrl": "Direct manual URL when known, else a search URL",
        "videoUrl": "Direct tutorial/review URL when known, else a search URL",
        "imageUrl": "Direct main product image URL if known",
        "manualSearchQuery": "search query for manual",
        "videoSearchQuery": "search query for tutorial/review",
        "requiresMaintenance": true,
        "maintenanceIntervalDays": 60,
        "maintenanceTask": "Example task"
      }
    }
  `;

  if (userContext) {
    prompt += `\n\nAdditional User Context: ${sanitizeForPrompt(userContext)}`;
  }

  prompt += `\nReturn ONLY raw JSON, no markdown formatting.`;

  const text = await runWithModelFallback(prompt, {
    base64: base64Data,
    mimeType: 'image/jpeg',
  });

  const parsed = safeParseJSON<{ barcode?: string; analysis: ToolAnalysis }>(text);

  const barcode = (parsed.barcode || '').trim();
  if (!barcode) {
    throw new Error('Could not read barcode from image. Try a clearer photo or manual entry.');
  }

  const analysis = await analyzeBarcode(barcode, userContext, base64Image);
  const imageAnalysis = validateToolAnalysis(parsed.analysis || {});

  const mergedAnalysis: ToolAnalysis = {
    ...analysis,
    name: (analysis.name !== 'Unknown Item' && !analysis.name.startsWith('Unknown Product')) 
      ? analysis.name : imageAnalysis.name,
    description: (analysis.description && analysis.name !== 'Unknown Item' && !analysis.name.startsWith('Unknown Product'))
      ? analysis.description : (imageAnalysis.description || analysis.description),
    category: analysis.category || imageAnalysis.category,
    tags: analysis.tags.length > 0 ? analysis.tags : imageAnalysis.tags,
    estimatedPrice: analysis.estimatedPrice || imageAnalysis.estimatedPrice,
    specs: {
      ...(imageAnalysis.specs || {}),
      ...(analysis.specs || {}),
    },
    requiresMaintenance: analysis.requiresMaintenance || imageAnalysis.requiresMaintenance,
    maintenanceIntervalDays: analysis.maintenanceIntervalDays || imageAnalysis.maintenanceIntervalDays,
    maintenanceTask: analysis.maintenanceTask || imageAnalysis.maintenanceTask,
  };

  return { barcode, analysis: mergedAnalysis };
};

export const smartSearch = async (query: string, inventoryContext: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key missing. Please set it in Settings.');
  }

  const prompt = `You are a tool inventory search assistant. The user is looking for something in their tool inventory.

USER'S INVENTORY:
${sanitizeForPrompt(inventoryContext, 10000)}

USER'S QUERY: "${sanitizeForPrompt(query, 500)}"

TASK:
Search through the inventory and find items matching the user's natural language query. Consider:
- Exact and partial name matches
- Category matches
- Tag matches
- Description matches
- Functional matches (e.g. "something to cut wood" should match "circular saw")
- Spec matches (e.g. "10mm socket" should match items with that spec)

Return a JSON response:
{
  "matches": [
    {
      "itemName": "exact name from inventory",
      "relevance": "high|medium|low",
      "reason": "brief explanation of why this matches"
    }
  ],
  "suggestion": "If no matches found, suggest what tool might work for the query"
}

Return ONLY raw JSON, no markdown.`;

  const text = await runWithModelFallback(prompt);
  const parsed = safeParseJSON<{ matches: { itemName: string; relevance: string; reason: string }[]; suggestion?: string }>(text);
  return JSON.stringify(parsed);
};

export const findDuplicates = async (
  newToolName: string,
  newToolDescription: string,
  existingItems: { name: string; description: string; category: string }[]
): Promise<{ isDuplicate: boolean; matchedItem?: string; confidence: string }> => {
  const apiKey = getApiKey();
  if (!apiKey) return { isDuplicate: false, confidence: 'unknown' };

  if (existingItems.length === 0) return { isDuplicate: false, confidence: 'none' };

  const itemList = existingItems.map(i => `- ${i.name}: ${i.description} [${i.category}]`).join('\n');

  const prompt = `You are a tool deduplication checker. Determine if a newly scanned tool already exists in the user's inventory.

NEW TOOL:
Name: ${sanitizeForPrompt(newToolName, 500)}
Description: ${sanitizeForPrompt(newToolDescription, 1000)}

EXISTING INVENTORY:
${sanitizeForPrompt(itemList, 10000)}

Does this new tool likely match any existing item? Consider:
- Same tool, different naming (e.g. "Phillips screwdriver" vs "Phillips head screwdriver")
- Same brand and model
- Functionally identical items

Return JSON:
{
  "isDuplicate": true/false,
  "matchedItem": "name of the matching existing item (if duplicate)",
  "confidence": "high|medium|low"
}

Return ONLY raw JSON, no markdown.`;

  try {
    const text = await runWithModelFallback(prompt);
    return safeParseJSON<{ isDuplicate: boolean; matchedItem?: string; confidence: string }>(text, { isDuplicate: false, confidence: 'error' });
  } catch {
    return { isDuplicate: false, confidence: 'error' };
  }
};

export const reEnrichItem = async (
  currentItem: {
    name: string;
    description: string;
    category: string;
    tags: string[];
    specs?: Record<string, string | number | boolean>;
    estimatedPrice?: string;
  },
  sourceInfo: string,
  base64Image?: string
): Promise<ToolAnalysis> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key missing. Please set it in Settings.');
  }

  const currentSpecs = currentItem.specs
    ? Object.entries(currentItem.specs).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : 'None';

  const prompt = `You are a product data enrichment expert. A user has an item in their tool inventory and wants to update/improve its details using new source information they've provided.

CURRENT ITEM DATA:
Name: ${currentItem.name}
Description: ${currentItem.description}
Category: ${currentItem.category}
Tags: ${currentItem.tags.join(', ')}
Specs:
${currentSpecs}
Estimated Price: ${currentItem.estimatedPrice || 'Unknown'}

USER-PROVIDED SOURCE INFORMATION:
${sanitizeForPrompt(sourceInfo)}

${sourceInfo.match(/^https?:\/\//) ? 'NOTE: The user provided a URL. Try to infer product details from the URL structure (brand, model, product type). Combine with the existing item data and any image to provide the most accurate and complete details.' : 'NOTE: The user provided manual text/description. Use this to refine and improve the existing item data.'}

TASK: Combine the existing item data with the new source information to produce the BEST possible product details. Update any fields where the source provides better/more specific information. Keep existing data for fields where the source doesn't provide improvements.

Return the enriched item in this JSON format:
{
  "name": "Most accurate short name (include brand/model if known)",
  "description": "Improved 2-sentence description",
  "category": "Best category",
  "tags": ["comprehensive", "tag", "list"],
  "estimatedPrice": "Most accurate price or range in USD",
  "specs": {
    "Brand": "...",
    "Model": "...",
    "key": "value"
  },
  "manualSearchQuery": "search query to find the product manual online",
  "videoSearchQuery": "search query to find a how-to or review video"
}

Return ONLY raw JSON, no markdown formatting.`;

  let imageData: { base64: string; mimeType: string } | undefined;
  if (base64Image) {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    imageData = { base64: base64Data, mimeType: "image/jpeg" };
  }

  const text = await runWithModelFallback(prompt, imageData);
  return validateToolAnalysis(safeParseJSON<Record<string, unknown>>(text));
};
