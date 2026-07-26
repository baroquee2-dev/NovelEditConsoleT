import {
  getDefaultAutosaveDir,
  getDefaultAutosaveProjectPath,
  joinPath,
  mkdirp,
  pathExists,
  readTextFile,
  writeTextFile,
} from "./paths";
import { listDir } from "./pathsExtra";
import { loadProjectMeta } from "./project";
import { PROJECT_VERSION, type ProjectMeta } from "./types";

export type SessionPrefs = {
  lastProjectPath: string | null;
  lastSelectedId: string | null;
};

const EMPTY_PREFS: SessionPrefs = {
  lastProjectPath: null,
  lastSelectedId: null,
};

export function emptyProjectMeta(): ProjectMeta {
  return { version: PROJECT_VERSION, nodes: [] };
}

export async function getSessionPrefsPath(): Promise<string> {
  return joinPath(await getDefaultAutosaveDir(), "session.json");
}

export async function loadSessionPrefs(): Promise<SessionPrefs> {
  try {
    const path = await getSessionPrefsPath();
    if (!(await pathExists(path))) return { ...EMPTY_PREFS };
    const raw = JSON.parse(await readTextFile(path)) as Partial<SessionPrefs>;
    return {
      lastProjectPath: typeof raw.lastProjectPath === "string" ? raw.lastProjectPath : null,
      lastSelectedId: typeof raw.lastSelectedId === "string" ? raw.lastSelectedId : null,
    };
  } catch {
    return { ...EMPTY_PREFS };
  }
}

export async function saveSessionPrefs(prefs: SessionPrefs): Promise<void> {
  await mkdirp(await getDefaultAutosaveDir());
  await writeTextFile(await getSessionPrefsPath(), JSON.stringify(prefs, null, 2));
}

/** 專案檔是否存在且 meta 可解析 */
export async function tryReadProjectMeta(path: string): Promise<ProjectMeta | null> {
  try {
    if (!(await pathExists(path))) return null;
    const meta = await loadProjectMeta(path);
    if (!Array.isArray(meta.nodes)) return null;
    return meta;
  } catch {
    return null;
  }
}

/** 預設存檔目錄內的 .novelproj.json（current 優先） */
export async function listAutosaveProjectPaths(): Promise<string[]> {
  const dir = await getDefaultAutosaveDir();
  await mkdirp(dir);
  let names: string[] = [];
  try {
    names = await listDir(dir);
  } catch {
    return [];
  }
  const paths = names
    .filter((n) => n.endsWith(".novelproj.json"))
    .map((n) => joinPath(dir, n));
  paths.sort((a, b) => {
    const ap = a.toLowerCase().endsWith("\\current.novelproj.json") || a.toLowerCase().endsWith("/current.novelproj.json") ? 0 : 1;
    const bp = b.toLowerCase().endsWith("\\current.novelproj.json") || b.toLowerCase().endsWith("/current.novelproj.json") ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.localeCompare(b);
  });
  return paths;
}

export async function findReadableAutosaveProject(): Promise<{ path: string; meta: ProjectMeta } | null> {
  const defaultPath = await getDefaultAutosaveProjectPath();
  const ordered = await listAutosaveProjectPaths();
  const unique = [defaultPath, ...ordered.filter((p) => p.toLowerCase() !== defaultPath.toLowerCase())];
  for (const path of unique) {
    const meta = await tryReadProjectMeta(path);
    if (meta) return { path, meta };
  }
  return null;
}
