import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Calendar,
  Clock,
  Bell,
  BellRing,
  Trash2,
  Play,
  AlertCircle,
  Radio,
  Server,
  Settings,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ScheduledScan {
  id: string;
  name: string;
  target: string;
  scan_type: string;
  cron_expression: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

interface StatusChange {
  id: string;
  ip_address: string;
  previous_status: string | null;
  new_status: string;
  detected_at: string;
  is_notified: boolean;
}

const CRON_PRESETS = {
  "*/5 * * * *": "Every 5 minutes",
  "*/15 * * * *": "Every 15 minutes",
  "*/30 * * * *": "Every 30 minutes",
  "0 * * * *": "Every hour",
  "0 */6 * * *": "Every 6 hours",
  "0 0 * * *": "Daily at midnight",
};

type ScanMode = "cloud" | "self-hosted";

export default function ScheduledScans() {
  const { toast } = useToast();
  const [scans, setScans] = useState<ScheduledScan[]>([]);
  const [statusChanges, setStatusChanges] = useState<StatusChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("self-hosted"); // Default to self-hosted
  const [pingServerUrl, setPingServerUrl] = useState("http://localhost:8000");
  
  // Form state
  const [newScan, setNewScan] = useState({
    name: "",
    target: "10.1.10.1-10.1.10.254",
    scan_type: "network",
    cron_expression: "0 * * * *",
  });

  useEffect(() => {
    fetchScans();
    fetchStatusChanges();
    
    // Subscribe to realtime status changes
    const channel = supabase
      .channel("status-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ip_status_changes",
        },
        (payload) => {
          const change = payload.new as StatusChange;
          setStatusChanges((prev) => [change, ...prev].slice(0, 50));
          
          // Show notification
          toast({
            title: "Status Change Detected",
            description: `${change.ip_address}: ${change.previous_status || "unknown"} → ${change.new_status}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchScans = async () => {
    const { data, error } = await supabase
      .from("scheduled_scans")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch scheduled scans",
        variant: "destructive",
      });
    } else {
      setScans(data || []);
    }
    setIsLoading(false);
  };

  const fetchStatusChanges = async () => {
    const { data, error } = await supabase
      .from("ip_status_changes")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setStatusChanges(data);
    }
  };

  const createScheduledScan = async () => {
    if (!newScan.name.trim() || !newScan.target.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("scheduled_scans").insert({
      name: newScan.name,
      target: newScan.target,
      scan_type: newScan.scan_type,
      cron_expression: newScan.cron_expression,
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to create scheduled scan",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Scheduled scan created",
      });
      setIsDialogOpen(false);
      setNewScan({
        name: "",
        target: "192.168.1.0/24",
        scan_type: "network",
        cron_expression: "0 * * * *",
      });
      fetchScans();
    }
  };

  const toggleScanActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from("scheduled_scans")
      .update({ is_active: !isActive })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update scan status",
        variant: "destructive",
      });
    } else {
      setScans((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !isActive } : s))
      );
    }
  };

  const deleteScan = async (id: string) => {
    const { error } = await supabase
      .from("scheduled_scans")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete scan",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Deleted",
        description: "Scheduled scan has been removed",
      });
      setScans((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const runScanNow = async (scan: ScheduledScan) => {
    toast({
      title: "Scan Started",
      description: `Running scan: ${scan.name} (${scanMode === "self-hosted" ? "ICMP" : "TCP"})`,
    });

    try {
      let scanData: { results: any[], totalHosts: number, activeHosts: number, scanDuration: number };

      if (scanMode === "self-hosted") {
        // Use self-hosted ICMP ping server
        const response = await fetch(`${pingServerUrl}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: scan.target, timeout: 2, batchSize: 10 }),
        });

        if (!response.ok) {
          throw new Error(`Ping server error: ${response.statusText}`);
        }

        const data = await response.json();
        scanData = {
          results: data.results,
          totalHosts: data.totalHosts,
          activeHosts: data.activeHosts,
          scanDuration: data.scanDuration,
        };
      } else {
        // Use cloud edge function
        const { data, error } = await supabase.functions.invoke("network-scan", {
          body: { target: scan.target },
        });

        if (error) throw error;
        scanData = data;
      }

      // Save results
      await supabase.from("scan_results").insert({
        scheduled_scan_id: scan.id,
        target: scan.target,
        scan_type: scan.scan_type,
        results: scanData.results,
        total_hosts: scanData.totalHosts,
        active_hosts: scanData.activeHosts,
        scan_duration_ms: scanData.scanDuration,
      });

      // Update last_run_at
      await supabase
        .from("scheduled_scans")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", scan.id);

      toast({
        title: "Scan Complete",
        description: `Found ${scanData.activeHosts} active hosts`,
      });

      fetchScans();
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("id-ID", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">
                <span className="gradient-text">Scheduled Scans</span>
              </h1>
              <p className="text-muted-foreground mt-2">
                Otomatisasi scan jaringan dengan notifikasi perubahan status
              </p>
            </div>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <div className="flex items-center gap-2">
                {/* Scan Mode Selector */}
                <Select value={scanMode} onValueChange={(v) => setScanMode(v as ScanMode)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self-hosted">
                      <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4" />
                        ICMP Ping
                      </div>
                    </SelectItem>
                    <SelectItem value="cloud">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Cloud TCP
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Schedule
                  </Button>
                </DialogTrigger>
              </div>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Scheduled Scan</DialogTitle>
                  <DialogDescription>
                    Set up automatic network scanning
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Scan Name</Label>
                    <Input
                      placeholder="Office Network Scan"
                      value={newScan.name}
                      onChange={(e) =>
                        setNewScan({ ...newScan, name: e.target.value })
                      }
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Target (IP/CIDR)</Label>
                    <Input
                      placeholder="192.168.1.0/24"
                      value={newScan.target}
                      onChange={(e) =>
                        setNewScan({ ...newScan, target: e.target.value })
                      }
                      className="font-mono"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Scan Type</Label>
                    <Select
                      value={newScan.scan_type}
                      onValueChange={(v) =>
                        setNewScan({ ...newScan, scan_type: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="network">Network Scan</SelectItem>
                        <SelectItem value="port">Port Scan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Schedule</Label>
                    <Select
                      value={newScan.cron_expression}
                      onValueChange={(v) =>
                        setNewScan({ ...newScan, cron_expression: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CRON_PRESETS).map(([cron, label]) => (
                          <SelectItem key={cron} value={cron}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createScheduledScan}>Create Schedule</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Ping Server Configuration */}
          {scanMode === "self-hosted" && (
            <Card className="lg:col-span-3">
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-4 w-4 text-primary" />
                  Ping Server Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="flex items-center gap-4">
                  <Label htmlFor="ping-server-url" className="whitespace-nowrap">Server URL:</Label>
                  <Input
                    id="ping-server-url"
                    value={pingServerUrl}
                    onChange={(e) => setPingServerUrl(e.target.value)}
                    placeholder="http://localhost:8000"
                    className="font-mono text-sm max-w-md"
                  />
                  <p className="text-xs text-muted-foreground">
                    Run: <code className="bg-muted px-1 py-0.5 rounded">docker-compose up --build</code>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Scheduled Scans List */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Scheduled Scans
                </CardTitle>
                <CardDescription>
                  Manage your automated network scans
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading...
                  </div>
                ) : scans.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Calendar className="h-16 w-16 mb-4 opacity-20" />
                    <p>No scheduled scans yet</p>
                    <p className="text-sm">Create one to get started</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Schedule</TableHead>
                          <TableHead>Last Run</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scans.map((scan) => (
                          <TableRow key={scan.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={scan.is_active}
                                  onCheckedChange={() =>
                                    toggleScanActive(scan.id, scan.is_active)
                                  }
                                />
                                <span className={!scan.is_active ? "text-muted-foreground" : ""}>
                                  {scan.name}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {scan.target}
                            </TableCell>
                            <TableCell className="text-sm">
                              {CRON_PRESETS[scan.cron_expression as keyof typeof CRON_PRESETS] ||
                                scan.cron_expression}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(scan.last_run_at)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => runScanNow(scan)}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteScan(scan.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Changes / Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  Status Changes
                </CardTitle>
                <CardDescription>
                  Recent IP status changes detected
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statusChanges.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Bell className="h-12 w-12 mb-4 opacity-20" />
                    <p className="text-sm">No status changes yet</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-auto">
                    {statusChanges.map((change) => (
                      <div
                        key={change.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <AlertCircle
                          className={`h-5 w-5 mt-0.5 ${
                            change.new_status === "active"
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm truncate">
                            {change.ip_address}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {change.previous_status || "unknown"} →{" "}
                            <span
                              className={
                                change.new_status === "active"
                                  ? "text-success"
                                  : "text-destructive"
                              }
                            >
                              {change.new_status}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(change.detected_at)}
                          </p>
                        </div>
                      </div>
                    ))}
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
