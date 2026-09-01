import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { invoke } from '@tauri-apps/api/core';

// Polyfill the Electron IPC bridge with Tauri invoke
// @ts-ignore
window.scriptManagerDesktop = {
  runtime: new Proxy({}, {
    get: (_, prop) => {
      if (typeof prop === 'string') {
        return async (...args: any[]) => {
           console.log('[Tauri IPC Polyfill] Calling', prop, args);
           const snakeProp = prop.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
           try {
             return await invoke(snakeProp, args[0] || {});
           } catch (err) {
             console.warn(`[Tauri IPC Polyfill] Failed ${snakeProp}:`, err);
             if (snakeProp === 'get_bootstrap_state') return { scripts: [], collections: [], settings: {} };
             if (prop.includes('Settings')) return {};
             if (prop.startsWith('list') || prop.startsWith('get') || prop.startsWith('read') || prop.startsWith('fetch')) return [];
             return null;
           }
        };
      }
    }
  })
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
