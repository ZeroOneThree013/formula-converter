/* ===== 範例公式 ===== */
const EXAMPLES = [
  { label: '分數', latex: '\\frac{a}{b}' },
  { label: '根號', latex: '\\sqrt{x^2 + y^2}' },
  { label: '積分', latex: '\\int_0^\\infty e^{-x^2}\\,dx' },
  { label: '極限', latex: '\\lim_{n \\to \\infty} \\left(1+\\frac{1}{n}\\right)^n' },
  { label: '矩陣', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: '求和', latex: '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}' },
  { label: '偏微分', latex: '\\frac{\\partial f}{\\partial x}' },
  { label: '歐拉公式', latex: 'e^{i\\pi} + 1 = 0' },
  { label: '畢氏定理', latex: 'a^2 + b^2 = c^2' },
  { label: '二次公式', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
];

/* ===== 狀態 ===== */
let currentMode = 'inline'; // 'inline' | 'display'
let toastTimer = null;

/* ===== DOM 元素 ===== */
const inputEl    = document.getElementById('latex-input');
const previewBox = document.getElementById('preview-box');
const charCount  = document.getElementById('char-count');
const clearBtn   = document.getElementById('clear-btn');
const toastEl    = document.getElementById('toast');
const examplesGrid = document.getElementById('examples-grid');

const previewEls = {
  latex:      document.getElementById('preview-latex'),
  'no-dollar': document.getElementById('preview-nodollar'),
  notion:     document.getElementById('preview-notion'),
  mathml:     document.getElementById('preview-mathml'),
};

const canvasEl          = document.getElementById('formula-canvas');
const imagePlaceholder  = document.getElementById('image-placeholder');

/* ===== 公式格式化 ===== */
function formatLatex(raw, mode) {
  return mode === 'display' ? `$$${raw}$$` : `$${raw}$`;
}

function formatNotion(raw) {
  return `$$${raw}$$`;
}

/**
 * 將 LaTeX 轉換為 MathML（Word 格式）
 * 使用 KaTeX 內建的 MathML 輸出，再加上 Word 所需的 mml: 命名空間前綴
 */
function latexToWordMathML(raw, isDisplay) {
  const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

  // 用 KaTeX 產生 MathML 字串
  let mathmlString;
  try {
    mathmlString = katex.renderToString(raw, {
      displayMode: isDisplay,
      output: 'mathml',
      throwOnError: true,
    });
  } catch {
    return null;
  }

  // KaTeX 輸出的是完整 HTML，取出其中的 <math> 元素
  const temp = document.createElement('div');
  temp.innerHTML = mathmlString;
  const mathEl = temp.querySelector('math');
  if (!mathEl) return null;

  // 確保有 MathML 命名空間
  if (!mathEl.hasAttribute('xmlns')) {
    mathEl.setAttribute('xmlns', MATHML_NS);
  }

  // 移除 class / style 屬性（Word 不需要）
  stripPresentationAttrs(mathEl);

  // 移除 <annotation> / <annotation-xml>（含原始 LaTeX 文字，PPT 會把它當純文字顯示）
  for (const el of Array.from(mathEl.querySelectorAll('annotation, annotation-xml'))) {
    el.parentNode?.removeChild(el);
  }

  // 解開 <semantics>：只保留第一個子元素（Presentation MathML），移除語意包裝
  for (const sem of Array.from(mathEl.querySelectorAll('semantics'))) {
    const presentation = sem.firstElementChild;
    if (presentation) {
      sem.replaceWith(presentation);
    }
  }

  // 加上 mml: 前綴（Word 的 OMML 相容格式）
  const output = document.implementation.createDocument(MATHML_NS, 'mml:math', null);
  const outputRoot = output.documentElement;

  for (const attr of Array.from(mathEl.attributes)) {
    if (!attr.name.startsWith('xmlns')) {
      outputRoot.setAttribute(attr.name, attr.value);
    }
  }

  for (const child of Array.from(mathEl.childNodes)) {
    outputRoot.appendChild(cloneWithPrefix(output, child, MATHML_NS));
  }

  return new XMLSerializer().serializeToString(outputRoot);
}

function stripPresentationAttrs(root) {
  root.removeAttribute('class');
  root.removeAttribute('style');
  for (const el of Array.from(root.querySelectorAll('*'))) {
    el.removeAttribute('class');
    el.removeAttribute('style');
  }
}

function cloneWithPrefix(doc, node, ns) {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.nodeValue ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return doc.importNode(node, true);
  }
  const src = node;
  const isMathML = src.namespaceURI === ns || src.namespaceURI === null;
  const qualifiedName = isMathML ? `mml:${src.localName}` : src.tagName;
  const el = isMathML
    ? doc.createElementNS(ns, qualifiedName)
    : doc.createElement(qualifiedName);

  for (const attr of Array.from(src.attributes)) {
    if (!attr.name.startsWith('xmlns')) {
      el.setAttribute(attr.name, attr.value);
    }
  }
  for (const child of Array.from(src.childNodes)) {
    el.appendChild(cloneWithPrefix(doc, child, ns));
  }
  return el;
}

function wrapMathMLForWord(mathml) {
  const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
  return [
    `<html xmlns:mml="${MATHML_NS}">`,
    '<head><meta charset="utf-8"></head>',
    '<body><!--StartFragment-->',
    mathml,
    '<!--EndFragment--></body></html>',
  ].join('');
}

/* ===== 圖片預覽 ===== */
const SCALE = 3; // 3x 解析度，貼入 PPT 清晰

async function updateImagePreview(latex) {
  if (!latex.trim()) {
    canvasEl.classList.remove('visible');
    imagePlaceholder.style.display = '';
    return;
  }

  try {
    await document.fonts.ready;

    const offscreen = await html2canvas(previewBox, {
      backgroundColor: '#ffffff',
      scale: SCALE,
      logging: false,
      useCORS: true,
    });

    // ---- 後處理：將所有非白色像素強制轉為黑色 ----
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width  = offscreen.width;
    tmpCanvas.height = offscreen.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.drawImage(offscreen, 0, 0);
    const imgData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    const px = imgData.data;
    for (let i = 0; i < px.length; i += 4) {
      const brightness = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (brightness < 245) {
        // 非白色 → 黑色
        px[i] = px[i + 1] = px[i + 2] = 0;
      } else {
        // 接近白色 → 純白
        px[i] = px[i + 1] = px[i + 2] = 255;
      }
    }
    tmpCtx.putImageData(imgData, 0, 0);

    // ---- 寫入顯示用 canvas ----
    const dispW = Math.min(tmpCanvas.width / SCALE, 700);
    const dispH = tmpCanvas.height / SCALE;
    canvasEl.width  = tmpCanvas.width;
    canvasEl.height = tmpCanvas.height;
    canvasEl.style.width  = `${dispW}px`;
    canvasEl.style.height = `${dispH}px`;

    canvasEl.getContext('2d').drawImage(tmpCanvas, 0, 0);
    canvasEl.classList.add('visible');
    imagePlaceholder.style.display = 'none';
  } catch (e) {
    canvasEl.classList.remove('visible');
    imagePlaceholder.style.display = '';
  }
}

async function copyAsImage() {
  if (!canvasEl.classList.contains('visible')) return;

  return new Promise((resolve) => {
    canvasEl.toBlob(async (blob) => {
      if (!blob) { resolve(false); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        resolve(true);
      } catch {
        resolve(false);
      }
    }, 'image/png');
  });
}

/* ===== 渲染預覽 ===== */
function render(latex) {
  if (!latex.trim()) {
    previewBox.innerHTML = '<span class="preview-placeholder">輸入公式後顯示預覽</span>';
    previewBox.classList.remove('has-content', 'has-error');
    updateFormatPreviews('');
    updateImagePreview('');
    return;
  }

  try {
    katex.render(latex, previewBox, {
      displayMode: currentMode === 'display',
      throwOnError: true,
    });
    previewBox.classList.add('has-content');
    previewBox.classList.remove('has-error');
    updateFormatPreviews(latex);
    updateImagePreview(latex);
  } catch (err) {
    previewBox.innerHTML = `<span class="preview-error">語法錯誤：${escapeHtml(err.message)}</span>`;
    previewBox.classList.add('has-error');
    previewBox.classList.remove('has-content');
    updateFormatPreviews('');
    updateImagePreview('');
  }
}

function updateFormatPreviews(latex) {
  const isDisplay = currentMode === 'display';
  const isEmpty = !latex.trim();

  const values = {
    latex:        isEmpty ? '—' : formatLatex(latex, currentMode),
    'no-dollar':  isEmpty ? '—' : latex,
    notion:       isEmpty ? '—' : formatNotion(latex),
    mathml:       isEmpty ? '—' : (latexToWordMathML(latex, isDisplay) ?? '（轉換失敗）'),
  };

  for (const [key, val] of Object.entries(values)) {
    const el = previewEls[key];
    el.textContent = val;
    if (isEmpty || val === '—') {
      el.classList.remove('active');
    } else {
      el.classList.add('active');
    }
  }

  // 啟用/停用複製按鈕
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.disabled = isEmpty;
  });
}

/* ===== 複製到剪貼簿 ===== */
async function copyToClipboard(text, html) {
  if (navigator.clipboard?.write && html) {
    try {
      const items = {
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html':  new Blob([html],  { type: 'text/html' }),
      };
      await navigator.clipboard.write([new ClipboardItem(items)]);
      return true;
    } catch {
      // 降級
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 降級
    }
  }

  // 最舊方式
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

async function handleCopy(format) {
  const latex = inputEl.value.trim();
  if (!latex) return;

  const isDisplay = currentMode === 'display';
  let text = '';
  let html = undefined;

  switch (format) {
    case 'latex':
      text = formatLatex(latex, currentMode);
      break;
    case 'no-dollar':
      text = latex;
      break;
    case 'notion':
      text = formatNotion(latex);
      break;
    case 'mathml': {
      const mathml = latexToWordMathML(latex, isDisplay);
      if (!mathml) {
        showToast('MathML 轉換失敗', 'error');
        return;
      }
      text = mathml;
      html = wrapMathMLForWord(mathml);
      break;
    }
    case 'image': {
      const ok = await copyAsImage();
      const card = document.getElementById('copy-image');
      if (ok) {
        card?.classList.add('copied');
        setTimeout(() => card?.classList.remove('copied'), 1200);
        showToast('圖片已複製，可直接貼入 PPT', 'success');
      } else {
        showToast('圖片複製失敗', 'error');
      }
      return;
    }
  }

  const ok = await copyToClipboard(text, html);

  if (ok) {
    const card = document.querySelector(`[data-format="${format}"]`)?.closest('.copy-card');
    if (card) {
      card.classList.add('copied');
      setTimeout(() => card.classList.remove('copied'), 1200);
    }
    const labels = {
      latex:        'LaTeX 已複製',
      'no-dollar':  'LaTeX（無符號）已複製',
      notion:       'Notion 格式已複製',
      mathml:       'MathML 已複製',
    };
    showToast(labels[format], 'success');

    // MathML 複製後彈出提示框
    if (format === 'mathml') {
      showMathMLTip();
    }
  } else {
    showToast('複製失敗，請手動複製', 'error');
  }
}

/* ===== Toast ===== */
function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2000);
}

/* ===== MathML 提示框 ===== */
function showMathMLTip() {
  // 避免重複彈出
  if (document.getElementById('mathml-tip')) return;

  const overlay = document.createElement('div');
  overlay.id = 'mathml-tip';
  overlay.className = 'tip-overlay';
  overlay.innerHTML = `
    <div class="tip-box">
      <div class="tip-title">貼上至 Word 注意事項</div>
      <div class="tip-body">
        請在 Word 中使用<br>
        <strong>Ctrl + Shift + V</strong>（只保留文字）<br>
        或右鍵選擇「<strong>只保留文字</strong>」貼上，<br>
        才能正確顯示為公式。
      </div>
      <button class="tip-close" id="tip-close-btn">知道了</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // 點擊「知道了」或點擊遮罩關閉
  const close = () => overlay.remove();
  document.getElementById('tip-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

/* ===== 工具函式 ===== */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ===== 範例晶片 ===== */
function buildExamples() {
  for (const ex of EXAMPLES) {
    const chip = document.createElement('button');
    chip.className = 'example-chip';
    chip.title = ex.latex;
    chip.textContent = ex.label;
    chip.addEventListener('click', () => {
      inputEl.value = ex.latex;
      inputEl.dispatchEvent(new Event('input'));
      inputEl.focus();
    });
    examplesGrid.appendChild(chip);
  }
}

/* ===== 自動偵測並剝除分隔符 ===== */
/**
 * 偵測輸入是否帶有 LaTeX 分隔符，若有則剝除並回傳偵測到的模式。
 * 支援：$$...$$、$...$、\[...\]、\(...\)
 * @returns {{ latex: string, detectedMode: 'inline'|'display'|null }}
 */
function parseInput(val) {
  const trimmed = val.trim();

  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
    return { latex: trimmed.slice(2, -2).trim(), detectedMode: 'display' };
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return { latex: trimmed.slice(2, -2).trim(), detectedMode: 'display' };
  }
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    return { latex: trimmed.slice(2, -2).trim(), detectedMode: 'inline' };
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
    return { latex: trimmed.slice(1, -1).trim(), detectedMode: 'inline' };
  }

  return { latex: val, detectedMode: null };
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

/* ===== 事件綁定 ===== */
inputEl.addEventListener('input', () => {
  const raw = inputEl.value;
  const { latex, detectedMode } = parseInput(raw);

  // 若偵測到分隔符：剝除並自動切換模式
  if (detectedMode !== null) {
    // 更新 textarea（游標會移到尾端，但對貼上場景是合理的）
    const cursorWasAtEnd = inputEl.selectionStart === raw.length;
    inputEl.value = latex;
    if (cursorWasAtEnd) {
      inputEl.selectionStart = inputEl.selectionEnd = latex.length;
    }
    if (detectedMode !== currentMode) {
      setMode(detectedMode);
      const modeLabel = detectedMode === 'display' ? '展示' : '行內';
      showToast(`已移除 $ 分隔符，切換為${modeLabel}模式`, 'success');
    } else {
      showToast('已自動移除 $ 分隔符', 'success');
    }
  }

  const finalVal = detectedMode !== null ? latex : raw;
  charCount.textContent = `${finalVal.length} 字元`;
  render(finalVal);
});

clearBtn.addEventListener('click', () => {
  inputEl.value = '';
  inputEl.dispatchEvent(new Event('input'));
  inputEl.focus();
});

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setMode(btn.dataset.mode);
    render(inputEl.value);
  });
});

document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    handleCopy(btn.dataset.format);
  });
  btn.disabled = true;
});

/* ===== 初始化 ===== */
buildExamples();
