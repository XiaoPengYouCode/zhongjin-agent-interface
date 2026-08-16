export interface SettingsFileMeta {
  name: string;
  path: string;
  exists: boolean;
}

export interface SettingsInfo {
  agentDir: string;
  cwd: string;
  files: SettingsFileMeta[];
}

export interface SettingsFile {
  name: string;
  content: string;
  exists: boolean;
}

export async function fetchSettings(): Promise<SettingsInfo> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`Failed to fetch settings (${res.status})`);
  return (await res.json()) as SettingsInfo;
}

export async function fetchSettingsFile(name: string): Promise<SettingsFile> {
  const res = await fetch(`/api/settings/file?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
  return (await res.json()) as SettingsFile;
}

export async function saveSettingsFile(name: string, content: string): Promise<void> {
  const res = await fetch(`/api/settings/file?name=${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Failed to save (${res.status})`);
  }
}
