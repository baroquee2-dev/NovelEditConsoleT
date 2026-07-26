export type NodeType = "folder" | "file";

export interface TreeNode {
  id: string;
  name: string;
  type: NodeType;
  children?: TreeNode[];
}

export interface ProjectMeta {
  version: 3;
  nodes: TreeNode[];
}

export const PROJECT_VERSION = 3 as const;

export const EMPTY_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function newId(): string {
  return crypto.randomUUID();
}

export function createFolder(name = "default"): TreeNode {
  return { id: newId(), name, type: "folder", children: [] };
}

export function createFile(name = "default"): TreeNode {
  return { id: newId(), name, type: "file" };
}

export function collectFileIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.type === "file") ids.add(n.id);
      else if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

export function findNode(
  nodes: TreeNode[],
  id: string,
): { node: TreeNode; parent: TreeNode[]; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return { node: n, parent: nodes, index: i };
    if (n.type === "folder" && n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParentFolderId(nodes: TreeNode[], id: string): string | null {
  for (const n of nodes) {
    if (n.type === "folder" && n.children?.some((c) => c.id === id)) return n.id;
    if (n.type === "folder" && n.children) {
      const inner = findParentFolderId(n.children, id);
      if (inner) return inner;
    }
  }
  return null;
}

export function collectFileIdsInSubtree(node: TreeNode): string[] {
  if (node.type === "file") return [node.id];
  const ids: string[] = [];
  for (const child of node.children ?? []) {
    ids.push(...collectFileIdsInSubtree(child));
  }
  return ids;
}

export function removeNodeFromTree(nodes: TreeNode[], id: string): TreeNode[] | null {
  const copy = structuredClone(nodes) as TreeNode[];
  const found = findNode(copy, id);
  if (!found) return null;
  found.parent.splice(found.index, 1);
  return copy;
}

export function pickSelectionAfterDelete(
  nodes: TreeNode[],
  deletedId: string,
  nodesAfterDelete: TreeNode[],
): string | null {
  const found = findNode(nodes, deletedId);
  if (!found) {
    return collectFileIds(nodesAfterDelete).values().next().value ?? null;
  }
  const { parent, index } = found;
  const candidates = [
    index + 1 < parent.length ? parent[index + 1].id : null,
    index > 0 ? parent[index - 1].id : null,
    findParentFolderId(nodes, deletedId),
  ];
  for (const id of candidates) {
    if (id && findNode(nodesAfterDelete, id)) return id;
  }
  return collectFileIds(nodesAfterDelete).values().next().value ?? null;
}

export function collectChapterNodesUnder(
  nodes: TreeNode[],
  targetId: string,
): { id: string; name: string }[] {
  const found = findNode(nodes, targetId);
  if (!found) return [];

  const walk = (n: TreeNode): { id: string; name: string }[] => {
    if (n.type === "file") return [{ id: n.id, name: n.name }];
    const list: { id: string; name: string }[] = [];
    for (const c of n.children ?? []) list.push(...walk(c));
    return list;
  };

  return walk(found.node);
}

export function walkTree(nodes: TreeNode[], fn: (n: TreeNode) => void) {
  for (const n of nodes) {
    fn(n);
    if (n.type === "folder" && n.children) walkTree(n.children, fn);
  }
}

/** 根層 depth = 0 */
export function getNodeDepth(nodes: TreeNode[], id: string, depth = 0): number | null {
  for (const n of nodes) {
    if (n.id === id) return depth;
    if (n.type === "folder" && n.children) {
      const d = getNodeDepth(n.children, id, depth + 1);
      if (d != null) return d;
    }
  }
  return null;
}

export function nodeContainsId(node: TreeNode, id: string): boolean {
  if (node.id === id) return true;
  for (const c of node.children ?? []) {
    if (nodeContainsId(c, id)) return true;
  }
  return false;
}

/** 插入位置：parentId=null 表示根層；index 為插入前的目標索引 */
export type TreeInsertTarget = {
  parentId: string | null;
  index: number;
};

export type TreeDropMode = "before" | "after" | "inside";

export function resolveDropTarget(
  nodes: TreeNode[],
  overId: string,
  mode: TreeDropMode,
): TreeInsertTarget | null {
  const over = findNode(nodes, overId);
  if (!over) return null;

  if (mode === "inside") {
    if (over.node.type !== "folder") return null;
    return { parentId: overId, index: over.node.children?.length ?? 0 };
  }

  const parentId = findParentFolderId(nodes, overId);
  if (mode === "before") return { parentId, index: over.index };
  return { parentId, index: over.index + 1 };
}

export type MoveNodeFailReason =
  | "not_found"
  | "noop"
  | "cycle"
  | "folder_deeper"
  | "bad_target";

export type MoveNodeResult =
  | { ok: true; nodes: TreeNode[] }
  | { ok: false; reason: MoveNodeFailReason };

/**
 * 搬移節點（資料夾會連同整棵子樹）。
 * - 章節檔：可任意層級
 * - 資料夾：僅允許同層或往上層（newDepth <= oldDepth），不可往更深層
 */
export function moveNodeInTree(
  nodes: TreeNode[],
  dragId: string,
  target: TreeInsertTarget,
): MoveNodeResult {
  const src = findNode(nodes, dragId);
  if (!src) return { ok: false, reason: "not_found" };

  const { parentId: destParentId, index: destIndexRaw } = target;

  if (destParentId === dragId) return { ok: false, reason: "cycle" };
  if (destParentId && src.node.type === "folder" && nodeContainsId(src.node, destParentId)) {
    return { ok: false, reason: "cycle" };
  }

  if (destParentId != null) {
    const destParent = findNode(nodes, destParentId);
    if (!destParent || destParent.node.type !== "folder") {
      return { ok: false, reason: "bad_target" };
    }
  }

  const oldDepth = getNodeDepth(nodes, dragId);
  if (oldDepth == null) return { ok: false, reason: "not_found" };

  const newDepth =
    destParentId == null ? 0 : (getNodeDepth(nodes, destParentId) ?? -1) + 1;
  if (newDepth < 0) return { ok: false, reason: "bad_target" };

  if (src.node.type === "folder" && newDepth > oldDepth) {
    return { ok: false, reason: "folder_deeper" };
  }

  const srcParentId = findParentFolderId(nodes, dragId);
  let adjustedIndex = destIndexRaw;
  if (srcParentId === destParentId && src.index < destIndexRaw) {
    adjustedIndex = destIndexRaw - 1;
  }

  if (srcParentId === destParentId && adjustedIndex === src.index) {
    return { ok: false, reason: "noop" };
  }

  const copy = structuredClone(nodes) as TreeNode[];
  const found = findNode(copy, dragId);
  if (!found) return { ok: false, reason: "not_found" };

  const [removed] = found.parent.splice(found.index, 1);

  let destList: TreeNode[];
  if (destParentId == null) {
    destList = copy;
  } else {
    const dest = findNode(copy, destParentId);
    if (!dest || dest.node.type !== "folder") return { ok: false, reason: "bad_target" };
    if (!dest.node.children) dest.node.children = [];
    destList = dest.node.children;
  }

  const index = Math.max(0, Math.min(adjustedIndex, destList.length));
  destList.splice(index, 0, removed);
  return { ok: true, nodes: copy };
}

export function canDropOnTree(
  nodes: TreeNode[],
  dragId: string,
  overId: string,
  mode: TreeDropMode,
): boolean {
  if (dragId === overId && mode !== "inside") return false;
  const target = resolveDropTarget(nodes, overId, mode);
  if (!target) return false;
  const result = moveNodeInTree(nodes, dragId, target);
  return result.ok;
}
