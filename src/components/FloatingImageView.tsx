import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { resolveProjectImageSrc } from "../lib/project";
import { useProjectFile } from "../lib/ProjectFileContext";

function isAbsoluteMediaUrl(src: string): boolean {
  return /^(https?:|asset:|data:|blob:)/i.test(src);
}

export function FloatingImageView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const projectFile = useProjectFile();
  const { src, x, y, width, height } = node.attrs as {
    src: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
  };

  const imgSrc = useMemo(() => {
    if (!src) return null;
    if (isAbsoluteMediaUrl(src)) return src;
    if (projectFile) return resolveProjectImageSrc(projectFile, src);
    return null;
  }, [src, projectFile]);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    ratio: number;
  } | null>(null);

  const onDragMove = useCallback(
    (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      updateAttributes({
        x: Math.max(0, dragRef.current.origX + dx),
        y: Math.max(0, dragRef.current.origY + dy),
      });
    },
    [updateAttributes],
  );

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }, [onDragMove]);

  const onResizeMove = useCallback(
    (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(48, resizeRef.current.origW + dx);
      updateAttributes({
        width: newW,
        height: Math.max(48, Math.round(newW * resizeRef.current.ratio)),
      });
    },
    [updateAttributes],
  );

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }, [onResizeMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("mouseup", onDragEnd);
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeEnd);
    };
  }, [onDragMove, onDragEnd, onResizeMove, onResizeEnd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteNode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, deleteNode]);

  if (!src || !imgSrc) return null;

  return (    <NodeViewWrapper
      as="div"
      className="floating-image-host"
      style={{ height: 0, margin: 0, padding: 0, border: "none", overflow: "visible" }}
      data-drag-handle=""
    >
      <div
        className={`floating-image ${selected ? "is-selected" : ""}`}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width,
          height,
          zIndex: selected ? 20 : 10,
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).classList.contains("floating-image-resize")) return;
          e.preventDefault();
          dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
          window.addEventListener("mousemove", onDragMove);
          window.addEventListener("mouseup", onDragEnd);
        }}
      >
        <img src={imgSrc} alt="" draggable={false} />        {selected && (
          <div
            className="floating-image-resize"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              resizeRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                origW: width,
                origH: height,
                ratio: height / width || 0.75,
              };
              window.addEventListener("mousemove", onResizeMove);
              window.addEventListener("mouseup", onResizeEnd);
            }}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}
