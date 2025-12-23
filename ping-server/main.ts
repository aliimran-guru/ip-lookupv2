/**
 * Self-hosted Deno ICMP Ping Server
 * Runs in Docker with real ping capability
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface PingResult {
  ip: string;
  status: "active" | "inactive";
  responseTime?: number;
  method: "icmp";
}

interface ScanProgress {
  current: number;
  total: number;
  currentIp: string;
  results: PingResult[];
}

// Execute ICMP ping command
async function pingHost(ip: string, timeout: number = 2): Promise<PingResult> {
  const startTime = Date.now();
  
  try {
    const command = new Deno.Command("ping", {
      args: ["-c", "1", "-W", String(timeout), ip],
      stdout: "piped",
      stderr: "piped",
    });

    const process = command.spawn();
    const status = await process.status;
    const responseTime = Date.now() - startTime;

    if (status.success) {
      console.log(`✓ ${ip} ACTIVE (${responseTime}ms)`);
      return {
        ip,
        status: "active",
        responseTime,
        method: "icmp",
      };
    } else {
      console.log(`✗ ${ip} inactive`);
      return {
        ip,
        status: "inactive",
        method: "icmp",
      };
    }
  } catch (error) {
    console.error(`Error pinging ${ip}:`, error);
    return {
      ip,
      status: "inactive",
      method: "icmp",
    };
  }
}

// Parse IP range (e.g., "10.1.10.1-10.1.10.254")
function parseIPRange(input: string): string[] {
  const ips: string[] = [];

  if (input.includes("-")) {
    const [startIp, endIp] = input.split("-").map((s) => s.trim());
    const startParts = startIp.split(".").map(Number);
    const endParts = endIp.split(".").map(Number);

    const startNum =
      (startParts[0] << 24) |
      (startParts[1] << 16) |
      (startParts[2] << 8) |
      startParts[3];
    const endNum =
      (endParts[0] << 24) |
      (endParts[1] << 16) |
      (endParts[2] << 8) |
      endParts[3];

    for (let i = startNum; i <= endNum; i++) {
      ips.push(
        [
          (i >>> 24) & 255,
          (i >>> 16) & 255,
          (i >>> 8) & 255,
          i & 255,
        ].join(".")
      );
    }
  } else if (input.includes("/")) {
    const [baseIp, cidrBits] = input.split("/");
    const bits = parseInt(cidrBits);

    if (bits >= 24 && bits <= 32) {
      const parts = baseIp.split(".").map(Number);
      const baseNum =
        (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
      const hostBits = 32 - bits;
      const numHosts = Math.pow(2, hostBits);
      const networkAddress = baseNum & (~0 << hostBits);

      for (let i = 1; i < numHosts - 1; i++) {
        const ipNum = networkAddress + i;
        ips.push(
          [
            (ipNum >>> 24) & 255,
            (ipNum >>> 16) & 255,
            (ipNum >>> 8) & 255,
            ipNum & 255,
          ].join(".")
        );
      }
    }
  } else {
    ips.push(input.trim());
  }

  return ips;
}

// SSE handler for streaming progress
async function handleStreamingScan(
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  const timeout = parseInt(url.searchParams.get("timeout") || "2");
  const batchSize = parseInt(url.searchParams.get("batchSize") || "10");

  if (!target) {
    return new Response(JSON.stringify({ error: "Target required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ips = parseIPRange(target);
  console.log(`\n========== ICMP SCAN START ==========`);
  console.log(`Target: ${target}`);
  console.log(`Total IPs: ${ips.length}`);

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const results: PingResult[] = [];
      const startTime = Date.now();

      for (let i = 0; i < ips.length; i += batchSize) {
        const batch = ips.slice(i, i + batchSize);
        
        // Send progress for each IP in batch
        for (const ip of batch) {
          // Send current scanning IP
          const progressData: ScanProgress = {
            current: results.length + 1,
            total: ips.length,
            currentIp: ip,
            results: [],
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", ...progressData })}\n\n`)
          );

          // Ping the host
          const result = await pingHost(ip, timeout);
          results.push(result);

          // Send result immediately
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "result", result })}\n\n`)
          );
        }
      }

      // Send final summary
      const activeCount = results.filter((r) => r.status === "active").length;
      const summary = {
        type: "complete",
        success: true,
        target,
        method: "icmp",
        totalHosts: results.length,
        activeHosts: activeCount,
        scanDuration: Date.now() - startTime,
        results,
      };

      console.log(`\n========== SCAN COMPLETE ==========`);
      console.log(`Duration: ${summary.scanDuration}ms`);
      console.log(`Active: ${activeCount}/${results.length}`);

      controller.enqueue(encoder.encode(`data: ${JSON.stringify(summary)}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

// Regular JSON scan (non-streaming)
async function handleJsonScan(request: Request): Promise<Response> {
  const body = await request.json();
  const { target, timeout = 2, batchSize = 10 } = body;

  if (!target) {
    return new Response(JSON.stringify({ error: "Target required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ips = parseIPRange(target);
  console.log(`\n========== ICMP SCAN ==========`);
  console.log(`Target: ${target}, IPs: ${ips.length}`);

  const startTime = Date.now();
  const results: PingResult[] = [];

  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((ip) => pingHost(ip, timeout))
    );
    results.push(...batchResults);
  }

  const activeCount = results.filter((r) => r.status === "active").length;
  const scanDuration = Date.now() - startTime;

  console.log(`Complete: ${activeCount} active, ${scanDuration}ms`);

  return new Response(
    JSON.stringify({
      success: true,
      target,
      method: "icmp",
      totalHosts: results.length,
      activeHosts: activeCount,
      scanDuration,
      results: results.sort((a, b) => {
        const aNum = parseInt(a.ip.split(".")[3], 10);
        const bNum = parseInt(b.ip.split(".")[3], 10);
        return aNum - bNum;
      }),
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// Health check
function handleHealth(): Response {
  return new Response(JSON.stringify({ status: "ok", method: "icmp-ping" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Main handler
Deno.serve({ port: 8000 }, async (request: Request) => {
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (url.pathname === "/health") {
    return handleHealth();
  }

  // Streaming scan (SSE)
  if (url.pathname === "/scan/stream" && request.method === "GET") {
    return handleStreamingScan(request);
  }

  // JSON scan
  if (url.pathname === "/scan" && request.method === "POST") {
    return handleJsonScan(request);
  }

  return new Response("Not Found", { status: 404 });
});

console.log("🚀 ICMP Ping Server running on http://localhost:8000");
console.log("Endpoints:");
console.log("  GET  /health - Health check");
console.log("  GET  /scan/stream?target=10.1.10.1-10.1.10.254 - SSE streaming scan");
console.log("  POST /scan - JSON scan { target, timeout, batchSize }");
