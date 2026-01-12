/// <reference types="vite/client" />
import { ElectronAPI } from "../shared/types/ipc";

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
