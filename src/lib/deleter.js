import { invoke } from '@tauri-apps/api/tauri';
import { EC2Client, DeleteVolumeCommand, ReleaseAddressCommand } from '@aws-sdk/client-ec2';

export async function deleteResource(item, credentials) {
  const { provider, id } = item;

  if (provider === 'Vercel') {
    const token = credentials.vercelToken;
    if (!token) {
      return { success: false, message: 'Add a Vercel token before remediating this resource.' };
    }
    try {
      const result = await invoke('delete_vercel_project', {
        token,
        projectId: id.replace('ver-', '')
      });
      return { success: true, message: result };
    } catch (err) {
      return { success: false, message: `Failed to delete Vercel resource: ${err}` };
    }
  }

  if (provider === 'AWS') {
    const { awsKeyId, awsSecretKey } = credentials;
    if (!awsKeyId || !awsSecretKey) {
      return { success: false, message: 'Add AWS credentials before remediating this resource.' };
    }
    try {
      const client = new EC2Client({
        region: item.region || 'us-east-1',
        credentials: { accessKeyId: awsKeyId, secretAccessKey: awsSecretKey },
      });
      if (id.startsWith('vol-')) {
        await client.send(new DeleteVolumeCommand({ VolumeId: id }));
      } else if (id.startsWith('eipalloc-')) {
        await client.send(new ReleaseAddressCommand({ AllocationId: id }));
      } else {
        return { success: false, message: `AWS resource type is not supported for automatic remediation: ${id}` };
      }
      return { success: true, message: `AWS resource ${id} was terminated.` };
    } catch (err) {
      return { success: false, message: `AWS remediation failed: ${err.message || err}` };
    }
  }

  return { success: false, message: `${provider} remediation is not available yet; no changes were made.` };
}
