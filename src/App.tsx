import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ChapterTree } from "./components/ChapterTree";
import { NovelEditor } from "./components/NovelEditor";
import { setAppLanguage } from "./i18n";
import { APP_LANGUAGES, isAppLanguage, normalizeAppLanguage, type AppLanguageCode } from "./lib/languages";
import { contentFilePath, getDefaultAutosaveDir, getDefaultAutosaveProjectPath, mkdirp, removePath } from "./lib/paths";
import { copyProjectSidecars } from "./lib/pathsExtra";
import {
  countCharactersInDoc,
  ensureStatsForFileIds,
  loadChapterStats,
  removeStatsForIds,
  saveChapterStats,
  type ChapterStatsStore,
} from "./lib/chapterStats";
import { ChapterMetaBar } from "./components/ChapterMetaBar";
import {
  cleanupOrphanChapters,
  loadChapterDoc,
  saveChapterDoc,
  saveProjectMeta,
} from "./lib/project";
import type { ProjectMeta, TreeNode } from "./lib/types";
import {
  collectChapterNodesUnder,
  collectFileIds,
  collectFileIdsInSubtree,
  findNode,
  pickSelectionAfterDelete,
  removeNodeFromTree,
} from "./lib/types";
import {
  emptyProjectMeta,
  findReadableAutosaveProject,
  loadSessionPrefs,
  saveSessionPrefs,
  tryReadProjectMeta,
} from "./lib/sessionPrefs";
import { exportChapters, type ExportFormat } from "./lib/export";
import { ProjectFileContext } from "./lib/ProjectFileContext";
import "./App.css";

const CONTENT_DEBOUNCE_MS = 1200;
const STRUCTURE_DEBOUNCE_MS = 400;
const SESSION_DEBOUNCE_MS = 300;

function App() {
  const { t, i18n } = useTranslation();
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chapterDoc, setChapterDoc] = useState<object | null>(null);
  const [loadedChapterId, setLoadedChapterId] = useState<string | null>(null);
  const [status, setStatus] = useState(() => t("app.ready"));
  const [insertImageRequest, setInsertImageRequest] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [metaTick, setMetaTick] = useState(0);

  const pendingDoc = useRef<object | null>(null);
  const metaRef = useRef<ProjectMeta | null>(null);
  metaRef.current = meta;
  const projectFileRef = useRef<string | null>(null);
  projectFileRef.current = projectFile;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const chapterStatsRef = useRef<ChapterStatsStore>({});
  const editSessionRef = useRef<{ chapterId: string; startedAt: number } | null>(null);
  const dirtyStats = useRef(false);
  const dirtyContent = useRef(false);
  const dirtyStructure = useRef(false);
  const contentTimer = useRef<number | null>(null);
  const structureTimer = useRef<number | null>(null);
  const sessionTimer = useRef<number | null>(null);

  const persistSession = useCallback(async (path: string | null, selected: string | null) => {
    await saveSessionPrefs({
      lastProjectPath: path,
      lastSelectedId: selected,
    });
  }, []);

  const schedulePersistSession = useCallback(() => {
    if (sessionTimer.current) window.clearTimeout(sessionTimer.current);
    sessionTimer.current = window.setTimeout(() => {
      void persistSession(projectFileRef.current, selectedIdRef.current);
    }, SESSION_DEBOUNCE_MS);
  }, [persistSession]);

  /** 空白工作區首次編輯／儲存時綁定到程式目錄預設存檔 */
  const ensureProjectFile = useCallback(async (): Promise<string> => {
    if (projectFileRef.current) return projectFileRef.current;
    await mkdirp(await getDefaultAutosaveDir());
    const path = await getDefaultAutosaveProjectPath();
    projectFileRef.current = path;
    setProjectFile(path);
    await persistSession(path, selectedIdRef.current);
    return path;
  }, [persistSession]);

  const commitEditSession = useCallback((chapterId?: string | null) => {
    const session = editSessionRef.current;
    if (!session) return;
    if (chapterId != null && session.chapterId !== chapterId) return;

    const store = chapterStatsRef.current;
    let entry = store[session.chapterId];
    if (!entry) {
      ensureStatsForFileIds(store, [session.chapterId]);
      entry = store[session.chapterId];
    }
    if (entry) {
      entry.editTimeMs += Math.max(0, Date.now() - session.startedAt);
      dirtyStats.current = true;
    }
    session.startedAt = Date.now();
  }, []);

  const startEditSession = useCallback((chapterId: string) => {
    ensureStatsForFileIds(chapterStatsRef.current, [chapterId]);
    editSessionRef.current = { chapterId, startedAt: Date.now() };
  }, []);

  const flushSave = useCallback(async () => {
    const currentMeta = metaRef.current;
    if (!currentMeta) return;
    const path = await ensureProjectFile();
    if (dirtyStructure.current) {
      await saveProjectMeta(path, currentMeta);
      await cleanupOrphanChapters(path, currentMeta.nodes);
      dirtyStructure.current = false;
    }
    if (dirtyContent.current && selectedIdRef.current && pendingDoc.current) {
      const found = findNode(currentMeta.nodes, selectedIdRef.current);
      if (found?.node.type === "file") {
        commitEditSession(selectedIdRef.current);
        const entry = chapterStatsRef.current[selectedIdRef.current];
        if (entry) {
          entry.updatedAt = new Date().toISOString();
          dirtyStats.current = true;
        }
        await saveChapterDoc(path, selectedIdRef.current, pendingDoc.current);
      }
      dirtyContent.current = false;
    }
    if (dirtyStats.current) {
      await saveChapterStats(path, chapterStatsRef.current);
      dirtyStats.current = false;
    }
    setStatus(t("app.autosaved"));
  }, [t, commitEditSession, ensureProjectFile]);

  const scheduleContentSave = useCallback(() => {
    dirtyContent.current = true;
    if (contentTimer.current) window.clearTimeout(contentTimer.current);
    contentTimer.current = window.setTimeout(() => void flushSave(), CONTENT_DEBOUNCE_MS);
  }, [flushSave]);

  const scheduleStructureSave = useCallback(() => {
    dirtyStructure.current = true;
    if (structureTimer.current) window.clearTimeout(structureTimer.current);
    structureTimer.current = window.setTimeout(() => void flushSave(), STRUCTURE_DEBOUNCE_MS);
  }, [flushSave]);

  const cancelPendingSaveTimers = useCallback(() => {
    if (contentTimer.current) {
      window.clearTimeout(contentTimer.current);
      contentTimer.current = null;
    }
    if (structureTimer.current) {
      window.clearTimeout(structureTimer.current);
      structureTimer.current = null;
    }
  }, []);

  const handleLanguageChange = useCallback(
    async (lng: AppLanguageCode) => {
      const currentLng = normalizeAppLanguage(i18n.language);
      if (lng === currentLng) return;

      cancelPendingSaveTimers();
      dirtyStructure.current = true;
      await flushSave();

      if (pendingDoc.current && loadedChapterId === selectedId) {
        setChapterDoc(pendingDoc.current);
      }

      setAppLanguage(lng);
    },
    [i18n.language, cancelPendingSaveTimers, flushSave, loadedChapterId, selectedId],
  );

  const applyLoadedProject = useCallback(
    async (
      path: string,
      loaded: ProjectMeta,
      preferredSelectedId: string | null,
      statusKey: "opened" | "restoredLast" | "fallbackAutosave",
    ) => {
      chapterStatsRef.current = await loadChapterStats(path);
      if (ensureStatsForFileIds(chapterStatsRef.current, collectFileIds(loaded.nodes))) {
        dirtyStats.current = true;
        await saveChapterStats(path, chapterStatsRef.current);
        dirtyStats.current = false;
      }
      projectFileRef.current = path;
      setProjectFile(path);
      setMeta(loaded);
      metaRef.current = loaded;

      const fileIds = collectFileIds(loaded.nodes);
      const nextSelected =
        preferredSelectedId && findNode(loaded.nodes, preferredSelectedId)
          ? preferredSelectedId
          : (fileIds.values().next().value ?? null);
      setSelectedId(nextSelected);
      selectedIdRef.current = nextSelected;
      setLoadedChapterId(null);
      setChapterDoc(null);
      setWordCount(0);
      await persistSession(path, nextSelected);
      const name = path.split(/[/\\]/).pop() ?? "";
      if (statusKey === "fallbackAutosave") setStatus(t("app.fallbackAutosave", { name }));
      else if (statusKey === "restoredLast") setStatus(t("app.restoredLast", { name }));
      else setStatus(t("app.opened", { name }));
    },
    [persistSession, t],
  );

  const enterBlankWorkspace = useCallback(async () => {
    editSessionRef.current = null;
    chapterStatsRef.current = {};
    projectFileRef.current = null;
    setProjectFile(null);
    const blank = emptyProjectMeta();
    setMeta(blank);
    metaRef.current = blank;
    setSelectedId(null);
    selectedIdRef.current = null;
    setLoadedChapterId(null);
    setChapterDoc(null);
    setWordCount(0);
    dirtyContent.current = false;
    dirtyStructure.current = false;
    dirtyStats.current = false;
    await persistSession(null, null);
    setStatus(t("app.blankWorkspace"));
  }, [persistSession, t]);

  const openProjectAt = useCallback(async (path: string) => {
    if (projectFileRef.current && metaRef.current) {
      await flushSave();
    }
    editSessionRef.current = null;
    const loaded = await tryReadProjectMeta(path);
    if (!loaded) {
      setStatus(t("app.openFailed", { name: path.split(/[/\\]/).pop() ?? "" }));
      return;
    }
    await applyLoadedProject(path, loaded, null, "opened");
  }, [flushSave, t, applyLoadedProject]);

  const bootstrapWorkspace = useCallback(async () => {
    await mkdirp(await getDefaultAutosaveDir());
    const prefs = await loadSessionPrefs();

    if (prefs.lastProjectPath) {
      const loaded = await tryReadProjectMeta(prefs.lastProjectPath);
      if (loaded) {
        await applyLoadedProject(prefs.lastProjectPath, loaded, prefs.lastSelectedId, "restoredLast");
        return;
      }
    }

    const fallback = await findReadableAutosaveProject();
    if (fallback) {
      await applyLoadedProject(fallback.path, fallback.meta, prefs.lastSelectedId, "fallbackAutosave");
      return;
    }

    await enterBlankWorkspace();
  }, [applyLoadedProject, enterBlankWorkspace]);

  useEffect(() => {
    void bootstrapWorkspace();
    return () => {
      if (contentTimer.current) window.clearTimeout(contentTimer.current);
      if (structureTimer.current) window.clearTimeout(structureTimer.current);
      if (sessionTimer.current) window.clearTimeout(sessionTimer.current);
    };
    // 僅啟動時載入；切換語系會改 t，不可因此重載專案
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    schedulePersistSession();
  }, [projectFile, selectedId, schedulePersistSession]);

  useEffect(() => {
    if (!selectedId || !meta) {
      commitEditSession();
      editSessionRef.current = null;
      return;
    }
    const node = findNode(meta.nodes, selectedId);
    if (!node || node.node.type !== "file") {
      commitEditSession();
      editSessionRef.current = null;
      setChapterDoc(null);
      setLoadedChapterId(null);
      setWordCount(0);
      return;
    }
    if (loadedChapterId === selectedId && projectFile) return;

    void (async () => {
      const path = await ensureProjectFile();
      const previousId = loadedChapterId;
      commitEditSession(previousId ?? undefined);
      if (dirtyContent.current && previousId && pendingDoc.current) {
        const prevEntry = chapterStatsRef.current[previousId];
        if (prevEntry) {
          prevEntry.updatedAt = new Date().toISOString();
          dirtyStats.current = true;
        }
        await saveChapterDoc(path, previousId, pendingDoc.current);
        dirtyContent.current = false;
      }
      if (dirtyStats.current) {
        await saveChapterStats(path, chapterStatsRef.current);
        dirtyStats.current = false;
      }

      const doc = await loadChapterDoc(path, selectedId);
      pendingDoc.current = doc;
      setChapterDoc(doc);
      setWordCount(countCharactersInDoc(doc));
      setLoadedChapterId(selectedId);
      startEditSession(selectedId);
    })();
  }, [
    projectFile,
    selectedId,
    meta,
    loadedChapterId,
    commitEditSession,
    startEditSession,
    ensureProjectFile,
  ]);

  useEffect(() => {
    if (!selectedId || !meta) return;
    const node = findNode(meta.nodes, selectedId);
    if (!node || node.node.type !== "file") return;
    const timer = window.setInterval(() => setMetaTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [selectedId, meta]);

  const onNodesChange = (nodes: TreeNode[]) => {
    if (ensureStatsForFileIds(chapterStatsRef.current, collectFileIds(nodes))) {
      dirtyStats.current = true;
    }
    setMeta((prev) => {
      const base = prev ?? emptyProjectMeta();
      const next = { ...base, nodes };
      metaRef.current = next;
      return next;
    });
    dirtyStructure.current = true;
    void (async () => {
      await ensureProjectFile();
      scheduleStructureSave();
    })();
  };

  const deleteTreeNode = useCallback(
    async (id: string) => {
      if (!meta) return;
      const found = findNode(meta.nodes, id);
      if (!found) return;

      const path = await ensureProjectFile();
      const fileIds = collectFileIdsInSubtree(found.node);
      const nextNodes = removeNodeFromTree(meta.nodes, id);
      if (!nextNodes) return;

      for (const fileId of fileIds) {
        try {
          await removePath(contentFilePath(path, fileId));
        } catch {
          /* 檔案可能已不存在 */
        }
      }
      removeStatsForIds(chapterStatsRef.current, fileIds);
      dirtyStats.current = true;

      const nextSelected = pickSelectionAfterDelete(meta.nodes, id, nextNodes);
      setMeta((prev) => {
        if (!prev) return prev;
        const next = { ...prev, nodes: nextNodes };
        metaRef.current = next;
        return next;
      });
      dirtyStructure.current = true;
      void flushSave();

      if (fileIds.includes(loadedChapterId ?? "")) {
        commitEditSession(loadedChapterId);
        editSessionRef.current = null;
        setChapterDoc(null);
        setLoadedChapterId(null);
        pendingDoc.current = null;
        dirtyContent.current = false;
        setWordCount(0);
      }

      setSelectedId(nextSelected);
      setStatus(t("app.deleted", { name: found.node.name }));
    },
    [meta, loadedChapterId, flushSave, commitEditSession, ensureProjectFile, t],
  );

  const handleExportNode = useCallback(
    async (nodeId: string, format: ExportFormat) => {
      if (!meta) return;
      const path = await ensureProjectFile();
      await flushSave();
      const chapters = collectChapterNodesUnder(meta.nodes, nodeId);
      if (chapters.length === 0) {
        setStatus(t("export.empty"));
        return;
      }
      try {
        const ok = await exportChapters(path, chapters, format);
        if (ok) setStatus(t("export.done"));
      } catch {
        setStatus(t("export.failed"));
      }
    },
    [meta, flushSave, ensureProjectFile, t],
  );

  const handleOpen = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: t("dialog.projectFilter"), extensions: ["json"] }],
    });
    if (typeof picked === "string") await openProjectAt(picked);
  };

  const handleSaveAs = async () => {
    if (!meta) return;
    await flushSave();
    const sourcePath = await ensureProjectFile();
    const picked = await save({
      filters: [{ name: t("dialog.projectFilter"), extensions: ["json"] }],
      defaultPath: "my-novel.novelproj.json",
    });
    if (!picked) return;
    let path = picked;
    if (!path.endsWith(".novelproj.json")) path += ".novelproj.json";
    await saveProjectMeta(path, meta);
    await copyProjectSidecars(sourcePath, path);
    projectFileRef.current = path;
    setProjectFile(path);
    await persistSession(path, selectedIdRef.current);
    setStatus(t("app.savedAs", { name: path.split(/[/\\]/).pop() ?? "" }));
  };

  const handleSave = async () => {
    await flushSave();
    setStatus(t("app.saved"));
  };

  const handleInsertImageClick = useCallback(() => {
    setInsertImageRequest((n) => n + 1);
  }, []);

  const handleInsertImageHandled = useCallback(() => {
    setInsertImageRequest(0);
  }, []);

  const selectedIsFile =
    selectedId && meta ? findNode(meta.nodes, selectedId)?.node.type === "file" : false;

  const currentChapterStats = selectedId ? chapterStatsRef.current[selectedId] ?? null : null;
  const liveEditTimeMs =
    currentChapterStats && editSessionRef.current?.chapterId === selectedId
      ? currentChapterStats.editTimeMs + (Date.now() - editSessionRef.current.startedAt)
      : (currentChapterStats?.editTimeMs ?? 0);
  void metaTick;

  return (
    <div className="app-root">
      <header className="app-header">
        <span className="app-title">{t("app.title")}</span>
        <div className="app-menu">
          <button type="button" onClick={() => void handleOpen()}>
            {t("app.open")}
          </button>
          <button type="button" onClick={() => void handleSave()}>
            {t("app.save")}
          </button>
          <button type="button" onClick={() => void handleSaveAs()}>
            {t("app.saveAs")}
          </button>
        </div>
        <label className="lang-switch">
          <span className="lang-switch-label">{t("app.language")}</span>
          <select
            value={normalizeAppLanguage(i18n.language)}
            onChange={(e) => {
              const v = e.target.value;
              if (isAppLanguage(v)) void handleLanguageChange(v);
            }}
          >
            {APP_LANGUAGES.map(({ code, labelKey }) => (
              <option key={code} value={code}>
                {t(labelKey)}
              </option>
            ))}
          </select>
        </label>
        <span className="app-status">{status}</span>
      </header>
      <div className="app-main">
        <aside className="sidebar">
          {meta && (
            <ChapterTree
              nodes={meta.nodes}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              onChange={onNodesChange}
              onDeleteNode={(id) => void deleteTreeNode(id)}
              onExportNode={(id, format) => void handleExportNode(id, format)}
            />
          )}
        </aside>
        <main className="editor-pane">
          {projectFile && selectedIsFile && chapterDoc && loadedChapterId === selectedId ? (
            <ProjectFileContext.Provider value={projectFile}>
              <NovelEditor
                key={i18n.language}
                projectFile={projectFile}
                nodeId={selectedId}
                initialDoc={chapterDoc}
                onDocChange={(doc) => {
                  pendingDoc.current = doc;
                  setWordCount(countCharactersInDoc(doc));
                  scheduleContentSave();
                }}
                metaBar={
                  <ChapterMetaBar
                    stats={currentChapterStats}
                    liveEditTimeMs={liveEditTimeMs}
                    wordCount={wordCount}
                  />
                }
                insertImageRequest={insertImageRequest}
                onInsertImageHandled={handleInsertImageHandled}
                onInsertImageClick={handleInsertImageClick}
              />
            </ProjectFileContext.Provider>
          ) : (
            <div className="editor-empty">{t("editor.emptyHint")}</div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
