// A single, documented severity calculation applied uniformly to every
// finding regardless of provider, replacing the old per-scanner ad hoc
// labels (SPEC §6.9). Severity is purely a function of estimated monthly
// loss — a bigger, ongoing leak is more severe than a small one, independent
// of which provider produced it.
export const SEVERITY_THRESHOLDS = {
  high: 50,   // >= $50/month
  medium: 10, // >= $10/month, < $50/month
  // anything below $10/month is Low
};

export function computeSeverity(monthlyLoss) {
  const amount = Number(monthlyLoss) || 0;
  if (amount >= SEVERITY_THRESHOLDS.high) return 'High';
  if (amount >= SEVERITY_THRESHOLDS.medium) return 'Medium';
  return 'Low';
}

export const SEVERITY_ORDER = { High: 3, Medium: 2, Low: 1 };
