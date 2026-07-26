import type { Editor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const FONT_FAMILIES = [
  { labelKey: "editor.fontDefault", value: "" },
  { label: "微軟正黑體", value: "Microsoft JhengHei UI" },
  { label: "微軟雅黑", value: "Microsoft YaHei" },
  { label: "新細明體", value: "PMingLiU" },
  { label: "細明體", value: "MingLiU" },
  { label: "標楷體", value: "DFKai-SB" },
  { label: "楷體", value: "KaiTi" },
  { label: "仿宋", value: "FangSong" },
  { label: "宋體", value: "SimSun" },
  { label: "黑體", value: "SimHei" },
  { label: "Segoe UI", value: "Segoe UI" },
  { label: "Calibri", value: "Calibri" },
  { label: "Arial", value: "Arial" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Georgia", value: "Georgia" },
  { label: "Cambria", value: "Cambria" },
  { label: "Garamond", value: "Garamond" },
  { label: "Palatino Linotype", value: "Palatino Linotype" },
  { label: "Verdana", value: "Verdana" },
  { label: "Tahoma", value: "Tahoma" },
  { label: "Courier New", value: "Courier New" },
];

const FONT_SIZE_VALUES = ["", "12px", "14px", "16px", "17px", "18px", "20px", "24px", "28px", "32px", "36px"];

const COLORS = ["#2a2a2a", "#1f3d2d", "#8b2500", "#1a4d8c", "#5c3d7a", "#b8860b"];

interface EditorToolbarProps {
  editor: Editor;
  onInsertImage: () => void;
}

export function EditorToolbar({ editor, onInsertImage }: EditorToolbarProps) {
  const { t } = useTranslation();
  const [, setRefresh] = useState(0);

  useEffect(() => {
    const bump = () => setRefresh((n) => n + 1);
    editor.on("selectionUpdate", bump);
    editor.on("transaction", bump);
    return () => {
      editor.off("selectionUpdate", bump);
      editor.off("transaction", bump);
    };
  }, [editor]);

  const textStyle = editor.getAttributes("textStyle");
  const currentFontSize = (textStyle.fontSize as string | undefined) ?? "";

  const fontOptions = useMemo(
    () =>
      FONT_FAMILIES.map((f) => ({
        value: f.value,
        label: "labelKey" in f && f.labelKey ? t(f.labelKey) : f.label!,
      })),
    [t],
  );

  return (
    <div className="editor-toolbar">
      <button
        type="button"
        className={editor.isActive("bold") ? "active" : ""}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title={t("editor.bold")}
      >
        B
      </button>
      <button
        type="button"
        className={editor.isActive("italic") ? "active" : ""}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t("editor.italic")}
      >
        I
      </button>
      <button
        type="button"
        className={editor.isActive("underline") ? "active" : ""}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title={t("editor.underline")}
      >
        U
      </button>
      <span className="toolbar-sep" />
      <select
        value={editor.getAttributes("textStyle").fontFamily ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        title={t("editor.fontFamily")}
      >
        {fontOptions.map((f) => (
          <option key={f.label + f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        value={currentFontSize}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontSize(v).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
        title={t("editor.fontSize")}
      >
        {FONT_SIZE_VALUES.map((value) => (
          <option key={value || "default"} value={value}>
            {!value ? t("editor.fontSize") : value.replace("px", "") + "px"}
          </option>
        ))}
      </select>
      <span className="toolbar-sep" />
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="color-swatch"
          style={{ backgroundColor: c }}
          title={t("editor.textColor", { color: c })}
          onClick={() => editor.chain().focus().setColor(c).run()}
        />
      ))}
      <span className="toolbar-sep" />
      <button type="button" onClick={() => onInsertImage()} title={t("editor.insertImage")}>
        {t("editor.insertImage")}
      </button>
    </div>
  );
}
