import { contextBridge } from 'electron';
import { createElectronAPI } from './api';

// Create the unified API by combining all domain-specific APIs
const electronAPI = createElectronAPI();

// Expose to renderer via contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Expose debug flag for debug logging
contextBridge.exposeInMainWorld('DEBUG', process.env.DEBUG === 'true');

// Expose Convex configuration
contextBridge.exposeInMainWorld('CONVEX_URL', process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || '');
