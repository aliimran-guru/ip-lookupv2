import { useState, useCallback, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Play,
  Square,
  FileText,
  FileSpreadsheet,
  Clock,
  Loader2,
  Network,
  Wifi,
  WifiOff,
  Radio,
  Server,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ScanResult,
  ScanHistory,
  generateId,
  saveScanHistory,
  formatDuration,
} from "@/lib/scanner";
import { exportToCSV, exportToPDF } from "@/lib/export";
import { supabase } from "@/integrations/supabase/client";
import { HostnameInput, saveHostname as saveHostnameToStorage } from "@/components/HostnameSuggestions";
import { useScanState } from "@/hooks/useScanState";

interface EdgeFunctionResult {
  ip: string;
  status: "active" | "inactive";
  responseTime?: number;
  hostname?: string;
  method?: string;
}

interface SSEProgress {
  type: "progress" | "result" | "complete";
  current?: number;
  total?: number;
  currentIp?: string;
  result?: EdgeFunctionResult;
  results?: EdgeFunctionResult[];
  activeHosts?: number;
  scanDuration?: number;
}

type ScanMode = "cloud" | "self-hosted";

// Editable hostname state per IP
interface EditableResult extends ScanResult {
  editingHostname?: boolean;
}

// Global scan state reference to persist across page navigation
let globalScanAbortRef = { current: false };
let globalEventSource: EventSource | null = null;

export default function Scanner() {
  const { toast } = useToast();
  const { scanProgress, setScanProgress, updateProgress } = useScanState();
  const [inputMode, setInputMode] = useState<"manual" | "cidr">("manual");
  const [startIp, setStartIp] = useState("10.1.10.1");
  const [endIp, setEndIp] = useState("10.1.10.254");
  const [cidr, setCidr] = useState("10.1.10.0/24");
  const [scanMode, setScanMode] = useState<ScanMode>("self-hosted"); // Default to self-hosted
  const [pingServerUrl, setPingServerUrl] = useState("http://localhost:8000");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentIp, setCurrentIp] = useState<string>("");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [editingIp, setEditingIp] = useState<string | null>(null);
  const [editHostnameValue, setEditHostnameValue] = useState("");
  const [currentScan, setCurrentScan] = useState<ScanHistory | null>(null);
  const abortRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Sync with global scan state on mount
  useEffect(() => {
    if (scanProgress?.isScanning) {
      setIsScanning(true);
      setProgress(scanProgress.progress);
      setCurrentIp(scanProgress.currentIp);
      setStartIp(scanProgress.startIp);
      setEndIp(scanProgress.endIp);
    }
  }, []);

  // Cleanup on unmount - but don't stop the scan
  useEffect(() => {
    return () => {
      // Don't close event source on unmount - let it continue
    };
  }, []);

  const validateIP = (ip: string): boolean => {
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part) => {
      const num = parseInt(part);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  };

  const validateCIDR = (cidrInput: string): boolean => {
    const [ip, bits] = cidrInput.split("/");
    if (!ip || !bits) return false;
    const bitsNum = parseInt(bits);
    return validateIP(ip) && !isNaN(bitsNum) && bitsNum >= 24 && bitsNum <= 32;
  };

  // Save result to ip_inventory database
  const saveToInventory = async (result: EdgeFunctionResult) => {
    try {
      const { error } = await supabase
        .from("ip_inventory")
        .upsert(
          {
            ip_address: result.ip,
            status: result.status,
            hostname: result.hostname || null,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "ip_address" }
        );

      if (error) {
        console.error("Failed to save to inventory:", error);
      }
    } catch (e) {
      console.error("Inventory save error:", e);
    }
  };

  // Self-hosted SSE streaming scan
  const startSelfHostedScan = useCallback(async (target: string, startTime: number) => {
    return new Promise<{ results: EdgeFunctionResult[], duration: number }>((resolve, reject) => {
      const url = `${pingServerUrl}/scan/stream?target=${encodeURIComponent(target)}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      globalEventSource = eventSource;

      const collectedResults: EdgeFunctionResult[] = [];

      eventSource.onmessage = (event) => {
        if (abortRef.current || globalScanAbortRef.current) {
          eventSource.close();
          reject(new Error("Scan cancelled"));
          return;
        }

        try {
          const data: SSEProgress = JSON.parse(event.data);

          if (data.type === "progress") {
            setCurrentIp(data.currentIp || "");
            const progressValue = Math.round(((data.current || 0) / (data.total || 1)) * 100);
            setProgress(progressValue);
            
            // Update global scan state
            updateProgress({
              progress: progressValue,
              currentIp: data.currentIp || "",
              activeCount: collectedResults.filter(r => r.status === "active").length,
              inactiveCount: collectedResults.filter(r => r.status === "inactive").length,
            });
          } else if (data.type === "result" && data.result) {
            collectedResults.push(data.result);
            setResults([...collectedResults].map(r => ({
              ip: r.ip,
              status: r.status,
              responseTime: r.responseTime,
              hostname: r.hostname,
              timestamp: Date.now(),
            })));
            
            // Save to inventory immediately
            saveToInventory(data.result);
            
            // Update counts
            updateProgress({
              activeCount: collectedResults.filter(r => r.status === "active").length,
              inactiveCount: collectedResults.filter(r => r.status === "inactive").length,
            });
          } else if (data.type === "complete") {
            eventSource.close();
            globalEventSource = null;
            setScanProgress(null); // Clear global scan state
            resolve({
              results: data.results || collectedResults,
              duration: data.scanDuration || (Date.now() - startTime),
            });
          }
        } catch (e) {
          console.error("SSE parse error:", e);
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        globalEventSource = null;
        setScanProgress(null);
        reject(new Error("Connection to ping server failed. Make sure it's running."));
      };
    });
  }, [pingServerUrl, updateProgress, setScanProgress]);

  // Cloud scan (edge function)
  const startCloudScan = useCallback(async (target: string, startTime: number) => {
    const progressInterval = setInterval(() => {
      if (!abortRef.current) {
        setProgress((prev) => Math.min(prev + 2, 90));
      }
    }, 100);

    try {
      const { data, error } = await supabase.functions.invoke("network-scan", {
        body: { target },
      });

      clearInterval(progressInterval);

      if (error) throw error;

      return {
        results: data.results as EdgeFunctionResult[],
        duration: data.scanDuration || (Date.now() - startTime),
      };
    } finally {
      clearInterval(progressInterval);
    }
  }, []);

  const startScan = useCallback(async () => {
    const target = inputMode === "cidr" ? cidr : `${startIp}-${endIp}`;

    if (inputMode === "cidr") {
      if (!validateCIDR(cidr)) {
        toast({
          title: "Invalid CIDR",
          description: "Please enter a valid CIDR (e.g., 10.1.10.0/24)",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!validateIP(startIp) || !validateIP(endIp)) {
        toast({
          title: "Invalid IP",
          description: "Please enter valid start and end IP addresses",
          variant: "destructive",
        });
        return;
      }
    }

    if (!target.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid IP range",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    setProgress(0);
    setCurrentIp("");
    setResults([]);
    abortRef.current = false;
    globalScanAbortRef.current = false;
    const startTime = Date.now();

    // Set global scan state for cross-page visibility
    setScanProgress({
      isScanning: true,
      progress: 0,
      currentIp: "",
      activeCount: 0,
      inactiveCount: 0,
      startIp,
      endIp,
      startTime,
    });

    try {
      let scanData: { results: EdgeFunctionResult[], duration: number };

      if (scanMode === "self-hosted") {
        scanData = await startSelfHostedScan(target, startTime);
      } else {
        scanData = await startCloudScan(target, startTime);
        // Save cloud results to inventory
        for (const result of scanData.results) {
          await saveToInventory(result);
        }
      }

      if (abortRef.current) return;

      setProgress(100);
      setCurrentIp("");
      setScanProgress(null);

      const scanResults: ScanResult[] = scanData.results.map((r) => ({
        ip: r.ip,
        status: r.status,
        responseTime: r.responseTime,
        hostname: r.hostname,
        timestamp: Date.now(),
      }));

      setResults(scanResults);

      const activeCount = scanResults.filter((r) => r.status === "active").length;

      const history: ScanHistory = {
        id: generateId(),
        startIp: scanResults[0]?.ip || startIp,
        endIp: scanResults[scanResults.length - 1]?.ip || endIp,
        cidr: inputMode === "cidr" ? cidr : undefined,
        results: scanResults,
        totalScanned: scanResults.length,
        activeCount,
        inactiveCount: scanResults.length - activeCount,
        startTime,
        endTime: Date.now(),
        duration: scanData.duration,
      };

      setCurrentScan(history);
      saveScanHistory(history);

      toast({
        title: "Scan Complete",
        description: `Scanned ${scanResults.length} IPs. ${activeCount} active, ${scanResults.length - activeCount} inactive. Results saved to IP Inventory.`,
      });
    } catch (error) {
      if (!abortRef.current) {
        toast({
          title: "Scan Failed",
          description: error instanceof Error ? error.message : "Failed to scan network",
          variant: "destructive",
        });
      }
    } finally {
      setIsScanning(false);
      setCurrentIp("");
      setScanProgress(null);
    }
  }, [inputMode, cidr, startIp, endIp, scanMode, toast, startSelfHostedScan, startCloudScan, setScanProgress]);


  const stopScan = () => {
    abortRef.current = true;
    globalScanAbortRef.current = true;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (globalEventSource) {
      globalEventSource.close();
      globalEventSource = null;
    }
    setIsScanning(false);
    setCurrentIp("");
    setScanProgress(null);
    toast({
      title: "Scan Stopped",
      description: "Network scan has been cancelled",
    });
  };

  const handleExportPDF = () => {
    if (!currentScan) return;
    exportToPDF(currentScan);
    toast({
      title: "Export Complete",
      description: "PDF report has been downloaded",
    });
  };

  const handleExportCSV = () => {
    if (!currentScan) return;
    exportToCSV(currentScan);
    toast({
      title: "Export Complete",
      description: "CSV file has been downloaded",
    });
  };

  // Hostname editing handlers
  const startEditHostname = (ip: string, currentHostname?: string) => {
    setEditingIp(ip);
    setEditHostnameValue(currentHostname || "");
  };

  const saveHostname = (ip: string) => {
    const hostnameToSave = editHostnameValue.trim() || undefined;
    
    setResults(prev => prev.map(r => 
      r.ip === ip ? { ...r, hostname: hostnameToSave } : r
    ));
    
    // Also update currentScan if exists
    if (currentScan) {
      setCurrentScan({
        ...currentScan,
        results: currentScan.results.map(r =>
          r.ip === ip ? { ...r, hostname: hostnameToSave } : r
        ),
      });
    }
    
    // Save to localStorage for future suggestions
    if (hostnameToSave) {
      saveHostnameToStorage(hostnameToSave, ip);
    }
    
    setEditingIp(null);
    setEditHostnameValue("");
    
    toast({
      title: "Hostname Updated",
      description: `Hostname for ${ip} has been saved`,
    });
  };

  const cancelEditHostname = () => {
    setEditingIp(null);
    setEditHostnameValue("");
  };

  const activeCount = results.filter((r) => r.status === "active").length;
  const inactiveCount = results.filter((r) => r.status === "inactive").length;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold">
              <span className="gradient-text">IP Scanner</span>
            </h1>
            <p className="text-muted-foreground">
              Scan range IP untuk mendeteksi perangkat aktif di jaringan
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Section */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-primary" />
                  Scan Configuration
                </CardTitle>
                <CardDescription>
                  Masukkan range IP yang ingin di-scan
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Scan Mode Selector */}
                <div className="space-y-2">
                  <Label>Scan Mode</Label>
                  <Select value={scanMode} onValueChange={(v) => setScanMode(v as ScanMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloud">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          Cloud (TCP Probe)
                        </div>
                      </SelectItem>
                      <SelectItem value="self-hosted">
                        <div className="flex items-center gap-2">
                          <Radio className="h-4 w-4" />
                          Self-Hosted (ICMP Ping)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {scanMode === "self-hosted" 
                      ? "Real ICMP ping via Docker server" 
                      : "TCP port probing via cloud function"}
                  </p>
                </div>

                {/* Self-hosted server URL */}
                {scanMode === "self-hosted" && (
                  <div className="space-y-2">
                    <Label htmlFor="ping-server">Ping Server URL</Label>
                    <Input
                      id="ping-server"
                      placeholder="http://localhost:8000"
                      value={pingServerUrl}
                      onChange={(e) => setPingServerUrl(e.target.value)}
                      disabled={isScanning}
                      className="font-mono text-sm"
                    />
                  </div>
                )}

                <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "manual" | "cidr")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="manual">Manual Range</TabsTrigger>
                    <TabsTrigger value="cidr">CIDR</TabsTrigger>
                  </TabsList>

                  <TabsContent value="manual" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="start-ip">Start IP</Label>
                      <Input
                        id="start-ip"
                        placeholder="10.1.10.1"
                        value={startIp}
                        onChange={(e) => setStartIp(e.target.value)}
                        disabled={isScanning}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end-ip">End IP</Label>
                      <Input
                        id="end-ip"
                        placeholder="10.1.10.254"
                        value={endIp}
                        onChange={(e) => setEndIp(e.target.value)}
                        disabled={isScanning}
                        className="font-mono"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="cidr" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="cidr">CIDR Notation</Label>
                      <Input
                        id="cidr"
                        placeholder="10.1.10.0/24"
                        value={cidr}
                        onChange={(e) => setCidr(e.target.value)}
                        disabled={isScanning}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Support /24 hingga /32
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-2">
                  {!isScanning ? (
                    <Button onClick={startScan} className="flex-1 gap-2">
                      <Play className="h-4 w-4" />
                      Start Scan
                    </Button>
                  ) : (
                    <Button onClick={stopScan} variant="destructive" className="flex-1 gap-2">
                      <Square className="h-4 w-4" />
                      Stop Scan
                    </Button>
                  )}
                </div>

                {/* Progress with current IP */}
                {isScanning && (
                  <div className="space-y-3 p-4 rounded-lg bg-muted/50 border border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-mono font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    
                    {/* Current IP indicator */}
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <div className="flex-1 min-w-0">
                        {currentIp ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Scanning:</span>
                            <Badge variant="outline" className="font-mono animate-pulse">
                              {currentIp}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {scanMode === "self-hosted" ? "Connecting to ping server..." : "Connecting to cloud..."}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Live count */}
                    {results.length > 0 && (
                      <div className="flex gap-4 text-sm pt-2 border-t border-border/50">
                        <span className="text-success">
                          ✓ {results.filter(r => r.status === "active").length} active
                        </span>
                        <span className="text-destructive">
                          ✗ {results.filter(r => r.status === "inactive").length} inactive
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Stats */}
                {results.length > 0 && !isScanning && (
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                    <div className="text-center p-3 rounded-lg bg-success/10">
                      <div className="text-2xl font-bold text-success">{activeCount}</div>
                      <div className="text-xs text-muted-foreground">Active</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-destructive/10">
                      <div className="text-2xl font-bold text-destructive">{inactiveCount}</div>
                      <div className="text-xs text-muted-foreground">Inactive</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-primary/10">
                      <div className="text-2xl font-bold text-primary">{results.length}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </div>
                )}

                {/* Export Buttons */}
                {currentScan && !isScanning && (
                  <div className="space-y-2 pt-4 border-t border-border">
                    <Label>Export Results</Label>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleExportPDF}
                        variant="outline"
                        className="flex-1 gap-2"
                      >
                        <FileText className="h-4 w-4" />
                        PDF
                      </Button>
                      <Button
                        onClick={handleExportCSV}
                        variant="outline"
                        className="flex-1 gap-2"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        CSV
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results Section */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="h-5 w-5 text-primary" />
                      Scan Results
                    </CardTitle>
                    <CardDescription>
                      {results.length > 0
                        ? `${results.length} IPs scanned`
                        : "Results will appear here"}
                    </CardDescription>
                  </div>
                  {currentScan && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1">
                        {currentScan.duration < 60000 
                          ? `${Math.round(currentScan.duration)}ms`
                          : formatDuration(currentScan.duration)
                        }
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {scanMode === "self-hosted" ? "ICMP" : "TCP"}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Network className="h-16 w-16 mb-4 opacity-20" />
                    <p>No scan results yet</p>
                    <p className="text-sm">Configure and start a scan to see results</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead className="w-[150px]">IP Address</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[120px]">Response Time</TableHead>
                            <TableHead>Hostname</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.map((result, index) => (
                            <TableRow
                              key={result.ip}
                              className="animate-fade-in"
                              style={{ animationDelay: `${Math.min(index * 0.02, 1)}s` }}
                            >
                              <TableCell className="font-mono text-sm">
                                {result.ip}
                              </TableCell>
                              <TableCell>
                                {result.status === "active" ? (
                                  <Badge className="gap-1 bg-success hover:bg-success/90">
                                    <Wifi className="h-3 w-3" />
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="gap-1">
                                    <WifiOff className="h-3 w-3" />
                                    Inactive
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {result.responseTime ? (
                                  <span className="text-success">{result.responseTime}ms</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {editingIp === result.ip ? (
                                  <div className="flex items-center gap-1">
                                    <HostnameInput
                                      value={editHostnameValue}
                                      onChange={setEditHostnameValue}
                                      onSave={() => saveHostname(result.ip)}
                                      onCancel={cancelEditHostname}
                                      placeholder="Enter hostname"
                                    />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => saveHostname(result.ip)}
                                    >
                                      <Check className="h-3 w-3 text-success" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={cancelEditHostname}
                                    >
                                      <X className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 group">
                                    <span className={result.hostname ? "font-mono" : "text-muted-foreground"}>
                                      {result.hostname || "(not detected)"}
                                    </span>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => startEditHostname(result.ip, result.hostname)}
                                      title="Edit hostname"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
