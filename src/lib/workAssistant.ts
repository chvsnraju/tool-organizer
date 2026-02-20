import { supabase } from './supabase';
import { generateWithConfiguredProvider } from './aiClient';
import { getCurrentProviderApiKey } from './aiConfig';

const getApiKey = () => {
  return getCurrentProviderApiKey();
};

export interface ToolMatch {
  requiredToolName: string;
  description: string;
  category: string;
  required: boolean;
  matchStatus: 'owned' | 'alternative' | 'missing';
  ownedTool?: {
    id: string;
    name: string;
    location: string;
  } | null;
  alternativeTool?: {
    id: string;
    name: string;
    reason: string;
    location: string;
  } | null;
}

export interface WorkAnalysisResult {
  task: string;
  toolMatches: ToolMatch[];
  additionalMaterials: string[];
  safetyTips: string[];
}

interface InventoryItem {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  location: string;
}

interface ParsedAiResult {
  toolMatches?: Array<{
    requiredToolName?: string;
    description?: string;
    category?: string;
    required?: boolean;
    matchStatus?: 'owned' | 'alternative' | 'missing';
    ownedTool?: { id?: string; name?: string; location?: string } | null;
    alternativeTool?: { id?: string; name?: string; reason?: string; location?: string } | null;
  }>;
  additionalMaterials?: string[];
  safetyTips?: string[];
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toTokens = (value: string) => normalizeText(value).split(' ').filter(Boolean);

const keywordSynonyms: Record<string, string[]> = {
  drill: ['driver', 'drill driver', 'power drill', 'cordless drill'],
  screwdriver: ['driver', 'philips', 'flathead', 'screw driver'],
  wrench: ['spanner', 'socket wrench', 'adjustable wrench'],
  hammer: ['mallet', 'claw hammer'],
  level: ['spirit level', 'laser level'],
  saw: ['handsaw', 'circular saw', 'jigsaw'],
  pliers: ['needle nose', 'slip joint', 'locking pliers'],
  tape: ['measuring tape', 'tape measure'],
};

const findBestInventoryMatch = (requiredToolName: string, inventory: InventoryItem[]) => {
  const required = normalizeText(requiredToolName);
  const requiredTokens = toTokens(requiredToolName);

  let best: { item: InventoryItem; score: number } | null = null;

  for (const candidate of inventory) {
    const corpusText = [candidate.name, candidate.description, candidate.category || '', ...(candidate.tags || [])].join(' ');
    const corpus = normalizeText(corpusText);
    const corpusTokens = new Set(toTokens(corpusText));

    let score = 0;

    if (corpus.includes(required) || required.includes(normalizeText(candidate.name))) {
      score += 0.7;
    }

    const overlap = requiredTokens.filter(token => corpusTokens.has(token)).length;
    if (requiredTokens.length > 0) {
      score += (overlap / requiredTokens.length) * 0.3;
    }

    for (const token of requiredTokens) {
      const synonyms = keywordSynonyms[token] || [];
      if (synonyms.some(s => corpus.includes(normalizeText(s)))) {
        score += 0.08;
      }
    }

    if (!best || score > best.score) {
      best = { item: candidate, score };
    }
  }

  return best;
};

const extractJsonObject = (text: string): string => {
  const clean = text.replace(/```json|```/g, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI response did not contain valid JSON object.');
  }
  return clean.slice(firstBrace, lastBrace + 1);
};

const normalizeToolMatches = (rawMatches: ParsedAiResult['toolMatches'], inventory: InventoryItem[]): ToolMatch[] => {
  if (!rawMatches?.length) return [];

  const inventoryById = new Map(inventory.map(item => [item.id, item]));

  const normalized = rawMatches.map((raw) => {
    const requiredToolName = (raw.requiredToolName || '').trim();
    const description = (raw.description || '').trim() || 'Useful for this task.';
    const category = (raw.category || '').trim() || 'General';
    const required = raw.required !== false;

    const aiOwned = raw.ownedTool?.id ? inventoryById.get(raw.ownedTool.id) : null;
    const aiAlternative = raw.alternativeTool?.id ? inventoryById.get(raw.alternativeTool.id) : null;
    const bestMatch = requiredToolName ? findBestInventoryMatch(requiredToolName, inventory) : null;

    const confidentOwned = bestMatch && bestMatch.score >= 0.62;
    const confidentAlternative = bestMatch && bestMatch.score >= 0.42;

    let matchStatus: ToolMatch['matchStatus'] = raw.matchStatus || 'missing';
    let ownedTool: ToolMatch['ownedTool'] = null;
    let alternativeTool: ToolMatch['alternativeTool'] = null;

    if (aiOwned) {
      ownedTool = { id: aiOwned.id, name: aiOwned.name, location: aiOwned.location };
      matchStatus = 'owned';
    } else if (matchStatus === 'owned' && confidentOwned && bestMatch) {
      ownedTool = { id: bestMatch.item.id, name: bestMatch.item.name, location: bestMatch.item.location };
      matchStatus = 'owned';
    } else if (aiAlternative) {
      alternativeTool = {
        id: aiAlternative.id,
        name: aiAlternative.name,
        location: aiAlternative.location,
        reason: raw.alternativeTool?.reason || 'Can substitute for this task.',
      };
      matchStatus = 'alternative';
    } else if (confidentAlternative && bestMatch) {
      alternativeTool = {
        id: bestMatch.item.id,
        name: bestMatch.item.name,
        location: bestMatch.item.location,
        reason: 'Closest available match in your inventory.',
      };
      matchStatus = confidentOwned ? 'owned' : 'alternative';
      if (confidentOwned) {
        ownedTool = {
          id: bestMatch.item.id,
          name: bestMatch.item.name,
          location: bestMatch.item.location,
        };
        alternativeTool = null;
      }
    } else {
      matchStatus = 'missing';
    }

    return {
      requiredToolName: requiredToolName || 'Unspecified tool',
      description,
      category,
      required,
      matchStatus,
      ownedTool,
      alternativeTool,
    } as ToolMatch;
  });

  const dedup = new Map<string, ToolMatch>();
  for (const match of normalized) {
    const key = normalizeText(match.requiredToolName);
    if (!key) continue;
    if (!dedup.has(key) || (dedup.get(key)?.matchStatus === 'missing' && match.matchStatus !== 'missing')) {
      dedup.set(key, match);
    }
  }

  return Array.from(dedup.values());
};

async function fetchUserInventory(): Promise<InventoryItem[]> {
  const { data } = await supabase
    .from('items')
    .select(`
      id, name, description, category, tags,
      container:containers(
        name,
        location:locations(name)
      )
    `);

  if (!data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((item: any) => {
    let location = 'Unorganized';
    if (item.container) {
      location = item.container.location
        ? `${item.container.location.name} > ${item.container.name}`
        : item.container.name;
    }
    return {
      id: item.id,
      name: item.name,
      description: item.description || '',
      category: item.category,
      tags: item.tags || [],
      location,
    };
  });
}

export async function analyzeWorkTask(taskDescription: string): Promise<WorkAnalysisResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key missing. Please set it in Settings.');
  }

  const inventory = await fetchUserInventory();

  const inventoryContext = inventory.length > 0
    ? inventory.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        tags: item.tags,
        location: item.location,
      }))
    : [];

  const prompt = `You are a professional contractor and tool expert. A user wants to: "${taskDescription}"

USER'S TOOL INVENTORY (${inventory.length} items):
${inventory.length > 0 ? JSON.stringify(inventoryContext, null, 2) : 'EMPTY - user has no tools cataloged yet.'}

Analyze this task and return a JSON response:
{
  "toolMatches": [
    {
      "requiredToolName": "Name of tool needed",
      "description": "Why this tool is needed for the task",
      "category": "Hand Tools|Power Tools|Measuring|Safety|Fasteners|etc",
      "required": true or false (true = essential, false = optional/nice-to-have),
      "matchStatus": "owned" | "alternative" | "missing",
      "ownedTool": { "id": "uuid from inventory", "name": "exact name from inventory", "location": "location from inventory" } or null,
      "alternativeTool": { "id": "uuid from inventory", "name": "name from inventory", "reason": "explanation of how this tool can substitute", "location": "location" } or null
    }
  ],
  "additionalMaterials": ["non-tool items needed like screws, paint, tape, etc"],
  "safetyTips": ["relevant safety warnings for this task"]
}

MATCHING RULES:
- Match flexibly: "cordless drill" matches "drill", "power drill", "drill/driver"
- Check tags too: if a required tool is "screwdriver" and user has an item tagged "screwdriver", it's a match
- "owned": tool found in inventory (exact or very similar)
- "alternative": a DIFFERENT tool from inventory that could substitute (explain why)
- "missing": no matching or alternative tool in inventory
- Be comprehensive: include essential tools, optional helpers, safety equipment, and measuring tools
- Keep it practical - don't list 20 tools for a simple task

Return ONLY valid JSON, no markdown formatting or code blocks.`;

  const result = await generateWithConfiguredProvider({ prompt });
  const parsed = JSON.parse(extractJsonObject(result.text)) as ParsedAiResult;
  const toolMatches = normalizeToolMatches(parsed.toolMatches, inventory);
  const additionalMaterials = (parsed.additionalMaterials || []).filter(Boolean).map(item => String(item).trim());
  const safetyTips = (parsed.safetyTips || []).filter(Boolean).map(item => String(item).trim());

  return {
    task: taskDescription,
    toolMatches,
    additionalMaterials,
    safetyTips,
  };
}
