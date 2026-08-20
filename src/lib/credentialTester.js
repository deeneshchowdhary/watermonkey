import { invoke } from '@tauri-apps/api/tauri';
import { EC2Client, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { resolveAccessToken as resolveGcpAccessToken } from './gcpScanner';
import { getAccessToken as getAzureAccessToken } from './azureScanner';

const PROBE_TIMEOUT_MS = 15000;

/**
 * Closed vocabulary for a credential probe result. The Rust probe in
 * `src-tauri/src/main.rs` emits the same strings.
 *
 * valid                    credentials work and expose the scope a scan needs
 * invalid_credentials      the provider rejected the credential itself
 * insufficient_permissions the credential is real but lacks the read scope
 * rate_limited             the provider throttled the probe
 * network_error            the provider could not be reached
 * format_error             the value fails local validation before any request
 * unsupported              no live test exists for this credential model yet
 * provider_error           an unexpected provider response
 * not_configured           nothing to test
 */
export const PROBE_OUTCOMES = {
  valid: { label: 'Connected', tone: 'success' },
  invalid_credentials: { label: 'Invalid credentials', tone: 'error' },
  insufficient_permissions: { label: 'Insufficient permissions', tone: 'warning' },
  rate_limited: { label: 'Rate limited', tone: 'warning' },
  network_error: { label: 'Network error', tone: 'warning' },
  format_error: { label: 'Invalid format', tone: 'error' },
  unsupported: { label: 'Not verifiable yet', tone: 'neutral' },
  provider_error: { label: 'Provider error', tone: 'warning' },
  not_configured: { label: 'Not configured', tone: 'neutral' },
};

const REDACTION = '••••';

/**
 * Strips credential values out of any text bound for the UI, activity log, or
 * console. Short values are skipped: they are more likely to collide with
 * ordinary words than to be a real secret.
 */
export function redactSecrets(text, secrets = []) {
  return secrets
    .filter((secret) => typeof secret === 'string' && secret.length >= 8)
    .reduce((output, secret) => output.split(secret).join(REDACTION), String(text ?? ''));
}

function result(outcome, message) {
  return { outcome, message };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function networkFailure(providerName, error) {
  const reason = error?.name === 'AbortError'
    ? 'the request timed out'
    : error?.message || String(error);
  return result('network_error', `Could not reach ${providerName} (${reason}).`);
}

// --- AWS ------------------------------------------------------------------

const AWS_INVALID_CREDENTIAL_CODES = new Set([
  'AuthFailure',
  'InvalidClientTokenId',
  'UnrecognizedClientException',
  'SignatureDoesNotMatch',
  'MissingAuthenticationToken',
  'InvalidAccessKeyId',
  'ExpiredToken',
  'ExpiredTokenException',
]);

const AWS_PERMISSION_CODES = new Set([
  'UnauthorizedOperation',
  'AccessDenied',
  'AccessDeniedException',
  'OptInRequired',
]);

const AWS_THROTTLE_CODES = new Set([
  'RequestLimitExceeded',
  'Throttling',
  'ThrottlingException',
]);

const AWS_NETWORK_CODES = new Set([
  'NetworkingError',
  'TimeoutError',
  'AbortError',
  'RequestTimeout',
  'RequestTimeoutException',
]);

async function testAws({ keyId, secretKey }, options) {
  const region = options.region || 'us-east-1';
  const client = new EC2Client({
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: secretKey },
  });

  try {
    // The smallest call that exercises the exact permission the scanner needs.
    await client.send(new DescribeVolumesCommand({ MaxResults: 5 }));
    return result('valid', `Access key accepted. EBS volumes are readable in ${region}.`);
  } catch (error) {
    const code = error?.name || error?.Code || '';
    const status = error?.$metadata?.httpStatusCode;

    if (AWS_INVALID_CREDENTIAL_CODES.has(code)) {
      return result('invalid_credentials', `AWS rejected the access key (${code}).`);
    }
    if (AWS_PERMISSION_CODES.has(code)) {
      return result('insufficient_permissions', `The key is valid but is missing ec2:DescribeVolumes (${code}).`);
    }
    if (AWS_THROTTLE_CODES.has(code)) {
      return result('rate_limited', `AWS is throttling this key (${code}). Try again shortly.`);
    }
    if (AWS_NETWORK_CODES.has(code) || status === undefined) {
      return networkFailure('AWS', error);
    }
    return result('provider_error', `AWS returned an unexpected error (${code || status}).`);
  }
}

// --- Vercel ---------------------------------------------------------------

async function testVercel({ keyId: token }) {
  let response;
  try {
    response = await fetchWithTimeout('https://api.vercel.com/v9/projects?limit=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    return networkFailure('Vercel', error);
  }

  if (response.ok) {
    return result('valid', 'Token accepted. Projects are readable.');
  }
  if (response.status === 401) {
    return result('invalid_credentials', 'Vercel rejected the token (401). Create a new personal access token.');
  }
  if (response.status === 403) {
    // Vercel answers 403 for both a bad token and a scope gap; only the
    // `invalidToken` flag in the body separates them.
    const body = await response.json().catch(() => ({}));
    return body?.error?.invalidToken
      ? result('invalid_credentials', 'Vercel rejected the token (403, invalid token). Create a new personal access token.')
      : result('insufficient_permissions', 'The token is valid but cannot read projects in this scope (403). Check the team scope it was issued for.');
  }
  if (response.status === 429) {
    return result('rate_limited', 'Vercel is rate limiting this token (429). Try again shortly.');
  }
  return result('provider_error', `Vercel returned status ${response.status}.`);
}

// --- Supabase -------------------------------------------------------------

async function testSupabase({ keyId: token }) {
  try {
    // Supabase calls run through Rust, so the probe does too.
    const probe = await invoke('test_supabase_credentials', { token });
    return result(probe.outcome, probe.message);
  } catch (error) {
    return result('network_error', `Could not run the Supabase check (${error?.message || error}).`);
  }
}

// --- OpenAI ---------------------------------------------------------------

async function testOpenAi({ keyId: adminKey }) {
  const endTime = Math.floor(Date.now() / 1000);
  const url = new URL('https://api.openai.com/v1/organization/costs');
  url.searchParams.set('start_time', String(endTime - 24 * 60 * 60));
  url.searchParams.set('end_time', String(endTime));
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.set('limit', '1');

  let response;
  try {
    response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${adminKey}` } });
  } catch (error) {
    return networkFailure('OpenAI', error);
  }

  if (response.ok) {
    return result('valid', 'Admin key accepted. Organization cost data is readable.');
  }
  if (response.status === 401) {
    return result('invalid_credentials', 'OpenAI rejected the key (401). Check that it has not been revoked.');
  }
  if (response.status === 403) {
    return result('insufficient_permissions', 'The key is valid but is not an organization admin key (403). Cost data requires admin scope.');
  }
  if (response.status === 429) {
    return result('rate_limited', 'OpenAI is rate limiting this key (429). Try again shortly.');
  }
  return result('provider_error', `OpenAI returned status ${response.status}.`);
}

// --- GCP ------------------------------------------------------------------
// keyId = project ID, secretKey = service account JSON or a raw OAuth token
// (matches the field layout used by gcpScanner.js).

async function testGcp({ keyId: projectId, secretKey: credential }) {
  let accessToken;
  try {
    accessToken = await resolveGcpAccessToken(credential.trim());
  } catch (error) {
    return result('invalid_credentials', error.message || 'Failed to authenticate with GCP.');
  }

  let response;
  try {
    response = await fetchWithTimeout(`https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId.trim())}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    return networkFailure('Google Cloud', error);
  }

  if (response.ok) {
    return result('valid', `Credential accepted. Project "${projectId.trim()}" is readable.`);
  }
  if (response.status === 401) {
    return result('invalid_credentials', 'GCP rejected the access token (401). It may be expired or malformed.');
  }
  if (response.status === 403) {
    return result('insufficient_permissions', 'The credential is valid but lacks Compute read access to this project (403). Grant roles/compute.viewer or broader.');
  }
  if (response.status === 404) {
    return result('invalid_credentials', `Project "${projectId.trim()}" was not found (404). Check the project ID.`);
  }
  if (response.status === 429) {
    return result('rate_limited', 'GCP is rate limiting this credential (429). Try again shortly.');
  }
  return result('provider_error', `GCP Compute API returned status ${response.status}.`);
}

// --- Azure ----------------------------------------------------------------
// keyId = subscription ID, secretKey = JSON-encoded { tenantId, clientId,
// clientSecret } (matches the field layout used by azureScanner.js and the
// keychain storage decision to pack all three into the existing secret slot).

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function testAzure({ keyId: subscriptionId, secretKey }) {
  if (!GUID_PATTERN.test(subscriptionId.trim())) {
    return result('format_error', 'The subscription ID is not a GUID (00000000-0000-0000-0000-000000000000).');
  }

  let credentials;
  try {
    credentials = JSON.parse(secretKey);
  } catch {
    return result('format_error', 'Tenant ID, client ID, and client secret were not saved correctly. Re-enter them and save again.');
  }
  const { tenantId, clientId, clientSecret } = credentials;
  if (!tenantId || !clientId || !clientSecret) {
    return result('format_error', 'Tenant ID, client ID, and client secret are all required.');
  }

  let accessToken;
  try {
    accessToken = await getAzureAccessToken(tenantId, clientId, clientSecret);
  } catch (error) {
    return result('invalid_credentials', error.message || 'Failed to authenticate with Azure AD.');
  }

  let response;
  try {
    response = await fetchWithTimeout(
      `https://management.azure.com/subscriptions/${subscriptionId.trim()}?api-version=2022-12-01`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (error) {
    return networkFailure('Azure Resource Manager', error);
  }

  if (response.ok) {
    return result('valid', 'App registration accepted. The subscription is readable.');
  }
  if (response.status === 403) {
    return result('insufficient_permissions', 'Authentication succeeded but the app registration lacks Reader access to this subscription (403).');
  }
  if (response.status === 404) {
    // ARM resolves the subscription before it checks the token, so a 404
    // says nothing about the token itself.
    return result('insufficient_permissions', 'The subscription is not visible to this app registration (404). Check the subscription ID and that it is in the same tenant.');
  }
  if (response.status === 429) {
    return result('rate_limited', 'Azure is throttling this request (429). Try again shortly.');
  }
  return result('provider_error', `Azure Resource Manager returned status ${response.status}.`);
}

const PROBES = {
  aws: { name: 'AWS', required: ['keyId', 'secretKey'], run: testAws },
  gcp: { name: 'Google Cloud', required: ['keyId', 'secretKey'], run: testGcp },
  azure: { name: 'Azure', required: ['keyId', 'secretKey'], run: testAzure },
  vercel: { name: 'Vercel', required: ['keyId'], run: testVercel },
  supabase: { name: 'Supabase', required: ['keyId'], run: testSupabase },
  openai: { name: 'OpenAI', required: ['keyId'], run: testOpenAi },
};

/**
 * Runs a read-only credential check for one provider without starting a scan.
 * Always resolves; never throws. Messages are redacted before they are
 * returned, so callers can safely log or render them.
 */
export async function testProviderCredentials(providerId, credentials = {}, options = {}) {
  const probe = PROBES[providerId];
  if (!probe) {
    return result('unsupported', `No credential test is defined for ${providerId}.`);
  }

  const keyId = String(credentials.keyId ?? '');
  const secretKey = String(credentials.secretKey ?? '');
  const values = { keyId, secretKey };
  if (probe.required.some((field) => !values[field].trim())) {
    return result('not_configured', `Complete the ${probe.name} fields before testing.`);
  }

  let outcome;
  try {
    outcome = await probe.run(values, options);
  } catch (error) {
    outcome = result('provider_error', `The ${probe.name} check failed unexpectedly (${error?.message || error}).`);
  }

  return {
    outcome: outcome.outcome,
    message: redactSecrets(outcome.message, [keyId, secretKey]),
  };
}
