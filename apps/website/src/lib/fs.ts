/**
 * Open the OS-native folder picker (macOS NSOpenPanel via the backend).
 * Resolves with the chosen absolute path, or null if the user cancelled.
 */
export async function pickFolder(): Promise<string | null> {
  const res = await fetch("/api/fs/pick", { method: "POST" });
  const data = (await res.json()) as { path?: string };
  return data.path ?? null;
}
