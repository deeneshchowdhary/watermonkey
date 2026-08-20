import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: (...args) => invokeMock(...args) }));

let sendMock = vi.fn();
vi.mock('@aws-sdk/client-ec2', () => {
  class EC2Client { async send(cmd) { return sendMock(cmd); } }
  class DeleteVolumeCommand { constructor(input) { this.input = input; this.kind = 'delete-volume'; } }
  class ReleaseAddressCommand { constructor(input) { this.input = input; this.kind = 'release-address'; } }
  return { EC2Client, DeleteVolumeCommand, ReleaseAddressCommand };
});

const { deleteResource } = await import('./deleter');

describe('deleteResource', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    sendMock = vi.fn().mockResolvedValue({});
  });

  it('never touches a provider when remediable is not exactly true (default-safe dispatch)', async () => {
    const result = await deleteResource({ provider: 'AWS', id: 'vol-1', remediable: false }, {});
    expect(result.success).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('treats an omitted remediable flag as non-remediable too', async () => {
    const result = await deleteResource({ provider: 'AWS', id: 'vol-1' }, {});
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized AWS resource ID shape without calling the provider', async () => {
    const result = await deleteResource({ provider: 'AWS', id: 'not-a-known-prefix', remediable: true }, { awsKeyId: 'k', awsSecretKey: 's' });
    expect(result.success).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('deletes an AWS volume by ID prefix', async () => {
    const result = await deleteResource({ provider: 'AWS', id: 'vol-123', remediable: true, region: 'us-east-1' }, { awsKeyId: 'k', awsSecretKey: 's' });
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].kind).toBe('delete-volume');
  });

  it('releases an AWS Elastic IP by allocation ID prefix', async () => {
    const result = await deleteResource({ provider: 'AWS', id: 'eipalloc-123', remediable: true }, { awsKeyId: 'k', awsSecretKey: 's' });
    expect(result.success).toBe(true);
    expect(sendMock.mock.calls[0][0].kind).toBe('release-address');
  });

  it('refuses AWS remediation without credentials', async () => {
    const result = await deleteResource({ provider: 'AWS', id: 'vol-1', remediable: true }, {});
    expect(result.success).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('deletes a Vercel project through the Rust command', async () => {
    invokeMock.mockResolvedValue('Successfully deleted Vercel project p1');
    const result = await deleteResource({ provider: 'Vercel', id: 'ver-p1', remediable: true }, { vercelToken: 't' });
    expect(result.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('delete_vercel_project', { token: 't', projectId: 'p1' });
  });

  it('refuses Supabase remediation even when remediable is true, since no automation exists', async () => {
    const result = await deleteResource({ provider: 'Supabase', id: 'sup-1', remediable: true }, {});
    expect(result.success).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
