import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TreeDropMode, TreeNode } from "../lib/types";
import {
  canDropOnTree,
  createFile,
  createFolder,
  findNode,
  findParentFolderId,
  moveNodeInTree,
  resolveDropTarget,
} from "../lib/types";

import type { ExportFormat } from "../lib/export";

interface ChapterTreeProps {
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect: (id: string | null, type?: "file" | "folder") => void;
  onChange: (nodes: TreeNode[]) => void;
  onDeleteNode: (id: string) => void;
  onExportNode: (nodeId: string, format: ExportFormat) => void;
}

type DropHint = { overId: string; mode: TreeDropMode; valid: boolean };

const DRAG_THRESHOLD_PX = 5;

function pickDropMode(
  node: TreeNode,
  clientY: number,
  top: number,
  height: number,
): TreeDropMode {
  const ratio = height > 0 ? (clientY - top) / height : 0.5;
  if (node.type === "folder") {
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "inside";
  }
  return ratio < 0.5 ? "before" : "after";
}

function nodeFromPoint(clientX: number, clientY: number): HTMLElement | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof Element)) return null;
  return el.closest(".tree-node") as HTMLElement | null;
}

export function ChapterTree({ nodes, selectedId, onSelect, onChange, onDeleteNode, onExportNode }: ChapterTreeProps) {
  const { t } = useTranslation();
  const treeRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const [context, setContext] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [namePrompt, setNamePrompt] = useState<{ kind: "folder" | "file"; parentId: string | null } | null>(
    null,
  );
  const [nameInput, setNameInput] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  /** 在此集合內的資料夾 id 為收合狀態 */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const dropHintRef = useRef(dropHint);
  dropHintRef.current = dropHint;
  const suppressClickRef = useRef(false);

  const dragSession = useRef<{
    id: string;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number;
  } | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const isExpanded = (folderId: string) => !collapsed.has(folderId);

  const toggleCollapse = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const applyNodes = (next: TreeNode[]) => {
    nodesRef.current = next;
    onChangeRef.current(next);
  };

  const updateNodes = (next: TreeNode[]) => applyNodes(next);

  const currentNodes = () => nodesRef.current;

  const insertParent = (selectedId: string | null): string | null => {
    const list = currentNodes();
    if (!selectedId) return null;
    const found = findNode(list, selectedId);
    if (!found) return null;
    if (found.node.type === "folder") return selectedId;
    return findParentFolderId(list, selectedId);
  };

  useEffect(() => {
    if (!namePrompt) return;
    const timer = window.setTimeout(() => {
      const el = nameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [namePrompt]);

  const openNamePrompt = (kind: "folder" | "file", parentOverride?: string | null) => {
    const parentId = parentOverride !== undefined ? parentOverride : insertParent(selectedId);
    setNameInput("");
    setNamePrompt({ kind, parentId });
  };

  const cancelNamePrompt = () => {
    setNamePrompt(null);
    setNameInput("");
  };

  const confirmNamePrompt = () => {
    if (!namePrompt) return;
    const name = nameInput.trim() || t("node.default");
    commitAddNode(namePrompt.kind, namePrompt.parentId, name);
    cancelNamePrompt();
  };

  const commitAddNode = (kind: "folder" | "file", parentId: string | null, name: string) => {
    const list = currentNodes();
    const node = kind === "folder" ? createFolder(name) : createFile(name);

    if (!parentId) {
      updateNodes([...list, node]);
    } else {
      const copy = structuredClone(list) as TreeNode[];
      const target = findNode(copy, parentId);
      if (!target || target.node.type !== "folder") return;
      if (!target.node.children) target.node.children = [];
      target.node.children.push(node);
      updateNodes(copy);
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }

    handleSelect(node.id, node.type);
  };

  const addFolder = (parentOverride?: string | null) => {
    openNamePrompt("folder", parentOverride);
  };

  const addFile = (parentOverride?: string | null) => {
    openNamePrompt("file", parentOverride);
  };

  const removeNode = (id: string) => {
    onDeleteNode(id);
  };

  const focusTree = () => {
    treeRef.current?.focus();
  };

  const handleSelect = (id: string, type: "file" | "folder") => {
    onSelect(id, type);
    focusTree();
  };

  const clearSelection = () => {
    onSelect(null);
    focusTree();
  };

  const commitRename = (id: string) => {
    const name = renameValue.trim() || t("tree.unnamed");
    const copy = structuredClone(currentNodes()) as TreeNode[];
    const target = findNode(copy, id);
    if (target) target.node.name = name;
    updateNodes(copy);
    setRenamingId(null);
  };

  const clearDragUi = () => {
    setDraggingId(null);
    setDropHint(null);
    document.body.classList.remove("tree-is-dragging");
  };

  const applyDrop = (dragId: string, overId: string, mode: TreeDropMode) => {
    const list = currentNodes();
    const target = resolveDropTarget(list, overId, mode);
    if (!target) return;
    const result = moveNodeInTree(list, dragId, target);
    if (!result.ok) return;
    updateNodes(result.nodes);
    if (mode === "inside") {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(overId);
        return next;
      });
    }
  };

  const updateHoverFromPoint = (dragId: string, clientX: number, clientY: number) => {
    const overEl = nodeFromPoint(clientX, clientY);
    if (!overEl) {
      setDropHint(null);
      return;
    }
    const overId = overEl.dataset.nodeId;
    if (!overId || overId === dragId) {
      setDropHint(null);
      return;
    }
    const overNode = findNode(currentNodes(), overId)?.node;
    if (!overNode) {
      setDropHint(null);
      return;
    }
    const rect = overEl.getBoundingClientRect();
    const mode = pickDropMode(overNode, clientY, rect.top, rect.height);
    const valid = canDropOnTree(currentNodes(), dragId, overId, mode);
    setDropHint({ overId, mode, valid });
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const session = dragSession.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      if (!session.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        session.active = true;
        suppressClickRef.current = true;
        setDraggingId(session.id);
        setContext(null);
        document.body.classList.add("tree-is-dragging");
      }

      e.preventDefault();
      updateHoverFromPoint(session.id, e.clientX, e.clientY);
    };

    const finishDrop = (dragId: string, clientX: number, clientY: number) => {
      const hint = dropHintRef.current;
      if (hint && hint.valid) {
        applyDrop(dragId, hint.overId, hint.mode);
        return;
      }
      const overEl = nodeFromPoint(clientX, clientY);
      if (!overEl) {
        const list = currentNodes();
        const result = moveNodeInTree(list, dragId, { parentId: null, index: list.length });
        if (result.ok) updateNodes(result.nodes);
        return;
      }
      const overId = overEl.dataset.nodeId;
      const overNode = overId ? findNode(currentNodes(), overId)?.node : null;
      if (!overId || !overNode || overId === dragId) return;
      const rect = overEl.getBoundingClientRect();
      const mode = pickDropMode(overNode, clientY, rect.top, rect.height);
      if (canDropOnTree(currentNodes(), dragId, overId, mode)) {
        applyDrop(dragId, overId, mode);
      }
    };

    const onUp = (e: PointerEvent) => {
      const session = dragSession.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dragId = session.id;
      const wasActive = session.active;
      dragSession.current = null;

      if (wasActive) {
        e.preventDefault();
        finishDrop(dragId, e.clientX, e.clientY);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      } else {
        suppressClickRef.current = false;
      }

      clearDragUi();
    };

    const onCancel = () => {
      dragSession.current = null;
      suppressClickRef.current = false;
      clearDragUi();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.body.classList.remove("tree-is-dragging");
    };
  }, []);

  const beginPointerDrag = (nodeId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (renamingId || namePrompt) return;
    if ((e.target as HTMLElement).closest(".tree-toggle, .tree-rename")) return;

    dragSession.current = {
      id: nodeId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isFolder = node.type === "folder";
    const selected = selectedId === node.id;
    const hasChildren = isFolder && (node.children?.length ?? 0) > 0;
    const expanded = isFolder && isExpanded(node.id);
    const hint = dropHint?.overId === node.id ? dropHint : null;
    const dropClass = hint
      ? hint.valid
        ? `tree-drop-${hint.mode}`
        : "tree-drop-invalid"
      : "";
    const dragging = draggingId === node.id;

    return (
      <div key={node.id} className="tree-node-wrap">
        <div
          className={`tree-node ${selected ? "selected" : ""} ${dragging ? "tree-dragging" : ""} ${dropClass}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          data-node-id={node.id}
          data-node-type={node.type}
          title={isFolder ? t("tree.dragFolderHint") : t("tree.dragFileHint")}
          onPointerDown={(e) => beginPointerDrag(node.id, e)}
          onClick={() => {
            if (suppressClickRef.current || draggingId) return;
            handleSelect(node.id, node.type);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContext({ x: e.clientX, y: e.clientY, nodeId: node.id });
          }}
        >
          {isFolder ? (
            <button
              type="button"
              className={`tree-toggle ${hasChildren ? "" : "tree-toggle--empty"}`}
              aria-label={expanded ? t("tree.collapse") : t("tree.expand")}
              disabled={!hasChildren}
              onClick={(e) => hasChildren && toggleCollapse(node.id, e)}
            >
              {hasChildren ? (expanded ? "▾" : "▸") : ""}
            </button>
          ) : (
            <span className="tree-toggle-spacer" aria-hidden />
          )}
          <span className="tree-icon">{isFolder ? "📁" : "📄"}</span>
          {renamingId === node.id ? (
            <input
              className="tree-rename"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(node.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(node.id);
                if (e.key === "Escape") setRenamingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="tree-label">{node.name}</span>
          )}
        </div>
        {isFolder && expanded && node.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div
      className={`chapter-tree ${draggingId ? "chapter-tree--dragging" : ""}`}
      ref={treeRef}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "Delete") return;
        if (renamingId || namePrompt) return;
        if (!selectedId) return;
        e.preventDefault();
        onDeleteNode(selectedId);
      }}
    >
      <div className="tree-toolbar">
        <button type="button" onClick={() => addFolder()}>
          {t("tree.addFolder")}
        </button>
        <button type="button" onClick={() => addFile()}>
          {t("tree.addFile")}
        </button>
      </div>
      <div
        className="tree-body"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".tree-node")) return;
          if (renamingId || namePrompt || draggingId) return;
          clearSelection();
        }}
      >
        {nodes.map((n) => renderNode(n, 0))}
      </div>
      {context && (
        <>
          <div className="menu-backdrop" onClick={() => setContext(null)} />
          <div className="tree-menu" style={{ left: context.x, top: context.y }}>
            {findNode(nodes, context.nodeId)?.node.type === "folder" && (
              <>
                <button type="button" onClick={() => { addFolder(context.nodeId); setContext(null); }}>
                  {t("tree.addSubFolder")}
                </button>
                <button type="button" onClick={() => { addFile(context.nodeId); setContext(null); }}>
                  {t("tree.addSubFile")}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const n = findNode(nodes, context.nodeId)?.node;
                if (n) {
                  setRenamingId(context.nodeId);
                  setRenameValue(n.name);
                }
                setContext(null);
              }}
            >
              {t("tree.rename")}
            </button>
            <button type="button" onClick={() => { removeNode(context.nodeId); setContext(null); }}>
              {t("tree.delete")}
            </button>
            <div className="tree-menu-sep" />
            <div className="tree-menu-label">
              {t("tree.exportSection")}
              {findNode(nodes, context.nodeId)?.node.type === "folder" && (
                <span className="tree-menu-hint"> {t("tree.exportFolderHint")}</span>
              )}
            </div>
            {(["html", "pdf", "word"] as ExportFormat[]).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => {
                  onExportNode(context.nodeId, format);
                  setContext(null);
                }}
              >
                {format === "html" && t("tree.exportHtml")}
                {format === "pdf" && t("tree.exportPdf")}
                {format === "word" && t("tree.exportWord")}
              </button>
            ))}
          </div>
        </>
      )}
      {namePrompt && (
        <>
          <div className="menu-backdrop" onClick={cancelNamePrompt} />
          <div className="name-prompt" role="dialog" aria-modal="true" aria-labelledby="name-prompt-title">
            <h3 id="name-prompt-title" className="name-prompt-title">
              {namePrompt.kind === "folder" ? t("tree.namePromptFolder") : t("tree.namePromptFile")}
            </h3>
            <input
              ref={nameInputRef}
              className="name-prompt-input"
              type="text"
              value={nameInput}
              placeholder={t("tree.namePromptPlaceholder")}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmNamePrompt();
                }
                if (e.key === "Escape") cancelNamePrompt();
              }}
            />
            <div className="name-prompt-actions">
              <button type="button" onClick={cancelNamePrompt}>
                {t("dialog.cancel")}
              </button>
              <button type="button" className="name-prompt-ok" onClick={confirmNamePrompt}>
                {t("dialog.ok")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
