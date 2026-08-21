import { loadVersioned, saveVersioned } from './versionedStorage';

const STORAGE_KEY = 'watermonkey-activity';
const MAX_EVENTS = 250;

// Schema versioning (SPEC §9). Version 0 is the original unwrapped bare
// array written before this schema existed; migrating it just means
// wrapping it as `{ events }`, since the event shape itself hasn't changed.
const SCHEMA_VERSION = 1;
const MIGRATIONS = {
  0: (data) => ({ events: Array.isArray(data) ? data : [] }),
};

export function loadActivity() {
  const data = loadVersioned(STORAGE_KEY, SCHEMA_VERSION, MIGRATIONS, { events: [] });
  return Array.isArray(data.events) ? data.events : [];
}

export function saveActivity(events) {
  const bounded = events.slice(0, MAX_EVENTS);
  saveVersioned(STORAGE_KEY, SCHEMA_VERSION, { events: bounded });
  return bounded;
}
