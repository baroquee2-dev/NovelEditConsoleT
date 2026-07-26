import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { save } from "@tauri-apps/plugin-dialog";
import html2pdf from "html2pdf.js";
import { PDFDocument } from "pdf-lib";
import { getExportExtensions } from "./editorExtensions";
import { writeDocxFromChapters } from "./exportDocx";
import { prepareChapterDocForExport } from "./exportPrepare";
import { writeBinaryFile, writeTextFile } from "./paths";

export type ExportFormat = "html" | "pdf" | "word";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHtmlDocument(body: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Microsoft JhengHei UI", "Segoe UI", sans-serif; font-size: 17px; line-height: 1.75; color: #222; max-width: 820px; margin: 2rem auto; padding: 0 1.5rem; }
    .chapter { page-break-before: always; margin-bottom: 3rem; }
    .chapter:first-child { page-break-before: auto; }
    h1 { font-size: 1.6rem; border-bottom: 1px solid #ddd; padding-bottom: 0.4rem; margin-bottom: 1.2rem; }
    img { max-width: 100%; }
    p { margin: 0 0 0.75em; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

async function buildExportHtml(
  projectFile: string,
  chapters: { id: string; name: string }[],
): Promise<string> {
  const sections: string[] = [];

  for (const ch of chapters) {
    const doc = await prepareChapterDocForExport(projectFile, ch.id);
    const body = generateHTML(doc as JSONContent, getExportExtensions());
    sections.push(`<section class="chapter"><h1>${escapeHtml(ch.name)}</h1>${body}</section>`);
  }

  const title = chapters.length === 1 ? chapters[0].name : "export";
  return wrapHtmlDocument(sections.join("\n"), title);
}

function formatExt(format: ExportFormat): string {
  if (format === "pdf") return ".pdf";
  if (format === "word") return ".docx";
  return ".html";
}

function saveFilters(format: ExportFormat): { name: string; extensions: string[] }[] {
  if (format === "pdf") return [{ name: "PDF", extensions: ["pdf"] }];
  if (format === "word") return [{ name: "Word", extensions: ["docx"] }];
  return [{ name: "HTML", extensions: ["html"] }];
}

async function waitForPdfAssets(root: HTMLElement): Promise<void> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 12_000);
        }),
    ),
  );

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function buildPdfCaptureRoot(html: string): HTMLElement {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const host = document.createElement("div");
  host.setAttribute("data-pdf-export", "1");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:820px;box-sizing:border-box;padding:24px 28px;background:#ffffff;color:#222222;z-index:2147483646;overflow:visible;";

  const style = document.createElement("style");
  const docStyle = parsed.querySelector("style")?.textContent ?? "";
  style.textContent = `
${docStyle}
[data-pdf-export] { font-family: "Microsoft JhengHei UI", "Segoe UI", sans-serif; font-size: 17px; line-height: 1.75; }
[data-pdf-export] .chapter { page-break-before: always; margin-bottom: 2rem; }
[data-pdf-export] .chapter:first-child { page-break-before: auto; }
[data-pdf-export] h1 { font-size: 1.6rem; border-bottom: 1px solid #ddd; padding-bottom: 0.4rem; margin-bottom: 1.2rem; }
[data-pdf-export] p { margin: 0 0 0.75em; }
[data-pdf-export] [data-type="floating-image"] {
  position: relative !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 1rem 0 !important;
  overflow: visible !important;
}
[data-pdf-export] [data-type="floating-image"] img {
  position: static !important;
  display: block !important;
  width: auto !important;
  max-width: 100% !important;
  height: auto !important;
  object-fit: contain !important;
}
`;
  host.appendChild(style);

  const content = document.createElement("div");
  content.innerHTML = parsed.body.innerHTML;
  host.appendChild(content);

  return host;
}

const PDF_HTML2CANVAS = {
  scale: 2,
  useCORS: true,
  backgroundColor: "#ffffff",
  logging: false,
  scrollX: 0,
  scrollY: 0,
};

async function renderPdfBlobFromCaptureRoot(host: HTMLElement): Promise<Blob> {
  await waitForPdfAssets(host);
  const content = host.lastElementChild as HTMLElement;
  return (await html2pdf()
    .set({
      margin: 12,
      filename: "export.pdf",
      image: { type: "jpeg", quality: 0.92 },
      html2canvas: PDF_HTML2CANVAS,
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(content)
    .outputPdf("blob")) as Blob;
}

async function writePdfFromHtml(html: string, savePath: string): Promise<void> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const chapterEls = Array.from(parsed.querySelectorAll("section.chapter"));
  const bodies =
    chapterEls.length > 0
      ? chapterEls.map((el) => el.outerHTML)
      : [`<section class="chapter">${parsed.body.innerHTML}</section>`];

  const merged = await PDFDocument.create();

  for (const bodyChunk of bodies) {
    const chapterHtml = wrapHtmlDocument(bodyChunk, "chapter");
    const host = buildPdfCaptureRoot(chapterHtml);
    document.body.appendChild(host);
    try {
      const blob = await renderPdfBlobFromCaptureRoot(host);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.byteLength < 128) continue;
      const doc = await PDFDocument.load(bytes);
      const copied = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of copied) merged.addPage(page);
    } finally {
      document.body.removeChild(host);
    }
  }

  if (merged.getPageCount() === 0) {
    throw new Error("PDF output empty");
  }

  const out = await merged.save();
  await writeBinaryFile(savePath, out);
}

export async function exportChapters(
  projectFile: string,
  chapters: { id: string; name: string }[],
  format: ExportFormat,
): Promise<boolean> {
  if (chapters.length === 0) return false;

  const suggested = chapters.length === 1 ? chapters[0].name : "chapters-export";
  const picked = await save({
    defaultPath: `${suggested}${formatExt(format)}`,
    filters: saveFilters(format),
  });
  if (!picked || typeof picked !== "string") return false;

  let path = picked;
  const ext = formatExt(format);
  if (!path.toLowerCase().endsWith(ext)) {
    path += ext;
  }

  const html = format === "word" ? null : await buildExportHtml(projectFile, chapters);

  if (format === "html") {
    await writeTextFile(path, html!);
  } else if (format === "pdf") {
    await writePdfFromHtml(html!, path);
  } else {
    await writeDocxFromChapters(projectFile, chapters, path);
  }

  return true;
}
