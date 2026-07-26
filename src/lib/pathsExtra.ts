import { invoke } from "@tauri-apps/api/core";
import { contentFilePath, contentDir, joinPath, chapterStatsPath } from "./paths";

export async function listDir(path: string): Promise<string[]> {
  return invoke<string[]>("list_dir", { path });
}

export async function copyFile(from: string, to: string): Promise<void> {
  await invoke("copy_file", { from, to });
}

export async function listContentFiles(projectFile: string): Promise<string[]> {
  try {
    const dir = contentDir(projectFile);
    const names = await listDir(dir);
    return names.filter((n) => n.endsWith(".json")).map((n) => n.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

export { removePath } from "./paths";

export async function copyTreeDir(fromDir: string, toDir: string): Promise<void> {
  const { mkdirp, readTextFile, writeTextFile, readBinaryFile, writeBinaryFile, pathExists } =
    await import("./paths");
  if (!(await pathExists(fromDir))) return;
  await mkdirp(toDir);
  const names = await listDir(fromDir);
  for (const name of names) {
    const from = joinPath(fromDir, name);
    const to = joinPath(toDir, name);

    if (!name.includes(".")) {
      await copyTreeDir(from, to);
      continue;
    }

    try {
      const bin = await readBinaryFile(from);
      await writeBinaryFile(to, bin);
    } catch {
      const text = await readTextFile(from);
      await writeTextFile(to, text);
    }
  }
}

export async function copyProjectSidecars(fromProject: string, toProject: string): Promise<void> {
  const sep = fromProject.includes("\\") ? "\\" : "/";
  const fromFolder = fromProject.slice(0, fromProject.lastIndexOf(sep));
  const toFolder = toProject.slice(0, toProject.lastIndexOf(sep));
  const fromBase = fromProject.split(/[/\\]/).pop()!.replace(".novelproj.json", "");
  const toBase = toProject.split(/[/\\]/).pop()!.replace(".novelproj.json", "");

  await copyTreeDir(
    joinPath(fromFolder, `${fromBase}.novelproj.content`),
    joinPath(toFolder, `${toBase}.novelproj.content`),
  );
  await copyTreeDir(
    joinPath(fromFolder, `${fromBase}.novelproj.assets`),
    joinPath(toFolder, `${toBase}.novelproj.assets`),
  );

  const { pathExists } = await import("./paths");
  const fromStats = chapterStatsPath(fromProject);
  const toStats = chapterStatsPath(toProject);
  if (await pathExists(fromStats)) {
    await copyFile(fromStats, toStats);
  }
}

export { contentFilePath };
