# NovelEditConsoleT

Tauri 2 + React + TypeScript + TipTap 小說編輯器（全新 v3 專案格式）。

## 功能

- 左側多層章節樹（資料夾 / 檔案）
- 右側 TipTap 富文字（粗斜體、底線、字體、顏色）
- **浮動圖片**：插入、拖曳移動、右下角縮放；支援貼上與拖放
- 自動儲存（結構 0.4s、內容 1.2s 防抖）
- 開啟 / 儲存 / 另存 `.novelproj.json`

## 專案格式 (v3)

```
my-novel.novelproj.json          # 目錄結構
my-novel.novelproj.content/      # 各章 TipTap JSON
my-novel.novelproj.assets/images/ # 圖片檔
```

## 開發

```bash
cd "E:\AI TEST\NovelEditConsoleT"
npm install
npm run tauri dev
```

## 打包 exe

```bash
npm run tauri build
```

產物：`src-tauri/target/release/` 下的安裝包或 exe。

## 需求

- Node.js 18+
- Rust（[rustup](https://rustup.rs/)）
- Windows：WebView2（Win10/11 通常已內建）
