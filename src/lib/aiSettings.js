const STORAGE_KEY = 'watermonkey-ai-settings';

export const DEFAULT_AI_SETTINGS = {
  endpoint: 'http://localhost:11434',
  model: 'llama3.2:1b',
  autoRun: true,
};

export function loadAiSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_AI_SETTINGS, ...stored };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
