import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ScanProgress {
  isScanning: boolean;
  progress: number;
  currentIp: string;
  activeCount: number;
  inactiveCount: number;
  startIp: string;
  endIp: string;
  startTime: number;
}

interface ScanState {
  scanProgress: ScanProgress | null;
  setScanProgress: (progress: ScanProgress | null) => void;
  updateProgress: (updates: Partial<ScanProgress>) => void;
}

export const useScanState = create<ScanState>()(
  persist(
    (set) => ({
      scanProgress: null,
      setScanProgress: (progress) => set({ scanProgress: progress }),
      updateProgress: (updates) => set((state) => ({
        scanProgress: state.scanProgress 
          ? { ...state.scanProgress, ...updates }
          : null
      })),
    }),
    {
      name: 'scan-state-storage',
    }
  )
);
