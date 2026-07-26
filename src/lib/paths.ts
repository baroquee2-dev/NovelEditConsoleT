import { invoke } from "@tauri-apps/api/core";

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke("write_text_file", { path, contents });
}

export async function writeBinaryFile(path: string, contents: Uint8Array): Promise<void> {
  await invoke("write_binary_file", { path, contents: Array.from(contents) });
}

export async function readBinaryFile(path: string): Promise<Uint8Array> {
  const data = await invoke<number[]>("read_binary_file", { path });
  return Uint8Array.from(data);
}

export async function mkdirp(path: string): Promise<void> {
  await invoke("mkdirp", { path });
}

export async function removePath(path: string): Promise<void> {
  await invoke("remove_path", { path });
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export async function getAppDataDir(): Promise<string> {
  return invoke<string>("get_app_data_dir");
}

export async function getExecutableDir(): Promise<string> {
  return invoke<string>("get_executable_dir");
}

/** 預設專案（啟動時自動載入）放在程式本體目錄下的 autosave */
export async function getDefaultAutosaveDir(): Promise<string> {
  const exeDir = await getExecutableDir();
  return joinPath(exeDir, "autosave");
}

export async function getDefaultAutosaveProjectPath(): Promise<string> {
  return joinPath(await getDefaultAutosaveDir(), "current.novelproj.json");
}

/** Windows / cross-platform path join (project paths from dialog are absolute). */
export function joinPath(...parts: string[]): string {
  const cleaned = parts
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p.replace(/[/\\]+$/, "") : p.replace(/^[/\\]+/, "")))
    .join("/");
  return cleaned.replace(/\//g, "\\");
}

export function projectBaseName(projectFile: string): string {
  const name = projectFile.split(/[/\\]/).pop() ?? "project";
  return name.endsWith(".novelproj.json") ? name.slice(0, -".novelproj.json".length) : name.replace(/\.json$/, "");
}

export function projectDir(projectFile: string): string {
  const parts = projectFile.split(/[/\\]/);
  parts.pop();
  return parts.join("\\");
}

export function contentDir(projectFile: string): string {
  const base = projectBaseName(projectFile);
  return joinPath(projectDir(projectFile), `${base}.novelproj.content`);
}

export function assetsDir(projectFile: string): string {
  const base = projectBaseName(projectFile);
  return joinPath(projectDir(projectFile), `${base}.novelproj.assets`);
}

export function imagesDir(projectFile: string): string {
  return joinPath(assetsDir(projectFile), "images");
}

export function contentFilePath(projectFile: string, nodeId: string): string {
  return joinPath(contentDir(projectFile), `${nodeId}.json`);
}

export function chapterStatsPath(projectFile: string): string {
  const base = projectBaseName(projectFile);
  return joinPath(projectDir(projectFile), `${base}.novelproj.chapter-stats.json`);
}

export function relativeImageRef(_projectFile: string, fileName: string): string {
  return `assets/images/${fileName}`;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]);

export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const ext of IMAGE_EXT) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function imageFileName(sourcePath: string): string {
  const ext = sourcePath.match(/\.[^.\\/]+$/)?.[0]?.toLowerCase();
  const safeExt = ext && IMAGE_EXT.has(ext) ? ext : ".png";
  return `${crypto.randomUUID()}${safeExt}`;
}
