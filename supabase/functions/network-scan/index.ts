import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Common ports to check for host availability
const PROBE_PORTS = [80, 443, 22, 21, 25, 53, 110, 143, 3389, 8080];

interface ScanResult {
  ip: string;
  status: "active" | "inactive";
  responseTime?: number;
  openPorts?: number[];
  timestamp: number;
}

async function checkPort(ip: string, port: number, timeout: number = 2000): Promise<boolean> {
  try {
    const conn = await Promise.race([
      Deno.connect({ hostname: ip, port }),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("timeout")), timeout)
      )
    ]);
    
    if (conn && typeof conn === 'object' && 'close' in conn) {
      (conn as Deno.Conn).close();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function scanHost(ip: string): Promise<ScanResult> {
  const startTime = Date.now();
  const openPorts: number[] = [];
  
  console.log(`Scanning host: ${ip}`);
  
  // Check multiple ports in parallel
  const portChecks = PROBE_PORTS.map(async (port) => {
    const isOpen = await checkPort(ip, port, 1500);
    if (isOpen) {
      openPorts.push(port);
    }
    return isOpen;
  });
  
  const results = await Promise.all(portChecks);
  const isActive = results.some(r => r);
  const responseTime = Date.now() - startTime;
  
  console.log(`Host ${ip}: ${isActive ? 'active' : 'inactive'}, open ports: ${openPorts.join(', ')}`);
  
  return {
    ip,
    status: isActive ? "active" : "inactive",
    responseTime: isActive ? responseTime : undefined,
    openPorts: openPorts.length > 0 ? openPorts.sort((a, b) => a - b) : undefined,
    timestamp: Date.now(),
  };
}

function parseIPRange(input: string): string[] {
  const ips: string[] = [];
  
  // CIDR notation
  if (input.includes("/")) {
    const [baseIp, cidrBits] = input.split("/");
    const bits = parseInt(cidrBits);
    
    if (bits < 24 || bits > 32) {
      throw new Error("CIDR range must be between /24 and /32");
    }
    
    const parts = baseIp.split(".").map(Number);
    const baseNum = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
    const hostBits = 32 - bits;
    const numHosts = Math.pow(2, hostBits);
    const networkAddress = baseNum & (~0 << hostBits);
    
    for (let i = 1; i < numHosts - 1; i++) {
      const ipNum = networkAddress + i;
      const ip = [
        (ipNum >>> 24) & 255,
        (ipNum >>> 16) & 255,
        (ipNum >>> 8) & 255,
        ipNum & 255,
      ].join(".");
      ips.push(ip);
    }
  }
  // Range notation
  else if (input.includes("-")) {
    const [startIp, endIp] = input.split("-").map((s) => s.trim());
    
    const startParts = startIp.split(".").map(Number);
    const endParts = endIp.split(".").map(Number);
    
    const startNum = (startParts[0] << 24) | (startParts[1] << 16) | (startParts[2] << 8) | startParts[3];
    const endNum = (endParts[0] << 24) | (endParts[1] << 16) | (endParts[2] << 8) | endParts[3];
    
    if (endNum - startNum > 254) {
      throw new Error("Range too large. Maximum 254 IPs allowed.");
    }
    
    for (let i = startNum; i <= endNum; i++) {
      const ip = [
        (i >>> 24) & 255,
        (i >>> 16) & 255,
        (i >>> 8) & 255,
        i & 255,
      ].join(".");
      ips.push(ip);
    }
  }
  // Single IP
  else {
    ips.push(input.trim());
  }
  
  return ips;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { ipRange, singleIp, target } = body;
    
    // Support both 'target' (from frontend) and 'ipRange'/'singleIp' parameters
    const scanTarget = target || ipRange || singleIp;
    
    console.log(`Network scan request: ${scanTarget}`);
    
    if (!scanTarget) {
      throw new Error("Target IP/range is required. Use 'target', 'ipRange', or 'singleIp' parameter.");
    }
    
    const startTime = Date.now();
    
    // Check if it's a single IP (no range or CIDR)
    const isSingleIp = !scanTarget.includes("/") && !scanTarget.includes("-");
    
    if (isSingleIp) {
      // Scan single IP
      const result = await scanHost(scanTarget);
      return new Response(JSON.stringify({ 
        results: [result],
        totalHosts: 1,
        activeHosts: result.status === "active" ? 1 : 0,
        scanDuration: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Scan IP range or CIDR
    const ips = parseIPRange(scanTarget);
    console.log(`Scanning ${ips.length} IPs`);
    
    // Scan in batches of 10 for performance
    const batchSize = 10;
    const results: ScanResult[] = [];
    
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(scanHost));
      results.push(...batchResults);
    }
    
    const activeCount = results.filter(r => r.status === "active").length;
    
    return new Response(JSON.stringify({ 
      results,
      totalHosts: results.length,
      activeHosts: activeCount,
      scanDuration: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    console.error('Error in network-scan:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
