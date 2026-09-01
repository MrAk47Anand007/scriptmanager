import { invoke } from '@tauri-apps/api/core';
export async function readSettingsRuntime(): Promise<Record<string, string>> { return invoke('get_settings'); }
export async function saveSettingsRuntime(settings: Record<string, string>): Promise<Record<string, string>> { return settings; }
