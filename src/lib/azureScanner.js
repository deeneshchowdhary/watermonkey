// Azure live scanner (SPEC §6.5). Uses the OAuth2 client-credentials flow
// (an Azure AD app registration / service principal) rather than the
// previous ambiguous "client secret or bearer token" field. Read-only:
// unattached managed disks and public IPs with no attached configuration.
// All findings are non-remediable until a separate deletion spec exists.
//
// ARM's list APIs are subscription-scoped, not per-region, so unlike AWS/GCP
// there is no region loop here — one call each for disks and public IPs
// covers the whole subscription.

export const DEFAULT_AZURE_PRICING = {
  diskPricePerGbMonth: 0.05, // approximate standard HDD managed disk rate
  publicIpPricePerMonth: 3.65,
};

export async function getAccessToken(tenantId, clientId, clientSecret) {
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://management.azure.com/.default',
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.error_description ? body.error_description.split('\r\n')[0] : `status ${response.status}`;
    throw new Error(`Azure AD rejected the client credentials (${detail}).`);
  }
  const payload = await response.json();
  return payload.access_token;
}

async function listAllPages(url, accessToken) {
  const items = [];
  let nextUrl = url;
  while (nextUrl) {
    const response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401) throw new Error('Azure rejected the access token (401). It may have expired.');
    if (response.status === 403) throw new Error('Azure denied access (403). Grant the app registration the Reader role on this subscription.');
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Azure Resource Manager returned ${response.status}.${body ? ` ${body.slice(0, 200)}` : ''}`);
    }
    const payload = await response.json();
    items.push(...(payload.value || []));
    nextUrl = payload.nextLink || null;
  }
  return items;
}

function resourceGroupFromId(id) {
  const match = /\/resourceGroups\/([^/]+)\//i.exec(id || '');
  return match ? match[1] : 'unknown';
}

/**
 * Scans one Azure subscription for unattached managed disks and unused
 * public IPs. `credentials` is `{ tenantId, clientId, clientSecret }` for an
 * app registration granted (at least) Reader on the subscription. A failure
 * scanning one resource type does not discard findings from the other;
 * failures are reported via `.regionErrors` on the returned array (named to
 * match the AWS/GCP scanners' convention, even though these are resource
 * types here rather than regions).
 */
export async function scanAzureWaste(subscriptionId, credentials, pricing = {}) {
  const { tenantId, clientId, clientSecret } = credentials || {};
  if (!subscriptionId || !tenantId || !clientId || !clientSecret) return [];
  const resolvedPricing = { ...DEFAULT_AZURE_PRICING, ...pricing };

  let accessToken;
  try {
    accessToken = await getAccessToken(tenantId, clientId, clientSecret);
  } catch (err) {
    throw new Error(err.message || 'Failed to authenticate with Azure.');
  }

  const [disksResult, ipsResult] = await Promise.allSettled([
    listAllPages(`https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Compute/disks?api-version=2023-04-02`, accessToken),
    listAllPages(`https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Network/publicIPAddresses?api-version=2023-09-01`, accessToken),
  ]);

  if (disksResult.status === 'rejected' && ipsResult.status === 'rejected') {
    throw new Error(disksResult.reason?.message || 'Failed to scan Azure. Check the subscription ID and app registration credentials.');
  }

  const wasteReport = [];
  const failedScopes = [];

  if (disksResult.status === 'fulfilled') {
    disksResult.value
      .filter((disk) => disk.properties?.diskState === 'Unattached')
      .forEach((disk) => {
        const sizeGb = disk.properties?.diskSizeGB || 0;
        const monthlyCost = Number((sizeGb * resolvedPricing.diskPricePerGbMonth).toFixed(2));
        wasteReport.push({
          id: `az-disk-${disk.id}`,
          provider: 'Azure',
          resource: 'Unattached Managed Disk',
          details: `${disk.name} — ${sizeGb} GB in ${resourceGroupFromId(disk.id)}/${disk.location}`,
          monthlyLoss: monthlyCost,
          region: disk.location,
          remediable: false,
          estimateBasis: `Estimate: ${sizeGb} GB x $${resolvedPricing.diskPricePerGbMonth.toFixed(2)}/GB-month (documented fixed rate, not live Azure pricing).`,
        });
      });
  } else {
    failedScopes.push({ region: 'disks', message: disksResult.reason?.message || String(disksResult.reason) });
  }

  if (ipsResult.status === 'fulfilled') {
    ipsResult.value
      .filter((ip) => !ip.properties?.ipConfiguration)
      .forEach((ip) => {
        wasteReport.push({
          id: `az-ip-${ip.id}`,
          provider: 'Azure',
          resource: 'Unused Public IP',
          details: `${ip.name} — ${ip.properties?.ipAddress || 'unassigned'} in ${resourceGroupFromId(ip.id)}/${ip.location}`,
          monthlyLoss: resolvedPricing.publicIpPricePerMonth,
          region: ip.location,
          remediable: false,
          estimateBasis: `Estimate: flat $${resolvedPricing.publicIpPricePerMonth.toFixed(2)}/month for a public IP not attached to a NIC or load balancer (documented fixed rate).`,
        });
      });
  } else {
    failedScopes.push({ region: 'public IPs', message: ipsResult.reason?.message || String(ipsResult.reason) });
  }

  Object.defineProperty(wasteReport, 'regionErrors', { value: failedScopes, enumerable: false });
  return wasteReport;
}
