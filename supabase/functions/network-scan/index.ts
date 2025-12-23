import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScanResult {
  ip: string;
  status: "active" | "inactive";
  responseTime?: number;
  method: string;
}

// Try ICMP ping using shell command
async function icmpPing(ip: string, timeout: number = 2): Promise<ScanResult> {
  const startTime = Date.now();
  
  try {
    // Use Deno.Command to execute ping
    // -c 1: send 1 packet, -W: timeout in seconds
    const command = new Deno.Command("ping", {
      args: ["-c", "1", "-W", String(timeout), ip],
      stdout: "piped",
      stderr: "piped",
    });

    const process = command.spawn();
    const status = await process.status;
    const responseTime = Date.now() - startTime;
    
    if (status.success) {
      console.log(`✓ PING ${ip} - ACTIVE (${responseTime}ms)`);
      return {
        ip,
        status: 'active',
        responseTime,
        method: 'icmp'
      };
    } else {
      console.log(`✗ PING ${ip} - inactive`);
      return {
        ip,
        status: 'inactive',
        method: 'icmp'
      };
    }
  } catch (error: unknown) {
    // Ping command not available, throw to trigger fallback
    const msg = error instanceof Error ? error.message : 'unknown';
    throw new Error(`Ping not available: ${msg}`);
  }
}

// TCP connection check as fallback
async function tcpCheck(ip: string, timeout: number = 1500): Promise<ScanResult> {
  const startTime = Date.now();
  const ports = [80, 443, 22, 445, 139, 21, 23, 3389, 8080, 53, 25, 110, 3306, 5432];
  
  for (const port of ports) {
    try {
      const conn = await Promise.race([
        Deno.connect({ hostname: ip, port }),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error("timeout")), timeout)
        )
      ]);
      
      if (conn && typeof conn === 'object' && 'close' in conn) {
        (conn as Deno.Conn).close();
        const responseTime = Date.now() - startTime;
        console.log(`✓ TCP ${ip}:${port} - ACTIVE (${responseTime}ms)`);
        return {
          ip,
          status: 'active',
          responseTime,
          method: `tcp:${port}`
        };
      }
    } catch {
      // Continue to next port
    }
  }
  
  console.log(`✗ TCP ${ip} - inactive (no open ports found)`);
  return {
    ip,
    status: 'inactive',
    method: 'tcp'
  };
}

// Main scan function - tries ICMP first, falls back to TCP
let usePing = true; // Will be set to false if ping is not available

async function scanHost(ip: string, timeout: number = 2000): Promise<ScanResult> {
  if (usePing) {
    try {
      return await icmpPing(ip, Math.ceil(timeout / 1000));
    } catch {
      // Ping not available, disable for future calls and use TCP
      console.log(`ICMP ping not available, switching to TCP mode`);
      usePing = false;
    }
  }
  
  return await tcpCheck(ip, timeout);
}

function parseIPRange(input: string): string[] {
  const ips: string[] = [];
  
  if (input.includes("/")) {
    // CIDR notation
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
      ips.push([
        (ipNum >>> 24) & 255,
        (ipNum >>> 16) & 255,
        (ipNum >>> 8) & 255,
        ipNum & 255,
      ].join("."));
    }
  } else if (input.includes("-")) {
    // Range notation: 10.1.10.1-10.1.10.254
    const [startIp, endIp] = input.split("-").map(s => s.trim());
    const startParts = startIp.split(".").map(Number);
    const endParts = endIp.split(".").map(Number);
    
    const startNum = (startParts[0] << 24) | (startParts[1] << 16) | (startParts[2] << 8) | startParts[3];
    const endNum = (endParts[0] << 24) | (endParts[1] << 16) | (endParts[2] << 8) | endParts[3];
    
    if (endNum - startNum > 254) {
      throw new Error("Range too large. Maximum 254 IPs allowed.");
    }
    
    for (let i = startNum; i <= endNum; i++) {
      ips.push([
        (i >>> 24) & 255,
        (i >>> 16) & 255,
        (i >>> 8) & 255,
        i & 255,
      ].join("."));
    }
  } else {
    // Single IP
    ips.push(input.trim());
  }
  
  return ips;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { ipRange, singleIp, target, timeout = 2000, batchSize = 15 } = body;
    
    const scanTarget = target || ipRange || singleIp;
    
    if (!scanTarget) {
      throw new Error("Target IP/range is required (target, ipRange, or singleIp)");
    }
    
    console.log(`\n========== NETWORK SCAN ==========`);
    console.log(`Target: ${scanTarget}`);
    console.log(`Method: ICMP Ping (with TCP fallback)`);
    
    const startTime = Date.now();
    const ips = parseIPRange(scanTarget);
    
    console.log(`IPs to scan: ${ips.length}`);
    
    if (ips.length > 254) {
      throw new Error("Maximum 254 IPs per scan");
    }
    
    const results: ScanResult[] = [];
    
    // Scan in batches
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      console.log(`Batch ${Math.floor(i/batchSize)+1}/${Math.ceil(ips.length/batchSize)}`);
      
      const batchResults = await Promise.all(
        batch.map(ip => scanHost(ip, timeout))
      );
      results.push(...batchResults);
    }
    
    const activeHosts = results.filter(r => r.status === 'active');
    const scanDuration = Date.now() - startTime;
    
    console.log(`\n========== COMPLETE ==========`);
    console.log(`Duration: ${scanDuration}ms`);
    console.log(`Active: ${activeHosts.length}/${results.length}`);
    console.log(`Method used: ${usePing ? 'ICMP' : 'TCP'}`);
    if (activeHosts.length > 0) {
      console.log(`Active IPs: ${activeHosts.map(h => h.ip).join(', ')}`);
    }

    return new Response(JSON.stringify({
      success: true,
      target: scanTarget,
      method: usePing ? 'icmp' : 'tcp',
      totalHosts: results.length,
      activeHosts: activeHosts.length,
      scanDuration,
      results: results.sort((a, b) => {
        const aNum = parseInt(a.ip.split('.')[3], 10);
        const bNum = parseInt(b.ip.split('.')[3], 10);
        return aNum - bNum;
      })
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Scan error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
