import { absoluteAssetPath, loadChapterDoc } from "./project";
import { readBinaryFile } from "./paths";

export type ExportDocNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  content?: ExportDocNode[];
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function imageMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

function walkDoc(node: ExportDocNode, fn: (n: ExportDocNode) => void) {
  fn(node);
  if (node.content) for (const c of node.content) walkDoc(c, fn);
}

export async function embedImagesInDoc(doc: object, projectFile: string): Promise<object> {
  const clone = structuredClone(doc) as ExportDocNode;
  const tasks: Promise<void>[] = [];

  walkDoc(clone, (node) => {
    if (node.type !== "floatingImage" || typeof node.attrs?.src !== "string") return;
    const src = node.attrs.src;
    if (src.startsWith("data:") || src.startsWith("http")) return;

    tasks.push(
      (async () => {
        try {
          const abs = absoluteAssetPath(projectFile, src);
          const bytes = await readBinaryFile(abs);
          const mime = imageMime(abs);
          node.attrs!.src = `data:${mime};base64,${bytesToBase64(bytes)}`;
        } catch {
          /* keep original src if unreadable */
        }
      })(),
    );
  });

  await Promise.all(tasks);
  return clone;
}

export async function prepareChapterDocForExport(
  projectFile: string,
  chapterId: string,
): Promise<object> {
  const raw = await loadChapterDoc(projectFile, chapterId);
  return embedImagesInDoc(raw, projectFile);
}
