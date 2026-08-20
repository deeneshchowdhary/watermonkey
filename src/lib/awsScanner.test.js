import { describe, expect, it, vi, beforeEach } from 'vitest';

let volumesResponse = { Volumes: [] };
let addressesResponse = { Addresses: [] };
let regionsToFail = new Set();

vi.mock('@aws-sdk/client-ec2', () => {
  class DescribeVolumesCommand {}
  class DescribeAddressesCommand {}
  class EC2Client {
    constructor(config) { this.region = config.region; }
    async send(command) {
      if (regionsToFail.has(this.region)) throw new Error(`simulated failure in ${this.region}`);
      if (command instanceof DescribeVolumesCommand) return volumesResponse;
      if (command instanceof DescribeAddressesCommand) return addressesResponse;
      throw new Error('unexpected command');
    }
  }
  return { EC2Client, DescribeVolumesCommand, DescribeAddressesCommand };
});

const { scanAwsWaste } = await import('./awsScanner');

describe('scanAwsWaste', () => {
  beforeEach(() => {
    volumesResponse = { Volumes: [] };
    addressesResponse = { Addresses: [] };
    regionsToFail = new Set();
  });

  it('flags an available (unattached) volume with the configured GB rate', async () => {
    volumesResponse = { Volumes: [{ VolumeId: 'vol-1', Size: 100, VolumeType: 'gp3', AvailabilityZone: 'us-east-1a' }] };
    const waste = await scanAwsWaste(['us-east-1'], 'key', 'secret', { ebsPricePerGbMonth: 0.12 });
    expect(waste).toHaveLength(1);
    expect(waste[0].monthlyLoss).toBe(12);
    expect(waste[0].remediable).toBe(true);
    expect(waste[0].region).toBe('us-east-1');
  });

  it('flags an Elastic IP with no AssociationId, and skips an associated one', async () => {
    addressesResponse = {
      Addresses: [
        { AllocationId: 'eipalloc-1', PublicIp: '1.2.3.4' },
        { AllocationId: 'eipalloc-2', PublicIp: '5.6.7.8', AssociationId: 'assoc-1' },
      ],
    };
    const waste = await scanAwsWaste(['us-east-1'], 'key', 'secret', { elasticIpPricePerMonth: 3.6 });
    expect(waste).toHaveLength(1);
    expect(waste[0].id).toBe('eipalloc-1');
  });

  it('merges findings across multiple regions', async () => {
    // same mock response applies regardless of region in this simple client stub
    volumesResponse = { Volumes: [{ VolumeId: 'vol-1', Size: 10, VolumeType: 'gp3', AvailabilityZone: 'a' }] };
    const waste = await scanAwsWaste(['us-east-1', 'us-west-2'], 'key', 'secret');
    expect(waste).toHaveLength(2);
    expect(new Set(waste.map((w) => w.region))).toEqual(new Set(['us-east-1', 'us-west-2']));
  });

  it('keeps findings from regions that succeeded when another region fails, and reports the failure', async () => {
    volumesResponse = { Volumes: [{ VolumeId: 'vol-1', Size: 10, VolumeType: 'gp3', AvailabilityZone: 'a' }] };
    regionsToFail = new Set(['us-west-2']);
    const waste = await scanAwsWaste(['us-east-1', 'us-west-2'], 'key', 'secret');
    expect(waste).toHaveLength(1);
    expect(waste[0].region).toBe('us-east-1');
    expect(waste.regionErrors).toEqual([{ region: 'us-west-2', message: 'simulated failure in us-west-2' }]);
  });

  it('throws when every region fails', async () => {
    regionsToFail = new Set(['us-east-1']);
    await expect(scanAwsWaste(['us-east-1'], 'key', 'secret')).rejects.toThrow();
  });
});
