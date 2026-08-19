export async function scanVercelWaste(token) {
  if (!token) {
    return [];
  }

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

      if (daysInactive > 60) {
        waste.push({
          id: `ver-${project.id}`,
          provider: 'Vercel',
          resource: 'Inactive Project',
          details: `${project.name} (${daysInactive}d inactive)`,
          monthlyLoss: 20.00,
          remediable: true,
        });
      }
    }

    return waste;
  } catch (err) {
    console.error('Vercel scan error:', err);
    throw err;
  }
}
