import {
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
  UnderlineType,
  ImageRun,
  type ParagraphChild,
} from "docx";
import { writeBinaryFile } from "./paths";
import type { ExportDocNode } from "./exportPrepare";
import { prepareChapterDocForExport } from "./exportPrepare";

type DocxImageType = "jpg" | "png" | "gif" | "bmp";

function parseDataUrl(src: string): { bytes: Uint8Array; type: DocxImageType } | null {
  const m = src.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  let type: DocxImageType = "png";
  if (raw === "jpeg" || raw === "jpg") type = "jpg";
  else if (raw === "gif") type = "gif";
  else if (raw === "bmp") type = "bmp";
  else if (raw === "png") type = "png";
  else return null;

  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, type };
}

function pxToHalfPoints(px: number): number {
  return Math.max(1, Math.round(px * 0.75 * 2));
}

function textNodeToRun(node: ExportDocNode): TextRun {
  const marks = node.marks ?? [];
  let bold = false;
  let italics = false;
  let underline = false;
  let color: string | undefined;
  let font: string | undefined;
  let size: number | undefined;

  for (const mark of marks) {
    if (mark.type === "bold") bold = true;
    if (mark.type === "italic") italics = true;
    if (mark.type === "underline") underline = true;
    if (mark.type === "textStyle" && mark.attrs) {
      if (typeof mark.attrs.color === "string") {
        color = mark.attrs.color.replace(/^#/, "");
      }
      if (typeof mark.attrs.fontFamily === "string") {
        font = mark.attrs.fontFamily.replace(/['"]/g, "");
      }
      if (typeof mark.attrs.fontSize === "string") {
        const px = parseFloat(mark.attrs.fontSize);
        if (!Number.isNaN(px)) size = pxToHalfPoints(px);
      }
    }
  }

  return new TextRun({
    text: node.text ?? "",
    bold,
    italics,
    underline: underline ? { type: UnderlineType.SINGLE } : undefined,
    color,
    font,
    size,
  });
}

function inlineChildren(nodes: ExportDocNode[] | undefined): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      out.push(textNodeToRun(n));
    } else if (n.type === "hardBreak") {
      out.push(new TextRun({ break: 1 }));
    }
  }
  return out;
}

function paragraphFromInlines(inlines: ParagraphChild[], extra?: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] }): Paragraph {
  if (inlines.length === 0) {
    return new Paragraph({ children: [new TextRun("")], ...extra });
  }
  return new Paragraph({ children: inlines, ...extra });
}

function floatingImageParagraph(node: ExportDocNode): Paragraph | null {
  const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
  const parsed = src.startsWith("data:") ? parseDataUrl(src) : null;
  if (!parsed) return null;

  const width = Math.round(Number(node.attrs?.width) || 280);
  const height = Math.round(Number(node.attrs?.height) || 210);

  return new Paragraph({
    children: [
      new ImageRun({
        type: parsed.type,
        data: parsed.bytes,
        transformation: { width, height },
      }),
    ],
    spacing: { after: 200 },
  });
}

function blocksFromListItem(item: ExportDocNode, prefix: string): Paragraph[] {
  const blocks: Paragraph[] = [];
  for (const child of item.content ?? []) {
    if (child.type === "paragraph") {
      const runs: ParagraphChild[] = [new TextRun(prefix), ...inlineChildren(child.content)];
      blocks.push(paragraphFromInlines(runs));
    } else {
      blocks.push(...blocksFromNode(child));
    }
  }
  return blocks;
}

function blocksFromNode(node: ExportDocNode): Paragraph[] {
  const type = node.type ?? "";

  if (type === "paragraph") {
    return [paragraphFromInlines(inlineChildren(node.content))];
  }

  if (type === "heading") {
    const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1));
    const heading =
      level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
    return [paragraphFromInlines(inlineChildren(node.content), { heading })];
  }

  if (type === "floatingImage") {
    const p = floatingImageParagraph(node);
    return p ? [p] : [];
  }

  if (type === "bulletList") {
    const blocks: Paragraph[] = [];
    for (const item of node.content ?? []) {
      if (item.type === "listItem") blocks.push(...blocksFromListItem(item, "• "));
    }
    return blocks;
  }

  if (type === "orderedList") {
    const blocks: Paragraph[] = [];
    let index = 1;
    for (const item of node.content ?? []) {
      if (item.type === "listItem") {
        blocks.push(...blocksFromListItem(item, `${index}. `));
        index += 1;
      }
    }
    return blocks;
  }

  if (type === "blockquote") {
    const blocks: Paragraph[] = [];
    for (const child of node.content ?? []) {
      blocks.push(...blocksFromNode(child));
    }
    return blocks;
  }

  if (type === "codeBlock") {
    const text = (node.content ?? [])
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
    return [
      new Paragraph({
        children: [new TextRun({ text, font: "Consolas" })],
        spacing: { before: 120, after: 120 },
      }),
    ];
  }

  if (type === "horizontalRule") {
    return [new Paragraph({ children: [new TextRun("———")], spacing: { before: 200, after: 200 } })];
  }

  if (node.content) {
    const blocks: Paragraph[] = [];
    for (const child of node.content) blocks.push(...blocksFromNode(child));
    return blocks;
  }

  return [];
}

function chapterTitleParagraph(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: title, bold: true, size: 32 })],
    spacing: { after: 240 },
  });
}

function docToParagraphs(doc: object): Paragraph[] {
  const root = doc as ExportDocNode;
  const blocks: Paragraph[] = [];
  for (const node of root.content ?? []) {
    blocks.push(...blocksFromNode(node));
  }
  return blocks;
}

export async function writeDocxFromChapters(
  projectFile: string,
  chapters: { id: string; name: string }[],
  savePath: string,
): Promise<void> {
  const children: Paragraph[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (i > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    children.push(chapterTitleParagraph(ch.name));
    const doc = await prepareChapterDocForExport(projectFile, ch.id);
    children.push(...docToParagraphs(doc));
  }

  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun("")] }));
  }

  const document = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toArrayBuffer(document);
  await writeBinaryFile(savePath, new Uint8Array(buffer));
}
