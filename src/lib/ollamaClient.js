import { DEFAULT_AI_SETTINGS } from './aiSettings';

/**
 * Data disclosure (SPEC §6.12): a summary request sends each finding's
 * provider, resource type, details string, monthly loss estimate, severity,
 * and remediable flag, plus the fleet total, to the configured local Ollama
 * endpoint. No credentials, account identifiers, or raw provider API
 * responses are included.
 */
export const OLLAMA_DATA_DISCLOSURE = 'Each finding\'s provider, resource type, details, monthly loss estimate, severity, and remediable flag — plus the fleet total — are sent to the local Ollama endpoint below. No credentials or account identifiers are included.';

function summarizeFinding(item) {
  const { provider, resource, details, monthlyLoss, severity, remediable } = item;
  return { provider, resource, details, monthlyLoss, severity, remediable };
}

export async function checkOllamaAvailability(endpoint = DEFAULT_AI_SETTINGS.endpoint, model = DEFAULT_AI_SETTINGS.model) {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/tags`);
    if (!res.ok) return { available: false, message: `Ollama responded with status ${res.status}.` };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    const hasModel = models.some((name) => name === model || name.startsWith(`${model}:`) || name.startsWith(model.split(':')[0]));
    return hasModel
      ? { available: true, message: `Ollama is reachable and "${model}" is installed.` }
      : { available: true, message: `Ollama is reachable, but "${model}" was not found. Run "ollama pull ${model}".`, modelMissing: true };
  } catch (err) {
    return { available: false, message: `Could not reach Ollama at ${endpoint} (${err.message || err}).` };
  }
}

export async function generateAiSummary(wasteItems, settings = DEFAULT_AI_SETTINGS) {
  const { endpoint, model } = settings;
  const totalWaste = wasteItems.reduce((acc, item) => acc + item.monthlyLoss, 0);
  const normalized = wasteItems.map(summarizeFinding);

  const prompt = `
You are Water Monkey AI, an expert FinOps advisor.
Analyze these wasted cloud resources detected on the user's local machine:
${JSON.stringify(normalized, null, 2)}

Total Monthly Waste: $${totalWaste.toFixed(2)}

Provide a concise, 3-bullet-point executive summary for a CTO/founder explaining:
1. What the immediate biggest cost leak is.
2. The risk of terminating these resources (e.g., is it safe?).
3. One recommended action step.
  `;

  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: prompt,
        stream: false,
      }),
    });

    if (!res.ok) throw new Error(`Ollama connection failed (status ${res.status}).`);
    const data = await res.json();
    // Returned as plain text and rendered without any HTML/markdown
    // interpretation (see AiInsights.jsx) — model output is untrusted.
    return data.response;
  } catch (err) {
    return `Local Ollama AI unavailable at ${endpoint}. Start Ollama and confirm "${model}" is installed, or update the endpoint/model in AI settings. (${err.message || err})`;
  }
}
