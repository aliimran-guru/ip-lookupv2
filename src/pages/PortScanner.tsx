import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Play,
  Square,
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Clock,
  Loader2,
  Server,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PortResult {
  port: number;
  status: "open" | "closed" | "filtered";
  service?: string;
  responseTime?: number;
}

interface ScanResult {
  ip: string;
  ports: PortResult[];
  scanDuration: number;
  openPorts: number;
  closedPorts: number;
}

const PORT_PRESETS = {
  common: "Common Ports (22, 80, 443, etc.)",
  web: "Web Ports (80, 443, 8080, etc.)",
  database: "Database Ports (3306, 5432, etc.)",
  all: "Extended Ports (Top 100)",
  custom: "Custom Ports",
};

export default function PortScanner() {
  const { toast } = useToast();
  const [targetIp, setTargetIp] = useState("192.168.1.1");
  const [preset, setPreset] = useState<keyof typeof PORT_PRESETS>("common");
  const [customPorts, setCustomPorts] = useState("22,80,443,3389");
  const [timeout, setTimeout] = useState(3000);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Validate IP address format
  const validateIP = (ip: string): boolean => {
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part) => {
      const num = parseInt(part);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  };

  const startScan = async () => {
    if (!targetIp.trim()) {
      toast({
        title: "Error",
        description: "Please enter a target IP address",
        variant: "destructive",
      });
      return;
    }

    if (!validateIP(targetIp.trim())) {
      toast({
        title: "Invalid IP",
        description: "Please enter a valid IP address (e.g., 192.168.1.1)",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    setProgress(0);
    setScanResult(null);

    try {
      // Simulate progress while waiting for edge function
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 5, 90));
      }, 200);

      const { data, error } = await supabase.functions.invoke("port-scan", {
        body: {
          ip: targetIp.trim(),
          preset: preset !== "custom" ? preset : undefined,
          ports: preset === "custom" ? customPorts : undefined,
          timeout,
        },
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) throw error;

      // Map response from edge function
      const result: ScanResult = {
        ip: data.ip,
        ports: data.ports,
        scanDuration: data.scanTime || data.scanDuration || 0,
        openPorts: data.openCount || data.openPorts || 0,
        closedPorts: data.closedCount || data.closedPorts || 0,
      };

      setScanResult(result);

      toast({
        title: "Scan Complete",
        description: `Found ${data.openPorts} open ports on ${targetIp}`,
      });
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Failed to scan ports",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const stopScan = () => {
    setIsScanning(false);
    toast({
      title: "Scan Stopped",
      description: "Port scan has been cancelled",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <ShieldCheck className="h-4 w-4 text-success" />;
      case "closed":
        return <ShieldX className="h-4 w-4 text-destructive" />;
      case "filtered":
        return <ShieldAlert className="h-4 w-4 text-warning" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-success hover:bg-success/90">Open</Badge>;
      case "closed":
        return <Badge variant="destructive">Closed</Badge>;
      case "filtered":
        return <Badge className="bg-warning hover:bg-warning/90">Filtered</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold">
              <span className="gradient-text">Port Scanner</span>
            </h1>
            <p className="text-muted-foreground">
              Scan ports pada IP untuk mendeteksi layanan yang aktif
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Section */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-primary" />
                  Scan Configuration
                </CardTitle>
                <CardDescription>
                  Masukkan target IP dan pilih preset port
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="target-ip">Target IP Address</Label>
                  <Input
                    id="target-ip"
                    placeholder="192.168.1.1"
                    value={targetIp}
                    onChange={(e) => setTargetIp(e.target.value)}
                    disabled={isScanning}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Port Preset</Label>
                  <Select
                    value={preset}
                    onValueChange={(v) => setPreset(v as keyof typeof PORT_PRESETS)}
                    disabled={isScanning}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PORT_PRESETS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {preset === "custom" && (
                  <div className="space-y-2">
                    <Label htmlFor="custom-ports">Custom Ports</Label>
                    <Input
                      id="custom-ports"
                      placeholder="22,80,443,8080 or 1-1000"
                      value={customPorts}
                      onChange={(e) => setCustomPorts(e.target.value)}
                      disabled={isScanning}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated or range (max 100 ports)
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Timeout (ms)</Label>
                  <Select
                    value={timeout.toString()}
                    onValueChange={(v) => setTimeout(parseInt(v))}
                    disabled={isScanning}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1000ms (Fast)</SelectItem>
                      <SelectItem value="3000">3000ms (Normal)</SelectItem>
                      <SelectItem value="5000">5000ms (Thorough)</SelectItem>
                      <SelectItem value="10000">10000ms (Deep)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
                      <span className="text-muted-foreground">Scanning ports...</span>
                      <span className="font-mono">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Connecting to {targetIp}</span>
                    </div>
                  </div>
                )}

                {/* Stats */}
                {scanResult && (
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                    <div className="text-center p-3 rounded-lg bg-success/10">
                      <div className="text-2xl font-bold text-success">{scanResult.openPorts}</div>
                      <div className="text-xs text-muted-foreground">Open</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-destructive/10">
                      <div className="text-2xl font-bold text-destructive">{scanResult.closedPorts}</div>
                      <div className="text-xs text-muted-foreground">Closed</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-primary/10">
                      <div className="text-2xl font-bold text-primary">{scanResult.ports.length}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
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
                      <Shield className="h-5 w-5 text-primary" />
                      Scan Results
                    </CardTitle>
                    <CardDescription>
                      {scanResult
                        ? `${scanResult.ports.length} ports scanned on ${scanResult.ip}`
                        : "Results will appear here"}
                    </CardDescription>
                  </div>
                  {scanResult && (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {(scanResult.scanDuration / 1000).toFixed(2)}s
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!scanResult ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Server className="h-16 w-16 mb-4 opacity-20" />
                    <p>No scan results yet</p>
                    <p className="text-sm">Configure and start a scan to see results</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead className="w-[80px]">Port</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead className="w-[120px]">Response Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {scanResult.ports
                            .sort((a, b) => {
                              // Sort by status (open first), then by port number
                              if (a.status === "open" && b.status !== "open") return -1;
                              if (a.status !== "open" && b.status === "open") return 1;
                              return a.port - b.port;
                            })
                            .map((port, index) => (
                              <TableRow
                                key={port.port}
                                className="animate-fade-in"
                                style={{ animationDelay: `${index * 0.02}s` }}
                              >
                                <TableCell className="font-mono font-medium">
                                  {port.port}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(port.status)}
                                    {getStatusBadge(port.status)}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {port.service || (
                                    <span className="text-muted-foreground">Unknown</span>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-sm">
                                  {port.responseTime ? (
                                    <span className="text-success">{port.responseTime}ms</span>
                                  ) : (
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
