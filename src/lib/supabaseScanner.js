import { invoke } from '@tauri-apps/api/tauri';

export const DEFAULT_SUPABASE_SETTINGS = {
  monthlyEstimate: 25.00,
};

export async function scanSupabaseWaste(token, options = {}) {
  if (!token) {
    return [];
  }

  const { monthlyEstimate } = { ...DEFAULT_SUPABASE_SETTINGS, ...options };

  try {
    const projects = await invoke('list_supabase_projects', { token });
    const waste = [];

    for (const project of projects || []) {
      if (project.status === 'INACTIVE' || project.status === 'GOING_TO_PAUSE') {
        waste.push({
          id: `sup-${project.id}`,
          provider: 'Supabase',
          resource: 'Paused/Idle Instance',
          details: `${project.name} (${project.region})`,
          monthlyLoss: monthlyEstimate,
          remediable: false,
          estimateBasis: `Estimate: flat $${monthlyEstimate.toFixed(2)}/month for a project reported as ${project.status} (configurable rate).`,
        });
      }
    }

    return waste;
  } catch (err) {
    console.error('Supabase scan error:', err);
    throw new Error(typeof err === 'string' ? err : err.message || 'Supabase scan failed');
  }
}
