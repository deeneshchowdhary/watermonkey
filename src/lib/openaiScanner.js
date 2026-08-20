const OPENAI_COSTS_URL = 'https://api.openai.com/v1/organization/costs';

export const DEFAULT_OPENAI_SETTINGS = {
  days: 7,
  spikeMultiplier: 2,
};

export async function scanOpenAiWaste(adminKey, options = {}) {
  if (!adminKey) return [];

  const { days, spikeMultiplier } = { ...DEFAULT_OPENAI_SETTINGS, ...options };
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - days * 24 * 60 * 60;
  const url = new URL(OPENAI_COSTS_URL);
  url.searchParams.set('start_time', String(startTime));
  url.searchParams.set('end_time', String(endTime));
  url.searchParams.set('bucket_width', '1d');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (!response.ok) {
    throw new Error(`OpenAI costs API returned ${response.status}. An organization admin key is required.`);
  }

  const payload = await response.json();
  const dailyCosts = (payload.data || []).map((bucket) => ({
    startTime: bucket.start_time,
    amount: (bucket.results || []).reduce(
      (sum, result) => sum + Number(result.amount?.value || 0),
      0,
    ),
  }));
  if (dailyCosts.length < 2) return [];

  const latest = dailyCosts[dailyCosts.length - 1];
  const baselineDays = dailyCosts.slice(0, -1).filter((day) => day.amount > 0);
  const baseline = baselineDays.length
    ? baselineDays.reduce((sum, day) => sum + day.amount, 0) / baselineDays.length
    : 0;
  if (baseline === 0 || latest.amount < baseline * spikeMultiplier) return [];

  const excessDailySpend = latest.amount - baseline;
  return [{
    id: `openai-spike-${latest.startTime}`,
    provider: 'OpenAI',
    resource: 'API Cost Spike',
    details: `$${latest.amount.toFixed(2)} today vs $${baseline.toFixed(2)} daily baseline`,
    monthlyLoss: Number((excessDailySpend * 30).toFixed(2)),
    remediable: false,
    estimateBasis: `Estimate: (today's spend $${latest.amount.toFixed(2)} - ${days}-day baseline $${baseline.toFixed(2)}) x 30, flagged when today's spend is at least ${spikeMultiplier}x the baseline (configurable window and multiplier).`,
  }];
}
