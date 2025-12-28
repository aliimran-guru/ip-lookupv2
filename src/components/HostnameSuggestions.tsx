import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const HOSTNAME_STORAGE_KEY = "network-scanner-hostnames";

export interface HostnameSuggestion {
  hostname: string;
  ip?: string;
  lastUsed: number;
}

// Get stored hostnames from localStorage
export function getStoredHostnames(): HostnameSuggestion[] {
  try {
    const stored = localStorage.getItem(HOSTNAME_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save hostname to localStorage
export function saveHostname(hostname: string, ip?: string) {
  if (!hostname.trim()) return;
  
  const hostnames = getStoredHostnames();
  const existing = hostnames.findIndex(h => h.hostname.toLowerCase() === hostname.toLowerCase());
  
  if (existing >= 0) {
    hostnames[existing].lastUsed = Date.now();
    if (ip) hostnames[existing].ip = ip;
  } else {
    hostnames.push({ hostname: hostname.trim(), ip, lastUsed: Date.now() });
  }
  
  // Keep only the last 100 hostnames
  const sorted = hostnames.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 100);
  localStorage.setItem(HOSTNAME_STORAGE_KEY, JSON.stringify(sorted));
}

interface HostnameInputProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  placeholder?: string;
  className?: string;
}

export function HostnameInput({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder = "Enter hostname",
  className,
}: HostnameInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<HostnameSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update suggestions based on input
  useEffect(() => {
    const allHostnames = getStoredHostnames();
    
    if (!value.trim()) {
      // Show recent hostnames when empty
      setSuggestions(allHostnames.slice(0, 8));
    } else {
      // Filter by input
      const filtered = allHostnames
        .filter(h => 
          h.hostname.toLowerCase().includes(value.toLowerCase())
        )
        .slice(0, 8);
      setSuggestions(filtered);
    }
    setSelectedIndex(-1);
  }, [value]);

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        onChange(suggestions[selectedIndex].hostname);
        setShowSuggestions(false);
      } else {
        onSave();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      onCancel();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      if (selectedIndex >= 0) {
        onChange(suggestions[selectedIndex].hostname);
      } else if (suggestions.length === 1) {
        onChange(suggestions[0].hostname);
      }
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (hostname: string) => {
    onChange(hostname);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn("h-7 text-sm font-mono", className)}
        autoComplete="off"
        autoFocus
      />
      
      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.hostname}
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm font-mono transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  index === selectedIndex && "bg-accent text-accent-foreground"
                )}
                onClick={() => selectSuggestion(suggestion.hostname)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{suggestion.hostname}</span>
                  {suggestion.ip && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {suggestion.ip}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-border bg-muted/50">
            <span className="text-xs text-muted-foreground">
              ↑↓ navigate • Tab/Enter select • Esc close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
