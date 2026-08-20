// GCP live scanner (SPEC §6.4). Read-only: unattached persistent disks and
// reserved-but-unused static external IP addresses. All findings are
// non-remediable until a separate deletion spec exists.

const COMPUTE_READONLY_SCOPE = 'https://www.googleapis.com/auth/compute.readonly';

// A curated set of zones/regions, not the full GCP catalog — same rationale
// as AWS_REGIONS: keeps the picker usable while covering common setups.
export const GCP_ZONES = [
  { id: 'us-central1-a', label: 'us-central1-a (Iowa)' },
  { id: 'us-east1-b', label: 'us-east1-b (S. Carolina)' },
  { id: 'us-west1-a', label: 'us-west1-a (Oregon)' },
  { id: 'europe-west1-b', label: 'europe-west1-b (Belgium)' },
  { id: 'europe-west4-a', label: 'europe-west4-a (Netherlands)' },
  { id: 'asia-east1-a', label: 'asia-east1-a (Taiwan)' },
  { id: 'asia-southeast1-a', label: 'asia-southeast1-a (Singapore)' },
];

export const DEFAULT_GCP_PRICING = {
  diskPricePerGbMonth: 0.04, // approximate standard persistent disk rate
  staticIpPricePerMonth: 7.30, // GCP charges for a reserved static IP that isn't in use
};

function base64UrlEncode(bytes) {
  let binary = typeof bytes === 'string' ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Exchanges a service account JSON key for a short-lived OAuth access token
 * using the JWT-bearer flow (RFC 7523), signed locally with Web Crypto —
 * the private key never leaves the device except as a signature.
 */
async function getAccessTokenFromServiceAccount(serviceAccount) {
  const tokenUri = serviceAccount.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: COMPUTE_READONLY_SCOPE,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google rejected the service account key exchange (${response.status}).${body ? ` ${body.slice(0, 200)}` : ''}`);
  }
  const payload = await response.json();
  return payload.access_token;
}

export async function resolveAccessToken(credentialValue) {
  const trimmed = credentialValue.trim();
  if (trimmed.startsWith('{')) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(trimmed);
    } catch {
      throw new Error('The GCP service account credential is not valid JSON.');
    }
    if (serviceAccount.type !== 'service_account' || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('The GCP credential must be a service account key JSON (type "service_account").');
    }
    return getAccessTokenFromServiceAccount(serviceAccount);
  }
  return trimmed; // treat as an already-issued OAuth access token
}

async function listAllPages(url, accessToken, itemsKey) {
  const items = [];
  let pageToken;
  do {
    const pagedUrl = new URL(url);
    if (pageToken) pagedUrl.searchParams.set('pageToken', pageToken);
    const response = await fetch(pagedUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 403) {
      throw new Error('GCP rejected the request (403). Grant the service account a Compute read role (roles/compute.viewer or broader).');
    }
    if (response.status === 401) {
      throw new Error('GCP rejected the access token (401). It may be expired or malformed.');
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`GCP Compute API returned ${response.status}.${body ? ` ${body.slice(0, 200)}` : ''}`);
    }
    const payload = await response.json();
    items.push(...(payload[itemsKey] || []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return items;
}

async function scanZoneDisks(projectId, zone, accessToken, pricing) {
  const disks = await listAllPages(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/disks`,
    accessToken,
    'items',
  );
  return disks
    .filter((disk) => !disk.users || disk.users.length === 0)
    .map((disk) => {
      const sizeGb = Number(disk.sizeGb) || 0;
      const monthlyCost = Number((sizeGb * pricing.diskPricePerGbMonth).toFixed(2));
      return {
        id: `gcp-disk-${disk.id}`,
        provider: 'GCP',
        resource: 'Unattached Persistent Disk',
        details: `${disk.name} — ${sizeGb} GB (${(disk.type || '').split('/').pop() || 'pd-standard'}) in ${zone}, project ${projectId}`,
        monthlyLoss: monthlyCost,
        region: zone,
        remediable: false,
        estimateBasis: `Estimate: ${sizeGb} GB x $${pricing.diskPricePerGbMonth.toFixed(2)}/GB-month (documented fixed rate, not live GCP pricing).`,
      };
    });
}

async function scanRegionAddresses(projectId, region, accessToken, pricing) {
  const addresses = await listAllPages(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${region}/addresses`,
    accessToken,
    'items',
  );
  return addresses
    .filter((address) => address.status === 'RESERVED')
    .map((address) => ({
      id: `gcp-ip-${address.id}`,
      provider: 'GCP',
      resource: 'Reserved Unused Static IP',
      details: `${address.name} — ${address.address} in ${region}, project ${projectId}`,
      monthlyLoss: pricing.staticIpPricePerMonth,
      region,
      remediable: false,
      estimateBasis: `Estimate: flat $${pricing.staticIpPricePerMonth.toFixed(2)}/month for a reserved static IP not attached to a resource (documented fixed rate).`,
    }));
}

/**
 * Scans the given GCP project across the given zones for unattached
 * persistent disks and reserved-but-unused static IPs. `credentialValue` is
 * either a service account JSON key or a raw OAuth access token. A zone
 * that fails to scan does not discard findings from zones that succeeded;
 * failures are reported via `.regionErrors` on the returned array.
 */
export async function scanGcpWaste(projectId, credentialValue, zones, pricing = {}) {
  if (!projectId || !credentialValue) return [];
  const zoneList = Array.isArray(zones) && zones.length ? zones : GCP_ZONES.map((z) => z.id);
  const resolvedPricing = { ...DEFAULT_GCP_PRICING, ...pricing };

  let accessToken;
  try {
    accessToken = await resolveAccessToken(credentialValue);
  } catch (err) {
    throw new Error(err.message || 'Failed to authenticate with GCP.');
  }

  const regions = [...new Set(zoneList.map((zone) => zone.replace(/-[a-z]$/, '')))];

  const [diskResults, addressResults] = await Promise.all([
    Promise.allSettled(zoneList.map((zone) => scanZoneDisks(projectId, zone, accessToken, resolvedPricing))),
    Promise.allSettled(regions.map((region) => scanRegionAddresses(projectId, region, accessToken, resolvedPricing))),
  ]);

  const failedScopes = [
    ...diskResults.map((r, i) => (r.status === 'rejected' ? { region: zoneList[i], message: r.reason?.message || String(r.reason) } : null)),
    ...addressResults.map((r, i) => (r.status === 'rejected' ? { region: regions[i], message: r.reason?.message || String(r.reason) } : null)),
  ].filter(Boolean);

  const succeededAny = diskResults.some((r) => r.status === 'fulfilled') || addressResults.some((r) => r.status === 'fulfilled');
  if (!succeededAny) {
    throw new Error(failedScopes[0]?.message || 'Failed to scan GCP. Check the project ID and credential.');
  }

  const wasteReport = [
    ...diskResults.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value),
    ...addressResults.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value),
  ];
  Object.defineProperty(wasteReport, 'regionErrors', { value: failedScopes, enumerable: false });
  return wasteReport;
}
