import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Well-known ports with descriptions
const PORT_INFO: Record<number, string> = {
  20: "FTP Data",
  21: "FTP Control",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  445: "SMB",
  993: "IMAPS",
  995: "POP3S",
  1433: "MSSQL",
  1521: "Oracle",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5900: "VNC",
  6379: "Redis",
  8080: "HTTP Proxy",
  8443: "HTTPS Alt",
  27017: "MongoDB",
};

interface PortResult {
  port: number;
  status: "open" | "closed" | "filtered";
  service?: string;
  responseTime?: number;
}

interface ScanResult {
  ip: string;
  ports: PortResult[];
  scanTime: number;
  openCount: number;
  closedCount: number;
}

async function checkPort(ip: string, port: number, timeout: number = 3000): Promise<PortResult> {
  const startTime = Date.now();
  
  try {
    const conn = await Promise.race([
      Deno.connect({ hostname: ip, port }),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("timeout")), timeout)
      )
    ]);
    
    if (conn && typeof conn === 'object' && 'close' in conn) {
      (conn as Deno.Conn).close();
      return {
        port,
        status: "open",
        service: PORT_INFO[port] || undefined,
        responseTime: Date.now() - startTime,
      };
    }
    
    return {
      port,
      status: "filtered",
      service: PORT_INFO[port] || undefined,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "timeout") {
      return {
        port,
        status: "filtered",
        service: PORT_INFO[port] || undefined,
      };
    }
    return {
      port,
      status: "closed",
      service: PORT_INFO[port] || undefined,
    };
  }
}

function parsePortRange(input: string): number[] {
  const ports: number[] = [];
  
  // Split by comma
  const parts = input.split(",").map(s => s.trim());
  
  for (const part of parts) {
    if (part.includes("-")) {
      // Range: 80-100
      const [start, end] = part.split("-").map(Number);
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= 65535 && !ports.includes(i)) {
          ports.push(i);
        }
      }
    } else {
      // Single port
      const port = parseInt(part);
      if (port >= 1 && port <= 65535 && !ports.includes(port)) {
        ports.push(port);
      }
    }
  }
  
  // Limit to 100 ports per scan
  return ports.slice(0, 100);
}

// Common port presets
const PORT_PRESETS: Record<string, number[]> = {
  common: [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 3306, 3389, 5432, 8080],
  web: [80, 443, 8080, 8443],
  database: [1433, 1521, 3306, 5432, 6379, 27017],
  all: [20, 21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017],
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ip, ports, preset, timeout = 3000 } = await req.json();
    
    if (!ip) {
      throw new Error("IP address is required");
    }
    
    console.log(`Port scan request for ${ip}`);
    
    // Determine which ports to scan
    let portsToScan: number[];
    
    if (preset && PORT_PRESETS[preset]) {
      portsToScan = PORT_PRESETS[preset];
      console.log(`Using preset '${preset}': ${portsToScan.length} ports`);
    } else if (ports) {
      portsToScan = parsePortRange(ports);
      console.log(`Using custom ports: ${portsToScan.length} ports`);
    } else {
      portsToScan = PORT_PRESETS.common;
      console.log(`Using default 'common' preset: ${portsToScan.length} ports`);
    }
    
    const startTime = Date.now();
    
    // Scan ports in batches of 5 for performance
    const batchSize = 5;
    const results: PortResult[] = [];
    
    for (let i = 0; i < portsToScan.length; i += batchSize) {
      const batch = portsToScan.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(port => checkPort(ip, port, timeout))
      );
      results.push(...batchResults);
    }
    
    const openCount = results.filter(r => r.status === "open").length;
    const closedCount = results.filter(r => r.status === "closed").length;
    
    const scanResult: ScanResult = {
      ip,
      ports: results.sort((a, b) => a.port - b.port),
      scanTime: Date.now() - startTime,
      openCount,
      closedCount,
    };
    
    console.log(`Scan complete: ${openCount} open, ${closedCount} closed, ${results.length - openCount - closedCount} filtered`);
    
    return new Response(JSON.stringify(scanResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    console.error('Error in port-scan:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
