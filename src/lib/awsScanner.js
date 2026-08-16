import { EC2Client, DescribeVolumesCommand, DescribeAddressesCommand } from "@aws-sdk/client-ec2";

export async function scanAwsWaste(region = "us-east-1", accessKeyId, secretAccessKey) {
  const client = new EC2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const wasteReport = [];

  try {
    const volumeCmd = new DescribeVolumesCommand({
      Filters: [{ Name: "status", Values: ["available"] }],
    });
    const volumeRes = await client.send(volumeCmd);

    (volumeRes.Volumes || []).forEach((vol) => {
      const sizeGb = vol.Size || 0;
      const monthlyCost = (sizeGb * 0.10).toFixed(2);
      wasteReport.push({
        id: vol.VolumeId,
        provider: "AWS",
        resource: "Unattached EBS Volume",
        details: `${sizeGb} GB (${vol.VolumeType}) in ${vol.AvailabilityZone}`,
        monthlyLoss: parseFloat(monthlyCost),
        severity: "High",
        region,
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
          monthlyLoss: 3.60,
          severity: "Medium",
          region,
        });
      }
    });

    return wasteReport;
  } catch (err) {
    console.error("AWS Scan Error:", err);
    throw new Error("Failed to scan AWS. Check your local API credentials.");
  }
}
