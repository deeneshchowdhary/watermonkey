import { open } from '@tauri-apps/api/shell';

/**
 * SPEC §6.6 decision: Supabase remediation is deep-link-for-manual-review,
 * not automated pause/delete. Pausing, deleting, and downgrading are
 * materially different actions with different risk profiles, and Supabase
 * findings currently carry no revalidation of project state immediately
 * before a mutation — automating any of them is out of scope until that
 * exists. Opening the project dashboard lets the user decide and act
 * directly against Supabase with full context, while Water Monkey's own
 * action stays a safe, reversible acknowledgement.
 */
export function supabaseProjectUrl(findingId) {
  const projectId = findingId.replace(/^sup-/, '');
  return `https://supabase.com/dashboard/project/${projectId}`;
}

export async function openExternal(url) {
  await open(url);
}
