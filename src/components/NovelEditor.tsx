import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FloatingImage, loadImageNaturalSize, scaleToDefaultWidth } from "../extensions/FloatingImage";
import { importImageToProject, isImagePath, stripDocToRelativeAssets } from "../lib/project";
import { EditorToolbar } from "./EditorToolbar";

export interface NovelEditorProps {
  projectFile: string | null;
  nodeId: string | null;
  initialDoc: object | null;
  onDocChange: (doc: object) => void;
  insertImageRequest: number;
  onInsertImageHandled: () => void;
  onInsertImageClick: () => void;
  metaBar?: React.ReactNode;
}

export function NovelEditor({
  projectFile,
  nodeId,
  initialDoc,
  onDocChange,
  insertImageRequest,
  onInsertImageHandled,
  onInsertImageClick,
  metaBar,
}: NovelEditorProps) {
  const { t, i18n } = useTranslation();
  const loadedFor = useRef<string | null>(null);
  const projectFileRef = useRef(projectFile);
  projectFileRef.current = projectFile;
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const insertFromFile = useCallback(async (file: File, editor: NonNullable<ReturnType<typeof useEditor>>) => {
    const pf = projectFileRef.current;
    if (!pf) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { rel, displaySrc } = await importImageToProject(pf, file.name, bytes);
    const { w, h } = await loadImageNaturalSize(displaySrc);
    const { width, height } = scaleToDefaultWidth(w, h);
    const scrollEl = editor.view.dom.closest(".editor-scroll") as HTMLElement | null;
    const y = scrollEl ? scrollEl.scrollTop + 72 : 72;
    editor
      .chain()
      .focus()
      .insertFloatingImage({ src: rel, x: 72, y, width, height })
      .run();
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Placeholder.configure({ placeholder: t("editor.placeholder") }),
      FloatingImage,
    ],
    content: initialDoc ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "tiptap-surface" },
      handleDrop(_view, event) {
        const pf = projectFileRef.current;
        if (!pf) return false;
        const file = event.dataTransfer?.files?.[0];
        if (!file || !isImagePath(file.name)) return false;
        event.preventDefault();
        const ed = editorRef.current;
        if (ed) void insertFromFile(file, ed);
        return true;
      },
      handlePaste(_view, event) {
        const pf = projectFileRef.current;
        if (!pf) return false;
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            const ed = editorRef.current;
            if (ed) void insertFromFile(file, ed);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onDocChange(stripDocToRelativeAssets(ed.getJSON()));
    },
  }, [i18n.language, t]);

  editorRef.current = editor;

  useEffect(() => {
    if (!editor || !nodeId || !initialDoc) return;
    if (loadedFor.current === nodeId) return;
    loadedFor.current = nodeId;
    const doc = initialDoc;
    editor.commands.setContent(doc, { emitUpdate: false });
  }, [editor, nodeId, initialDoc, projectFile]);

  useEffect(() => {
    loadedFor.current = null;
  }, [nodeId]);

  const lastInsertImageRequest = useRef(0);

  useEffect(() => {
    if (!editor || !projectFile || insertImageRequest === 0) return;
    if (insertImageRequest <= lastInsertImageRequest.current) return;
    lastInsertImageRequest.current = insertImageRequest;
    onInsertImageHandled();

    void (async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: false,
        filters: [{ name: t("editor.imageFilter"), extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"] }],
      });
      if (typeof picked === "string") {
        const { rel, displaySrc } = await importImageToProject(projectFile, picked);
        const { w, h } = await loadImageNaturalSize(displaySrc);
        const { width, height } = scaleToDefaultWidth(w, h);
        editor.chain().focus().insertFloatingImage({ src: rel, x: 72, y: 72, width, height }).run();
      }
    })();
  }, [insertImageRequest, editor, projectFile, onInsertImageHandled, t]);

  if (!editor) return null;

  return (
    <div className="novel-editor">
      <EditorToolbar editor={editor} onInsertImage={onInsertImageClick} />
      {metaBar}
      <div className="editor-scroll">
        <div className="editor-canvas">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
