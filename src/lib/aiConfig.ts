export type AIProvider = 'gemini' | 'openai' | 'anthropic';

const AI_PROVIDER_KEY = 'AI_PROVIDER';
const AI_MODELS_KEY_PREFIX = 'AI_MODELS_';

const DEFAULT_MODELS: Record<AIProvider, string[]> = {
  gemini: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-3.1-pro', 'gemini-3-pro-preview', 'gemini-2.5-pro'],
  openai: ['gpt-4.1-mini', 'gpt-4o-mini'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
};

const API_KEY_STORAGE: Record<AIProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

const isProvider = (value: string | null): value is AIProvider => {
  return value === 'gemini' || value === 'openai' || value === 'anthropic';
};

export const getAllProviders = (): AIProvider[] => ['gemini', 'openai', 'anthropic'];

export const getProviderLabel = (provider: AIProvider): string => {
  if (provider === 'openai') return 'OpenAI (GPT)';
  if (provider === 'anthropic') return 'Anthropic (Claude)';
  return 'Google Gemini';
};

export const getApiKeyStorageKey = (provider: AIProvider): string => API_KEY_STORAGE[provider];

export const getActiveAIProvider = (): AIProvider => {
  const saved = localStorage.getItem(AI_PROVIDER_KEY);
  return isProvider(saved) ? saved : 'gemini';
};

export const setActiveAIProvider = (provider: AIProvider) => {
  localStorage.setItem(AI_PROVIDER_KEY, provider);
};

export const getApiKeyForProvider = (provider: AIProvider): string => {
  return (localStorage.getItem(getApiKeyStorageKey(provider)) || '').trim();
};

export const setApiKeyForProvider = (provider: AIProvider, apiKey: string) => {
  localStorage.setItem(getApiKeyStorageKey(provider), apiKey.trim());
};

export const getCurrentProviderApiKey = (): string => {
  return getApiKeyForProvider(getActiveAIProvider());
};

export const getDefaultModels = (provider: AIProvider): string[] => {
  return [...DEFAULT_MODELS[provider]];
};

export const getModelCandidates = (provider: AIProvider): string[] => {
  const raw = localStorage.getItem(`${AI_MODELS_KEY_PREFIX}${provider}`);
  if (!raw) return getDefaultModels(provider);

  const parsed = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : getDefaultModels(provider);
};

export const setModelCandidates = (provider: AIProvider, models: string[]) => {
  const normalized = models.map((m) => m.trim()).filter(Boolean);
  if (normalized.length === 0) {
    localStorage.removeItem(`${AI_MODELS_KEY_PREFIX}${provider}`);
    return;
  }

  localStorage.setItem(`${AI_MODELS_KEY_PREFIX}${provider}`, normalized.join(','));
};
