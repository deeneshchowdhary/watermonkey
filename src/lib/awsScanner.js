import { EC2Client, DescribeVolumesCommand, DescribeAddressesCommand } from "@aws-sdk/client-ec2";

export const DEFAULT_AWS_PRICING = {
  ebsPricePerGbMonth: 0.10,
  elasticIpPricePerMonth: 3.60,
};

// A curated subset of commonly used EC2 regions, not the full AWS region
// list — keeps the region picker manageable while still covering the
// regions most small teams actually run in.
export const AWS_REGIONS = [
  { id: 'us-east-1', label: 'US East (N. Virginia)' },
  { id: 'us-east-2', label: 'US East (Ohio)' },
  { id: 'us-west-1', label: 'US West (N. California)' },
  { id: 'us-west-2', label: 'US West (Oregon)' },
  { id: 'eu-west-1', label: 'EU (Ireland)' },
  { id: 'eu-west-2', label: 'EU (London)' },
  { id: 'eu-central-1', label: 'EU (Frankfurt)' },
  { id: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { id: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { id: 'sa-east-1', label: 'South America (São Paulo)' },
];

async function scanAwsRegion(region, accessKeyId, secretAccessKey, pricing) {
  const client = new EC2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const wasteReport = [];

  const volumeCmd = new DescribeVolumesCommand({
    Filters: [{ Name: "status", Values: ["available"] }],
  });
  const volumeRes = await client.send(volumeCmd);

  (volumeRes.Volumes || []).forEach((vol) => {
    const sizeGb = vol.Size || 0;
    const monthlyCost = Number((sizeGb * pricing.ebsPricePerGbMonth).toFixed(2));
    wasteReport.push({
      id: vol.VolumeId,
      provider: "AWS",
      resource: "Unattached EBS Volume",
      details: `${sizeGb} GB (${vol.VolumeType}) in ${vol.AvailabilityZone}`,
      monthlyLoss: monthlyCost,
      region,
      remediable: true,
      estimateBasis: `Estimate: ${sizeGb} GB x $${pricing.ebsPricePerGbMonth.toFixed(2)}/GB-month (configurable rate, not live AWS pricing).`,
    });
  });

  const eipCmd = new DescribeAddressesCommand({});
  const eipRes = await client.send(eipCmd);

  (eipRes.Addresses || []).forEach((eip) => {
    if (!eip.AssociationId) {
      wasteReport.push({
        id: eip.AllocationId || eip.PublicIp,
        provider: "AWS",
        resource: "Unassigned Elastic IP",
        details: `Public IP: ${eip.PublicIp}`,
        monthlyLoss: pricing.elasticIpPricePerMonth,
        region,
        remediable: true,
        estimateBasis: `Estimate: flat $${pricing.elasticIpPricePerMonth.toFixed(2)}/month for an unassociated Elastic IP (configurable rate).`,
      });
    }
  });

  return wasteReport;
}

/**
 * Scans one or more AWS regions for unattached EBS volumes and unassigned
 * Elastic IPs. A region that fails to scan does not discard findings from
 * regions that succeeded; failed regions are reported via `.regionErrors` on
 * the returned array so the caller can surface a partial-scan warning.
 */
export async function scanAwsWaste(regions, accessKeyId, secretAccessKey, pricing = {}) {
  const regionList = Array.isArray(regions) && regions.length ? regions : ["us-east-1"];
  const resolvedPricing = { ...DEFAULT_AWS_PRICING, ...pricing };

  const settled = await Promise.allSettled(
    regionList.map((region) => scanAwsRegion(region, accessKeyId, secretAccessKey, resolvedPricing)),
  );

  const failedRegions = settled
    .map((result, index) => (result.status === "rejected" ? { region: regionList[index], message: result.reason?.message || String(result.reason) } : null))
    .filter(Boolean);

  const succeeded = settled.filter((result) => result.status === "fulfilled");
  if (succeeded.length === 0) {
    console.error("AWS Scan Error:", failedRegions);
    throw new Error("Failed to scan AWS. Check your local API credentials and selected regions.");
  }

  const wasteReport = succeeded.flatMap((result) => result.value);
  // Arrays can carry extra properties without affecting normal iteration —
  // callers that only care about findings can ignore this.
  Object.defineProperty(wasteReport, "regionErrors", { value: failedRegions, enumerable: false });
  return wasteReport;
}
