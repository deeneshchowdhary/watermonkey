import { invoke } from '@tauri-apps/api/tauri';

export async function storeLocalKeys(provider, keyId, secretKey) {
  try {
    await invoke('save_credentials', { provider, keyId, secretKey });
    return true;
  } catch (err) {
    console.error(`Failed to store ${provider} keys:`, err);
    return false;
  }
}

export async function retrieveLocalKeys(provider) {
  try {
    const [keyId, secretKey] = await invoke('get_credentials', { provider });
    return { keyId, secretKey };
  } catch (err) {
    return null;
  }
}
