// Versioned localStorage persistence with migration handling (SPEC §9 —
// "versioned finding and activity storage with migration handling").
//
// Data is stored wrapped as `{ version, data }`. Anything written before
// this wrapper existed has no `version` field at all — that's treated as
// version 0 and run through the same migration chain as everything else,
// so upgrading the app never silently drops or corrupts a user's existing
// findings or activity history.

export function loadVersioned(key, currentVersion, migrations, fallback) {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return fallback;
  }
  if (!raw || typeof raw !== 'object') return fallback;

  const hasVersion = Number.isInteger(raw.version);
  let version = hasVersion ? raw.version : 0;
  let data = hasVersion ? raw.data : raw;

  // A version ahead of what this build knows about (e.g. the app was
  // downgraded after a schema change) is left as-is rather than guessed at.
  while (version < currentVersion) {
    const migrate = migrations[version];
    if (!migrate) break;
    data = migrate(data);
    version += 1;
  }

  return data;
}

export function saveVersioned(key, currentVersion, data) {
  localStorage.setItem(key, JSON.stringify({ version: currentVersion, data }));
}
