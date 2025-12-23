import { useState, useCallback, useRef } from "react";
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

interface EdgeFunctionResult {
  ip: string;
  status: "active" | "inactive";
  responseTime?: number;
  hostname?: string;
}

export default function Scanner() {
  const { toast } = useToast();
  const [inputMode, setInputMode] = useState<"manual" | "cidr">("manual");
  const [startIp, setStartIp] = useState("192.168.1.1");
  const [endIp, setEndIp] = useState("192.168.1.254");
  const [cidr, setCidr] = useState("192.168.1.0/24");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [currentScan, setCurrentScan] = useState<ScanHistory | null>(null);
  const abortRef = useRef(false);

  // Validate IP address format
  const validateIP = (ip: string): boolean => {
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part) => {
      const num = parseInt(part);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  };

  // Validate CIDR format
  const validateCIDR = (cidrInput: string): boolean => {
    const [ip, bits] = cidrInput.split("/");
    if (!ip || !bits) return false;
    const bitsNum = parseInt(bits);
    return validateIP(ip) && !isNaN(bitsNum) && bitsNum >= 24 && bitsNum <= 32;
  };

  const startScan = useCallback(async () => {
    const target = inputMode === "cidr" ? cidr : `${startIp}-${endIp}`;
    
    // Validate input
    if (inputMode === "cidr") {
      if (!validateCIDR(cidr)) {
        toast({
          title: "Invalid CIDR",
          description: "Please enter a valid CIDR (e.g., 192.168.1.0/24)",
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
    setResults([]);
    abortRef.current = false;
    const startTime = Date.now();

    try {
      // Simulate progress while waiting for edge function
      const progressInterval = setInterval(() => {
        if (!abortRef.current) {
          setProgress((prev) => Math.min(prev + 2, 90));
        }
      }, 100);

      const { data, error } = await supabase.functions.invoke("network-scan", {
        body: { target },
      });

      clearInterval(progressInterval);
      
      if (abortRef.current) {
        return;
      }

      setProgress(100);

      if (error) throw error;

      const scanResults: ScanResult[] = (data.results as EdgeFunctionResult[]).map((r) => ({
        ip: r.ip,
        status: r.status,
        responseTime: r.responseTime,
        hostname: r.hostname,
        timestamp: Date.now(),
      }));

      setResults(scanResults);

      const endTime = Date.now();
      const activeCount = scanResults.filter((r) => r.status === "active").length;

      const history: ScanHistory = {
        id: generateId(),
        startIp: data.results[0]?.ip || startIp,
        endIp: data.results[data.results.length - 1]?.ip || endIp,
        cidr: inputMode === "cidr" ? cidr : undefined,
        results: scanResults,
        totalScanned: scanResults.length,
        activeCount,
        inactiveCount: scanResults.length - activeCount,
        startTime,
        endTime,
        duration: data.scanDuration || endTime - startTime,
      };

      setCurrentScan(history);
      saveScanHistory(history);

      toast({
        title: "Scan Complete",
        description: `Scanned ${scanResults.length} IPs. ${activeCount} active, ${scanResults.length - activeCount} inactive.`,
      });
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Failed to scan network",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  }, [inputMode, cidr, startIp, endIp, toast]);

  const stopScan = () => {
    abortRef.current = true;
    setIsScanning(false);
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
              Scan range IP untuk mendeteksi perangkat aktif di jaringan (TCP-based)
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
                        placeholder="192.168.1.1"
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
                        placeholder="192.168.1.254"
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
                        placeholder="192.168.1.0/24"
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

                {/* Progress */}
                {isScanning && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Scanning...</span>
                      <span className="font-mono">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Connecting to backend...</span>
                    </div>
                  </div>
                )}

                {/* Stats */}
                {results.length > 0 && (
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
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(currentScan.duration)}
                    </Badge>
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
                              style={{ animationDelay: `${index * 0.02}s` }}
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
                                {result.hostname || (
                                  <span className="text-muted-foreground">-</span>
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
