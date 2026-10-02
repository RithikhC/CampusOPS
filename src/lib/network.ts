/**
 * Is a request coming from the hostel network? Room check-ins are only accepted from it.
 *
 * Set CAMPUS_NETWORKS to the hostel Wi-Fi's address ranges, e.g. "10.20.0.0/16,172.16.8.0/22".
 * When it isn't set (local development, the demo) every request counts as on campus.
 */

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.replace(/^::ffff:/i, "").split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const byte = Number(part);
    if (!/^\d{1,3}$/.test(part) || byte > 255) return null;
    value = value * 256 + byte;
  }
  return value;
}

export function ipInRanges(ip: string, ranges: string[]): boolean {
  const address = ipv4ToNumber(ip.trim());
  if (address === null) return false;
  return ranges.some((range) => {
    const [base, bitsText = "32"] = range.trim().split("/");
    const start = ipv4ToNumber(base);
    const bits = Number(bitsText);
    if (start === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const size = 2 ** (32 - bits);
    return Math.floor(address / size) === Math.floor(start / size);
  });
}

export function isOnCampus(headers: Headers, configured = process.env.CAMPUS_NETWORKS): boolean {
  const ranges = (configured ?? "").split(",").filter((r) => r.trim());
  if (ranges.length === 0) return true;
  // Behind a proxy the first forwarded address is the client's.
  const ip = headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip") ?? "";
  return ipInRanges(ip, ranges);
}
