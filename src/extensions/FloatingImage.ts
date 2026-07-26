import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FloatingImageView } from "../components/FloatingImageView";

export interface FloatingImageAttrs {
  src: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    floatingImage: {
      insertFloatingImage: (attrs: Partial<FloatingImageAttrs>) => ReturnType;
    };
  }
}

export const FloatingImage = Node.create({
  name: "floatingImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: { default: null },
      x: { default: 48 },
      y: { default: 48 },
      width: { default: 280 },
      height: { default: 210 },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="floating-image"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = node.attrs.src as string | null;
    const x = Number(node.attrs.x) || 0;
    const y = Number(node.attrs.y) || 0;
    const width = Number(node.attrs.width) || 280;
    const height = Number(node.attrs.height) || 210;
    if (!src) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-type": "floating-image" })];
    }
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "floating-image",
        style: `position:relative;height:0;margin:0;padding:0;border:0;overflow:visible;min-height:${y + height}px;`,
      }),
      [
        "img",
        {
          src,
          alt: "",
          style: `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;object-fit:contain;`,
        },
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FloatingImageView);
  },

  addCommands() {
    return {
      insertFloatingImage:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src ?? null,
              x: attrs.x ?? 48,
              y: attrs.y ?? 48,
              width: attrs.width ?? 280,
              height: attrs.height ?? 210,
            },
          });
        },
    };
  },
});

export async function loadImageNaturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 280;
      const h = img.naturalHeight || 210;
      resolve({ w, h });
    };
    img.onerror = () => resolve({ w: 280, h: 210 });
    img.src = src;
  });
}

export function scaleToDefaultWidth(nw: number, nh: number, targetW = 280): { width: number; height: number } {
  if (nw <= 0) return { width: targetW, height: Math.round(targetW * 0.75) };
  const ratio = nh / nw;
  return { width: targetW, height: Math.round(targetW * ratio) };
}
