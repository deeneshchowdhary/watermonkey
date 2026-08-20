export const DEFAULT_VERCEL_SETTINGS = {
  inactivityDays: 60,
  monthlyEstimate: 20.00,
};

export async function scanVercelWaste(token, options = {}) {
  if (!token) {
    return [];
  }

  const { inactivityDays, monthlyEstimate } = { ...DEFAULT_VERCEL_SETTINGS, ...options };

  try {
    const res = await fetch('https://api.vercel.com/v9/projects', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Vercel API error: ${res.statusText}`);

    const data = await res.json();
    const waste = [];

    for (const project of data.projects || []) {
      const updatedAt = new Date(project.updatedAt);
      const daysInactive = Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

      if (daysInactive > inactivityDays) {
        waste.push({
          id: `ver-${project.id}`,
          provider: 'Vercel',
          resource: 'Inactive Project',
          details: `${project.name} (${daysInactive}d inactive, threshold ${inactivityDays}d)`,
          monthlyLoss: monthlyEstimate,
          remediable: true,
          estimateBasis: `Estimate: flat $${monthlyEstimate.toFixed(2)}/month for a project with no deployments in the last ${inactivityDays} days (configurable threshold and rate).`,
        });
      }
    }

    return waste;
  } catch (err) {
    console.error('Vercel scan error:', err);
    throw err;
  }
}
