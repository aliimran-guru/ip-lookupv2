import { Layout } from "@/components/Layout";
import { NetworkAnimation } from "@/components/NetworkAnimation";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Search,
  Zap,
  Shield,
  Download,
  History,
  Moon,
  ArrowRight,
  CheckCircle,
  Network,
  Calendar,
  Bell,
} from "lucide-react";

const features = [
  {
    icon: Search,
    title: "IP Range Scanning",
    description:
      "Scan IP range dengan format manual (192.168.1.1-254) atau CIDR notation (192.168.1.0/24)",
  },
  {
    icon: Shield,
    title: "Port Scanning",
    description:
      "Scan port pada IP target dengan preset (common, web, database) atau custom ports",
  },
  {
    icon: Calendar,
    title: "Scheduled Scans",
    description:
      "Jadwalkan scan otomatis dengan interval yang bisa dikustomisasi",
  },
  {
    icon: Bell,
    title: "Status Notifications",
    description:
      "Notifikasi real-time jika ada perubahan status IP di jaringan",
  },
  {
    icon: Download,
    title: "Export Report",
    description:
      "Export hasil scan ke format PDF atau CSV untuk dokumentasi",
  },
  {
    icon: Moon,
    title: "Dark/Light Mode",
    description:
      "Pilih tema sesuai preferensi dengan dark atau light mode",
  },
];

export default function Landing() {
  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        <NetworkAnimation />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-fade-in">
              <Network className="h-4 w-4" />
              Professional Network Scanner Tool
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight animate-slide-up">
              <span className="gradient-text">Teknisi</span>
              <br />
              <span className="text-foreground">IP Lookup</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "0.1s" }}>
              Tool scanning IP profesional untuk teknisi jaringan. 
              Scan range IP, deteksi status active/inactive, dan export report dengan mudah.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <Link to="/scanner">
                <Button size="lg" className="gap-2 glow text-lg px-8">
                  <Search className="h-5 w-5" />
                  IP Scanner
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/port-scanner">
                <Button size="lg" variant="outline" className="gap-2 text-lg px-8">
                  <Shield className="h-5 w-5" />
                  Port Scanner
                </Button>
              </Link>
              <Link to="/scheduled">
                <Button size="lg" variant="outline" className="gap-2 text-lg px-8">
                  <Calendar className="h-5 w-5" />
                  Scheduled
                </Button>
              </Link>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 pt-12 max-w-lg mx-auto animate-slide-up" style={{ animationDelay: "0.3s" }}>
              <div className="text-center">
                <div className="text-3xl font-bold gradient-text">254</div>
                <div className="text-sm text-muted-foreground">Max IPs/Scan</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold gradient-text">Real-time</div>
                <div className="text-sm text-muted-foreground">Scanning</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold gradient-text">PDF/CSV</div>
                <div className="text-sm text-muted-foreground">Export</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-primary/30 flex items-start justify-center p-2">
            <div className="w-1.5 h-3 bg-primary rounded-full animate-pulse" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Fitur <span className="gradient-text">Lengkap</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Semua yang kamu butuhkan untuk scanning dan management IP dalam satu aplikasi
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="group p-6 rounded-xl bg-card border border-border/50 hover-lift transition-all hover:border-primary/50"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="mb-4 inline-flex p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Cara <span className="gradient-text">Menggunakan</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Mudah digunakan dalam 3 langkah sederhana
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: "01",
                title: "Masukkan IP Range",
                description: "Ketik range IP manual atau gunakan CIDR notation",
              },
              {
                step: "02",
                title: "Jalankan Scan",
                description: "Klik tombol scan dan tunggu proses selesai",
              },
              {
                step: "03",
                title: "Lihat & Export",
                description: "Lihat hasil dan export ke PDF atau CSV",
              },
            ].map((item, index) => (
              <div key={index} className="relative text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary font-bold text-xl mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {item.description}
                </p>
                {index < 2 && (
                  <ArrowRight className="hidden md:block absolute top-8 -right-4 text-primary/30 h-8 w-8" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-10" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold">
              Siap Untuk <span className="gradient-text">Scanning</span>?
            </h2>
            <p className="text-muted-foreground text-lg">
              Mulai scan network kamu sekarang. Gratis dan tidak perlu registrasi.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/scanner">
                <Button size="lg" className="gap-2 glow text-lg px-8">
                  <Search className="h-5 w-5" />
                  Mulai Scanning Sekarang
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap gap-4 justify-center text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-success" />
                Gratis
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-success" />
                No Registration
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-success" />
                Export PDF/CSV
              </span>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
