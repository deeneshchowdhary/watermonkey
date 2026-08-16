import { invoke } from '@tauri-apps/api/tauri';

export async function scanSupabaseWaste(token) {
  if (!token) {
    return [];
  }

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
          monthlyLoss: 25.00
        });
      }
    }

    return waste;
  } catch (err) {
    console.error('Supabase scan error:', err);
    throw new Error(typeof err === 'string' ? err : err.message || 'Supabase scan failed');
  }
}
