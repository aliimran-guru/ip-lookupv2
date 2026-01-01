import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Database,
  Wifi,
  WifiOff,
  Pencil,
  Check,
  X,
  Search,
  RefreshCw,
  Loader2,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { HostnameInput, saveHostname as saveHostnameToStorage } from "@/components/HostnameSuggestions";
import { useScanState } from "@/hooks/useScanState";
import { format } from "date-fns";

interface IPInventoryItem {
  id: string;
  ip_address: string;
  status: string;
  hostname: string | null;
  custom_hostname: string | null;
  last_seen_at: string | null;
  hostname_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function IPExist() {
  const { toast } = useToast();
  const { scanProgress } = useScanState();
  const [inventory, setInventory] = useState<IPInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHostnameValue, setEditHostnameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Load inventory from database
  const loadInventory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ip_inventory")
        .select("*")
        .order("ip_address", { ascending: true });

      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load IP inventory",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("ip_inventory_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ip_inventory",
        },
        () => {
          loadInventory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const startEditHostname = (item: IPInventoryItem) => {
    setEditingId(item.id);
    setEditHostnameValue(item.custom_hostname || item.hostname || "");
  };

  const saveHostname = async (item: IPInventoryItem) => {
    const hostnameToSave = editHostnameValue.trim() || null;

    try {
      const { error } = await supabase
        .from("ip_inventory")
        .update({
          custom_hostname: hostnameToSave,
          hostname_updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) throw error;

      // Save to localStorage for suggestions
      if (hostnameToSave) {
        saveHostnameToStorage(hostnameToSave, item.ip_address);
      }

      setEditingId(null);
      setEditHostnameValue("");

      toast({
        title: "Hostname Updated",
        description: `Hostname for ${item.ip_address} has been saved`,
      });

      loadInventory();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update hostname",
        variant: "destructive",
      });
    }
  };

  const cancelEditHostname = () => {
    setEditingId(null);
    setEditHostnameValue("");
  };

  const deleteItem = async (item: IPInventoryItem) => {
    try {
      const { error } = await supabase
        .from("ip_inventory")
        .delete()
        .eq("id", item.id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: `${item.ip_address} has been removed`,
      });

      loadInventory();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
    }
  };

  // Filter inventory
  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.ip_address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.custom_hostname || item.hostname || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeCount = inventory.filter((i) => i.status === "active").length;
  const inactiveCount = inventory.filter((i) => i.status === "inactive").length;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold">
              <span className="gradient-text">IP Inventory</span>
            </h1>
            <p className="text-muted-foreground">
              Daftar permanent IP yang terdeteksi dari scan
            </p>
          </div>

          {/* Scan Progress Indicator */}
          {scanProgress?.isScanning && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        Scanning in progress...
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(scanProgress.progress)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Range: {scanProgress.startIp} - {scanProgress.endIp}</span>
                      <span className="text-success">✓ {scanProgress.activeCount} active</span>
                      <span className="text-destructive">✗ {scanProgress.inactiveCount} inactive</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono">
                    {scanProgress.currentIp}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-success">{activeCount}</div>
                  <div className="text-sm text-muted-foreground">Active</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-destructive">{inactiveCount}</div>
                  <div className="text-sm text-muted-foreground">Inactive</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{inventory.length}</div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    IP Inventory
                  </CardTitle>
                  <CardDescription>
                    {filteredInventory.length} of {inventory.length} IPs
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadInventory}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              {/* Filters */}
              <div className="flex gap-4 pt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search IP or hostname..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredInventory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Database className="h-16 w-16 mb-4 opacity-20" />
                  <p>No IPs in inventory</p>
                  <p className="text-sm">Run a scan to add IPs</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="max-h-[500px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-[150px]">IP Address</TableHead>
                          <TableHead className="w-[100px]">Status</TableHead>
                          <TableHead>Hostname</TableHead>
                          <TableHead className="w-[180px]">Last Updated</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventory.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-sm">
                              {item.ip_address}
                            </TableCell>
                            <TableCell>
                              {item.status === "active" ? (
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
                            <TableCell className="text-sm">
                              {editingId === item.id ? (
                                <div className="flex items-center gap-1">
                                  <HostnameInput
                                    value={editHostnameValue}
                                    onChange={setEditHostnameValue}
                                    onSave={() => saveHostname(item)}
                                    onCancel={cancelEditHostname}
                                    placeholder="Enter hostname"
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => saveHostname(item)}
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
                                  <span
                                    className={
                                      item.custom_hostname || item.hostname
                                        ? "font-mono"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {item.custom_hostname || item.hostname || "(not set)"}
                                  </span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => startEditHostname(item)}
                                    title="Edit hostname"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.hostname_updated_at ? (
                                <span title={new Date(item.hostname_updated_at).toLocaleString()}>
                                  {format(new Date(item.hostname_updated_at), "dd MMM yyyy HH:mm")}
                                </span>
                              ) : item.last_seen_at ? (
                                <span title={new Date(item.last_seen_at).toLocaleString()}>
                                  {format(new Date(item.last_seen_at), "dd MMM yyyy HH:mm")}
                                </span>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => deleteItem(item)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
    </Layout>
  );
}
