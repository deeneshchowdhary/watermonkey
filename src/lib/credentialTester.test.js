import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: (...args) => invokeMock(...args) }));

let ec2SendMock = vi.fn();
vi.mock('@aws-sdk/client-ec2', () => {
  class EC2Client { async send(cmd) { return ec2SendMock(cmd); } }
  class DescribeVolumesCommand {}
  return { EC2Client, DescribeVolumesCommand };
});

const resolveGcpAccessTokenMock = vi.fn();
vi.mock('./gcpScanner', () => ({ resolveAccessToken: (...args) => resolveGcpAccessTokenMock(...args) }));

const getAzureAccessTokenMock = vi.fn();
vi.mock('./azureScanner', () => ({ getAccessToken: (...args) => getAzureAccessTokenMock(...args) }));

const { testProviderCredentials, redactSecrets } = await import('./credentialTester');

describe('redactSecrets', () => {
  it('replaces long secret values but leaves short strings alone', () => {
    const out = redactSecrets('token=sk-admin-verylongsecret failed for x', ['sk-admin-verylongsecret', 'x']);
    expect(out).not.toContain('sk-admin-verylongsecret');
    expect(out).toContain('x'); // too short to redact, and would over-match
  });
});

describe('testProviderCredentials — not_configured', () => {
  it.each(['aws', 'gcp', 'azure', 'vercel', 'supabase', 'openai'])('reports not_configured for %s with empty fields', async (provider) => {
    const result = await testProviderCredentials(provider, {});
    expect(result.outcome).toBe('not_configured');
  });
});

describe('testProviderCredentials — azure format checks (no network)', () => {
  it('rejects a non-GUID subscription ID before attempting auth', async () => {
    const result = await testProviderCredentials('azure', { keyId: 'not-a-guid', secretKey: JSON.stringify({ tenantId: 't', clientId: 'c', clientSecret: 's' }) });
    expect(result.outcome).toBe('format_error');
    expect(getAzureAccessTokenMock).not.toHaveBeenCalled();
  });

  it('rejects a missing tenant/client/secret before attempting auth', async () => {
    const result = await testProviderCredentials('azure', { keyId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', secretKey: JSON.stringify({ tenantId: '', clientId: 'c', clientSecret: 's' }) });
    expect(result.outcome).toBe('format_error');
    expect(getAzureAccessTokenMock).not.toHaveBeenCalled();
  });
});

describe('testProviderCredentials — gcp (mocked auth)', () => {
  beforeEach(() => {
    resolveGcpAccessTokenMock.mockReset();
    global.fetch = vi.fn();
  });

  it('reports invalid_credentials when the auth exchange itself fails', async () => {
    resolveGcpAccessTokenMock.mockRejectedValue(new Error('bad key'));
    const result = await testProviderCredentials('gcp', { keyId: 'my-project', secretKey: 'garbage' });
    expect(result.outcome).toBe('invalid_credentials');
  });

  it('reports valid when the project is readable', async () => {
    resolveGcpAccessTokenMock.mockResolvedValue('access-token');
    global.fetch.mockResolvedValue({ ok: true });
    const result = await testProviderCredentials('gcp', { keyId: 'my-project', secretKey: 'a-token' });
    expect(result.outcome).toBe('valid');
  });

  it('reports insufficient_permissions on a 403', async () => {
    resolveGcpAccessTokenMock.mockResolvedValue('access-token');
    global.fetch.mockResolvedValue({ ok: false, status: 403 });
    const result = await testProviderCredentials('gcp', { keyId: 'my-project', secretKey: 'a-token' });
    expect(result.outcome).toBe('insufficient_permissions');
  });
});

describe('testProviderCredentials — aws (mocked SDK)', () => {
  beforeEach(() => {
    ec2SendMock = vi.fn();
  });

  it('reports valid when DescribeVolumes succeeds', async () => {
    ec2SendMock.mockResolvedValue({ Volumes: [] });
    const result = await testProviderCredentials('aws', { keyId: 'AKIA...', secretKey: 'secret' });
    expect(result.outcome).toBe('valid');
  });

  it('classifies AuthFailure as invalid_credentials', async () => {
    const err = new Error('auth failed');
    err.name = 'AuthFailure';
    ec2SendMock.mockRejectedValue(err);
    const result = await testProviderCredentials('aws', { keyId: 'AKIA...', secretKey: 'secret' });
    expect(result.outcome).toBe('invalid_credentials');
  });

  it('classifies UnauthorizedOperation as insufficient_permissions', async () => {
    const err = new Error('not authorized');
    err.name = 'UnauthorizedOperation';
    ec2SendMock.mockRejectedValue(err);
    const result = await testProviderCredentials('aws', { keyId: 'AKIA...', secretKey: 'secret' });
    expect(result.outcome).toBe('insufficient_permissions');
  });
});

describe('testProviderCredentials — supabase (routed through Rust)', () => {
  it('passes the Rust probe outcome straight through', async () => {
    invokeMock.mockResolvedValue({ outcome: 'valid', message: 'ok' });
    const result = await testProviderCredentials('supabase', { keyId: 'sbp_token' });
    expect(result.outcome).toBe('valid');
    expect(invokeMock).toHaveBeenCalledWith('test_supabase_credentials', { token: 'sbp_token' });
  });
});
