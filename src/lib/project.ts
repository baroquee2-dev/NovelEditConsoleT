import { convertFileSrc } from "@tauri-apps/api/core";
import {
  contentFilePath,
  contentDir,
  imagesDir,
  joinPath,
  mkdirp,
  readBinaryFile,
  readTextFile,
  relativeImageRef,
  writeBinaryFile,
  writeTextFile,
  imageFileName,
  isImagePath,
} from "./paths";
import {
  collectFileIds,
  EMPTY_DOC,
  PROJECT_VERSION,
  ProjectMeta,
  TreeNode,
  newId,
} from "./types";

export function resolveProjectImageSrc(projectFile: string, rel: string): string {
  const absolute = absoluteAssetPath(projectFile, rel);
  return convertFileSrc(normalizePathForAsset(absolute));
}

function normalizePathForAsset(path: string): string {
  return path.replace(/\\/g, "/");
}

export async function loadProjectMeta(projectFile: string): Promise<ProjectMeta> {
  const raw = await readTextFile(projectFile);
  const data = JSON.parse(raw) as ProjectMeta;
  if (!data.nodes) data.nodes = [];
  data.version = PROJECT_VERSION;
  return data;
}

export async function saveProjectMeta(projectFile: string, meta: ProjectMeta): Promise<void> {
  const payload: ProjectMeta = { version: PROJECT_VERSION, nodes: meta.nodes };
  await writeTextFile(projectFile, JSON.stringify(payload, null, 2));
}

export async function loadChapterDoc(projectFile: string, nodeId: string): Promise<object> {
  const path = contentFilePath(projectFile, nodeId);
  try {
    const raw = await readTextFile(path);
    return JSON.parse(raw) as object;
  } catch {
    return structuredClone(EMPTY_DOC);
  }
}

export async function saveChapterDoc(
  projectFile: string,
  nodeId: string,
  doc: object,
): Promise<void> {
  await mkdirp(contentDir(projectFile));
  await writeTextFile(contentFilePath(projectFile, nodeId), JSON.stringify(doc, null, 2));
}

export function rewriteDocImageUrls(doc: object, projectFile: string): object {
  const clone = JSON.parse(JSON.stringify(doc)) as DocNode;
  walkDoc(clone, (node) => {
    if (node.type === "floatingImage" && typeof node.attrs?.src === "string") {
      const src = node.attrs.src;
      if (!src.startsWith("http") && !src.startsWith("asset:") && !src.startsWith("data:")) {
        node.attrs.src = resolveProjectImageSrc(projectFile, src);
      }
    }
  });
  return clone;
}

type DocNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
};

function walkDoc(node: DocNode, fn: (n: DocNode) => void) {
  fn(node);
  if (node.content) for (const c of node.content) walkDoc(c, fn);
}

export function stripDocToRelativeAssets(doc: object): object {
  const clone = JSON.parse(JSON.stringify(doc)) as DocNode;
  walkDoc(clone, (node) => {
    if (node.type === "floatingImage" && typeof node.attrs?.src === "string") {
      const src = node.attrs.src;
      const idx = src.indexOf("assets/images/");
      if (idx >= 0) {
        node.attrs.src = src.slice(idx);
      }
    }
  });
  return clone;
}

export async function importImageToProject(
  projectFile: string,
  sourcePath: string,
  bytes?: Uint8Array,
): Promise<{ rel: string; displaySrc: string }> {
  await mkdirp(imagesDir(projectFile));
  const fileName = imageFileName(sourcePath);
  const dest = joinPath(imagesDir(projectFile), fileName);
  const data = bytes ?? (await readBinaryFile(sourcePath));
  await writeBinaryFile(dest, data);
  const rel = relativeImageRef(projectFile, fileName);
  return { rel, displaySrc: convertFileSrc(normalizePathForAsset(dest)) };
}

export async function cleanupOrphanChapters(projectFile: string, nodes: TreeNode[]): Promise<void> {
  const valid = collectFileIds(nodes);
  const { listContentFiles } = await import("./pathsExtra");
  const { removePath } = await import("./paths");
  const files = await listContentFiles(projectFile);
  for (const id of files) {
    if (!valid.has(id)) {
      await removePath(contentFilePath(projectFile, id));
    }
  }
}

export function defaultProjectMeta(): ProjectMeta {
  const root = { id: newId(), name: "default", type: "folder" as const, children: [] as TreeNode[] };
  root.children!.push({ id: newId(), name: "default", type: "file" });
  return { version: PROJECT_VERSION, nodes: [root] };
}

export function projectFolderFromFile(projectFile: string): string {
  const sep = projectFile.includes("\\") ? "\\" : "/";
  const idx = projectFile.lastIndexOf(sep);
  return idx >= 0 ? projectFile.slice(0, idx) : projectFile;
}

export function absoluteAssetPath(projectFile: string, rel: string): string {
  const name = projectFile.split(/[/\\]/).pop()!.replace(".novelproj.json", "");
  const sub = rel.replace(/^assets\//, "");
  return joinPath(projectFolderFromFile(projectFile), `${name}.novelproj.assets`, sub);
}

export { isImagePath, PROJECT_VERSION };
