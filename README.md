# 公式轉換器 Formula Converter

一款輕量的 LaTeX 公式轉換工具，支援即時預覽與一鍵複製為多種格式，適合搭配 Word、PowerPoint、Notion 等軟體使用。

**線上使用：** https://zeroonethree013.github.io/formula-converter/

---

## 功能

### 輸入

- 支援直接輸入 LaTeX 語法
- 自動偵測並剝除常見分隔符，無需手動清除

| 輸入格式 | 自動處理 |
|----------|----------|
| `$formula$` | 剝除 `$`，切換為行內模式 |
| `$$formula$$` | 剝除 `$$`，切換為展示模式 |
| `\(formula\)` | 剝除 `\(...\)`，切換為行內模式 |
| `\[formula\]` | 剝除 `\[...\]`，切換為展示模式 |

### 預覽

- 基於 [KaTeX](https://katex.org/) 即時渲染
- 語法錯誤時即時顯示提示

### 複製格式

| 格式 | 說明 | 適用場景 |
|------|------|----------|
| **LaTeX（含符號）** | `$formula$` 或 `$$formula$$` | 一般 LaTeX 文件 |
| **LaTeX（無符號）** | 純 LaTeX 原始碼 | 自訂分隔符的編輯器 |
| **Notion 格式** | `$$formula$$` | Notion 數學區塊 |
| **MathML（Word）** | 帶 `mml:` 命名空間的 MathML | Word 方程式（需選「只保留文字」貼上） |
| **圖片（PNG）** | 白底黑字高解析度截圖 | PowerPoint、任何支援貼上圖片的軟體 |

### 其他

- 10 個內建範例公式（分數、積分、矩陣等），點擊即填入
- 行內 / 展示模式一鍵切換

---

## 使用說明

### Word 貼上公式

複製 **MathML（Word）** 後，在 Word 中：
1. 右鍵 → 選擇「**只保留文字**」貼上
2. 即可顯示為可編輯的 Word 方程式

### PowerPoint 貼上公式

複製 **圖片（PNG）** 後，直接 `Ctrl + V` 貼入 PPT，公式以白底黑字圖片呈現。

---

## 本地開發

無需安裝任何依賴，直接用瀏覽器開啟 `index.html` 即可。

```bash
git clone https://github.com/ZeroOneThree013/formula-converter.git
cd formula-converter
# 用瀏覽器開啟 index.html
```

外部依賴（CDN 載入）：
- [KaTeX 0.16.11](https://katex.org/) — LaTeX 渲染
- [html2canvas 1.4.1](https://html2canvas.hertzen.com/) — 公式截圖

---

## 技術架構

```
formula-converter/
├── index.html   # 頁面結構
├── style.css    # 深色主題樣式
└── script.js    # 核心邏輯（渲染、格式轉換、複製）
```

純前端，無後端、無框架、無建置步驟。

---

## License

MIT
