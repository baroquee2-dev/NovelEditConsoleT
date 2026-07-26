import { chapterStatsPath, readTextFile, writeTextFile } from "./paths";

export interface ChapterStatsEntry {
  createdAt: string;
  updatedAt: string;
  /** 累計處於編輯狀態的毫秒數 */
  editTimeMs: number;
}

export type ChapterStatsStore = Record<string, ChapterStatsEntry>;

type DocNode = {
  type?: string;
  text?: string;
  content?: DocNode[];
};

export async function loadChapterStats(projectFile: string): Promise<ChapterStatsStore> {
  try {
    const raw = await readTextFile(chapterStatsPath(projectFile));
    const data = JSON.parse(raw) as ChapterStatsStore;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export async function saveChapterStats(projectFile: string, store: ChapterStatsStore): Promise<void> {
  await writeTextFile(chapterStatsPath(projectFile), JSON.stringify(store, null, 2));
}

export function createChapterStatsEntry(now = new Date()): ChapterStatsEntry {
  const iso = now.toISOString();
  return { createdAt: iso, updatedAt: iso, editTimeMs: 0 };
}

export function ensureStatsForFileIds(store: ChapterStatsStore, ids: Iterable<string>): boolean {
  let changed = false;
  for (const id of ids) {
    if (!store[id]) {
      store[id] = createChapterStatsEntry();
      changed = true;
    }
  }
  return changed;
}

export function removeStatsForIds(store: ChapterStatsStore, ids: string[]): void {
  for (const id of ids) {
    delete store[id];
  }
}

/** 字數：正文文字字元數（不含空白；不含圖片節點） */
export function countCharactersInDoc(doc: object): number {
  const text = extractDocText(doc as DocNode);
  return text.replace(/\s/g, "").length;
}

function extractDocText(node: DocNode): string {
  if (node.type === "floatingImage") return "";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (!node.content) return "";
  return node.content.map(extractDocText).join("");
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatStatsDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
