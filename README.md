# NovelEditConsoleT

## 功能
簡單易用專注在寫作的小說編輯軟體。

特色：
一目瞭然的雙區編輯頁面，沒有過多的複雜功能。

左側是多層次的章節樹，可自由建立資料夾節點與文字節點，並可自由拖動層級。
多元且自由的章節樹可快速方便的管理設定資料集與故事章節。

右側是自由的文字編輯介面，包含常見的文字編輯功能。

支援圖片的插入，圖片位置可自由拖動，所見即見得。

即時的自動儲存功能，能抓住你的每一個小動作，隨開即寫，隨關即存，隨時都能開始你的奇幻之旅。

方便的匯出功能，支援單檔匯出，也支援同節點的多檔同時匯出。匯出格式包含PDF,WORD,HTML。

支援多國語系。

## 使用方式
點擊start.bat或是NovelEditConsole.exe即可開啟軟體。


--
以下為進階使用者提示：
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
