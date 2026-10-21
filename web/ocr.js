/* ============================================================
 * OCR 模块：截图 → 用户框选 → Tesseract.js 识别数字 → 填入表单
 * 依赖：Tesseract.js v5（index.html 中通过 CDN 引入）
 * 导出：window.OCRUI = { open, close }
 *
 * 单位：识别原值为「个位」，强制 ÷10000 换算成「万」。
 *       结果表同时显示「原值」和「换算值」，方便核对漏位。
 *
 * 选区交互：
 *   - 空白处拖拽          → 新增选区
 *   - 单击已有选区        → 选中（高亮）
 *   - 拖拽选中选区内部    → 移动位置
 *   - 拖拽 8 个控制点     → 调整大小
 *   - 选中状态按 Delete   → 删除该选区
 *   - 选中状态按 Esc      → 取消选中
 *   - 点击空白处          → 取消选中
 * ============================================================ */
window.OCRUI = (function () {
    // ---- Tesseract 状态 ----
    let worker = null;
    let workerInitPromise = null;

    // ---- 图片 / 选区状态 ----
    let currentImg = null;
    let selections = [];
    let isDrawing = false;
    let dragStart = null;
    let dragCurrent = null;

    // ---- 选中 / 编辑状态 ----
    let selectedIndex = -1;      // 当前选中的选区索引
    let resizeHandle = null;     // 'nw' | 'n' | ... | null
    let moveMode = false;        // 正在移动选中选区
    let moveOffset = { x: 0, y: 0 };

    // ---- 识别结果（原始个位数值，未换算） ----
    let currentNumbers = [];

    // ---- 固定换算：个位 → 万 ----
    const UNIT_DIVISOR = 10000;
    const UNIT_SCALE = 1 / UNIT_DIVISOR;   // 0.0001
    const UNIT_DIGITS = 4;
    const MIN_SIZE = 5;                     // 原图坐标最小宽高

    // ---- DOM 引用 ----
    let dom = {};

    const ATTR_LABELS = ['体', '攻', '灵', '防'];
    const MAX_SELECTIONS = 4;

    /* ==========================================================
     * Tesseract 初始化
     * ========================================================== */
    function initWorker(onProgress) {
        if (workerInitPromise) return workerInitPromise;
        workerInitPromise = (async () => {
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js 未加载（需联网或本地引入）');
            }
            const w = await Tesseract.createWorker('eng', 1, {
                logger: m => { if (onProgress) onProgress(m); }
            });
            await w.setParameters({
                tessedit_char_whitelist: '0123456789.',
                tessedit_pageseg_mode: '7',
                preserve_interword_spaces: '1'
            });
            worker = w;
            return w;
        })();
        return workerInitPromise;
    }

    /* ==========================================================
     * 单位换算
     * ========================================================== */
    function toWan(raw) {
        return Number((raw * UNIT_SCALE).toFixed(UNIT_DIGITS));
    }

    /* ==========================================================
     * 图像预处理
     * ========================================================== */
    function cropToCanvas(img, sx, sy, sw, sh, scale = 2.5) {
        const cw = Math.max(1, Math.round(sw * scale));
        const ch = Math.max(1, Math.round(sh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);

        try {
            const imgData = ctx.getImageData(0, 0, cw, ch);
            const d = imgData.data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) {
                sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            }
            const isDarkBg = (sum / (d.length / 4)) < 128;

            for (let i = 0; i < d.length; i += 4) {
                const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                let v;
                if (isDarkBg) {
                    v = gray > 160 ? 255 : (gray < 80 ? 0 : gray);
                } else {
                    v = gray > 180 ? 255 : (gray < 100 ? 0 : gray);
                }
                d[i] = d[i + 1] = d[i + 2] = v;
            }
            ctx.putImageData(imgData, 0, 0);
        } catch (_) { /* file:// 下 getImageData 可能异常，忽略 */ }

        return canvas;
    }

    /* ==========================================================
     * 数字提取
     * ========================================================== */
    function extractNumbers(text) {
        if (!text) return [];
        const normalized = text.replace(/,/g, '.');
        const matches = normalized.match(/\d+(?:\.\d+)?/g) || [];
        return matches.map(s => parseFloat(s)).filter(v => !isNaN(v));
    }

    /* ==========================================================
     * 命中检测
     * ========================================================== */
    function hitTest(imgX, imgY) {
        for (let i = selections.length - 1; i >= 0; i--) {
            const s = selections[i];
            if (imgX >= s.x && imgX <= s.x + s.w &&
                imgY >= s.y && imgY <= s.y + s.h) {
                return i;
            }
        }
        return -1;
    }

    function hitHandle(sel, imgX, imgY) {
        if (!sel || !dom.img.clientWidth) return null;
        const W = dom.img.naturalWidth, H = dom.img.naturalHeight;
        const cw = dom.img.clientWidth, ch = dom.img.clientHeight;
        const tolX = 8 * (W / cw);
        const tolY = 8 * (H / ch);

        const cx = sel.x + sel.w / 2;
        const cy = sel.y + sel.h / 2;
        const handles = [
            { name: 'nw', x: sel.x,         y: sel.y         },
            { name: 'n',  x: cx,            y: sel.y         },
            { name: 'ne', x: sel.x + sel.w, y: sel.y         },
            { name: 'e',  x: sel.x + sel.w, y: cy            },
            { name: 'se', x: sel.x + sel.w, y: sel.y + sel.h },
            { name: 's',  x: cx,            y: sel.y + sel.h },
            { name: 'sw', x: sel.x,         y: sel.y + sel.h },
            { name: 'w',  x: sel.x,         y: cy            }
        ];

        for (const h of handles) {
            if (Math.abs(imgX - h.x) <= tolX && Math.abs(imgY - h.y) <= tolY) {
                return h.name;
            }
        }
        return null;
    }

    function cursorForHandle(name) {
        return {
            nw: 'nwse-resize', se: 'nwse-resize',
            ne: 'nesw-resize', sw: 'nesw-resize',
            n: 'ns-resize',    s: 'ns-resize',
            e: 'ew-resize',    w: 'ew-resize'
        }[name] || 'crosshair';
    }

    /* ==========================================================
     * 选区绘制
     * ========================================================== */
    function redrawOverlay() {
        const overlay = dom.overlay;
        const img = dom.img;
        if (!img.complete || !img.naturalWidth || img.clientWidth === 0) return;

        overlay.width = img.clientWidth;
        overlay.height = img.clientHeight;
        overlay.style.width = img.clientWidth + 'px';
        overlay.style.height = img.clientHeight + 'px';

        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        const scaleX = img.clientWidth / img.naturalWidth;
        const scaleY = img.clientHeight / img.naturalHeight;

        // 已完成的选区
        selections.forEach((sel, idx) => {
            const x = sel.x * scaleX, y = sel.y * scaleY;
            const w = sel.w * scaleX, h = sel.h * scaleY;
            const isSelected = (idx === selectedIndex);

            // 框
            ctx.strokeStyle = isSelected ? '#faad14' : '#1890ff';
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.strokeRect(x, y, w, h);

            // 填充
            ctx.fillStyle = isSelected ? 'rgba(250,173,20,0.18)' : 'rgba(24,144,255,0.08)';
            ctx.fillRect(x, y, w, h);

            // 选中时绘制 8 个控制点
            if (isSelected) {
                drawHandles(ctx, x, y, w, h);
            }

            // 序号标签（在选区外部）
            drawLabel(ctx, x, y, w, h, idx + 1, isSelected);
        });

        // 正在拖拽的新选区
        if (isDrawing && dragStart && dragCurrent) {
            const x0 = Math.min(dragStart.x, dragCurrent.x) * scaleX;
            const y0 = Math.min(dragStart.y, dragCurrent.y) * scaleY;
            const w = Math.abs(dragCurrent.x - dragStart.x) * scaleX;
            const h = Math.abs(dragCurrent.y - dragStart.y) * scaleY;
            ctx.strokeStyle = '#faad14';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x0, y0, w, h);
            ctx.setLineDash([]);
        }
    }

    function drawHandles(ctx, x, y, w, h) {
        const r = 5;
        const points = [
            [x,       y      ],
            [x + w/2, y      ],
            [x + w,   y      ],
            [x + w,   y + h/2],
            [x + w,   y + h  ],
            [x + w/2, y + h  ],
            [x,       y + h  ],
            [x,       y + h/2]
        ];
        points.forEach(([px, py]) => {
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = '#faad14';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    /**
     * 在选区外部绘制序号标签
     * 优先左上角外部；左/上空间不足时切换到右/下侧
     */
    function drawLabel(ctx, x, y, w, h, num, isSelected) {
        const r = 9;
        const gap = 4;
        let cx, cy;

        // 水平：优先选区左侧外部
        if (x - r - gap >= 0) {
            cx = x - r - gap;
        } else {
            cx = x + w + r + gap;      // 左侧不够 → 右侧外部
        }

        // 垂直：优先选区上方外部
        if (y - r - gap >= 0) {
            cy = y - r - gap;
        } else {
            cy = y + h + r + gap;      // 上方不够 → 下方外部
        }

        // 画布边界保险
        if (cx - r < 0) cx = r;
        if (cy - r < 0) cy = r;
        if (cx + r > ctx.canvas.width)  cx = ctx.canvas.width  - r;
        if (cy + r > ctx.canvas.height) cy = ctx.canvas.height - r;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#faad14' : '#1890ff';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(num), cx, cy);
    }

    /* ==========================================================
     * 图片加载
     * ========================================================== */
    function loadImageFile(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件');
            return;
        }
        const url = URL.createObjectURL(file);
        dom.img.onload = () => {
            URL.revokeObjectURL(url);
            currentImg = dom.img;
            selections = [];
            selectedIndex = -1;
            resizeHandle = null;
            moveMode = false;
            currentNumbers = [];
            dom.emptyHint.style.display = 'none';
            dom.canvasWrap.style.display = 'inline-block';
            dom.clearSelBtn.disabled = true;
            dom.recognizeBtn.disabled = true;
            dom.applyBtn.disabled = true;
            dom.results.innerHTML = '';
            updateStatus('请在图片上拖拽框选要识别的区域（最多 4 个）');
            setTimeout(redrawOverlay, 0);
        };
        dom.img.onerror = () => {
            URL.revokeObjectURL(url);
            alert('图片加载失败');
        };
        dom.img.src = url;
    }

    /* ==========================================================
     * 坐标转换
     * ========================================================== */
    function getImageCoords(e) {
        const rect = dom.overlay.getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        const scaleX = dom.img.naturalWidth / dom.img.clientWidth;
        const scaleY = dom.img.naturalHeight / dom.img.clientHeight;
        return { x: cssX * scaleX, y: cssY * scaleY };
    }

    /* ==========================================================
     * 画布事件
     * ========================================================== */
    function bindCanvasEvents() {
        const overlay = dom.overlay;

        /* ---- mousedown ---- */
        overlay.addEventListener('mousedown', e => {
            if (!currentImg) return;
            if (e.button !== 0) return;
            const coords = getImageCoords(e);

            // 1. 命中选中选区的控制点？
            if (selectedIndex >= 0 && selections[selectedIndex]) {
                const h = hitHandle(selections[selectedIndex], coords.x, coords.y);
                if (h) {
                    resizeHandle = h;
                    return;
                }
            }

            // 2. 命中某个选区内部？
            const hitIdx = hitTest(coords.x, coords.y);
            if (hitIdx >= 0) {
                if (hitIdx === selectedIndex) {
                    // 已选中 → 进入移动模式
                    const sel = selections[hitIdx];
                    moveMode = true;
                    moveOffset.x = coords.x - sel.x;
                    moveOffset.y = coords.y - sel.y;
                    updateStatus(`正在移动选区 ${hitIdx + 1}`);
                } else {
                    // 切换选中
                    selectedIndex = hitIdx;
                    updateStatus(
                        `选区 ${hitIdx + 1} 已选中：` +
                        `拖拽内部移动，拖拽控制点调整大小，Delete 删除，Esc 取消`
                    );
                }
                redrawOverlay();
                return;
            }

            // 3. 点空白 → 取消选中
            if (selectedIndex >= 0) {
                selectedIndex = -1;
                updateStatus('已取消选中');
                redrawOverlay();
                return;
            }

            // 4. 开始画新选区
            if (selections.length >= MAX_SELECTIONS) {
                updateStatus(`最多 ${MAX_SELECTIONS} 个选区，请先清除或删除`);
                return;
            }
            isDrawing = true;
            dragStart = coords;
            dragCurrent = coords;
            redrawOverlay();
        });

        /* ---- mousemove（用 window 保证拖出画布也能跟手） ---- */
        window.addEventListener('mousemove', e => {
            if (!currentImg || dom.modal.style.display === 'none') return;
            const coords = getImageCoords(e);

            // 调整大小
            if (resizeHandle && selectedIndex >= 0) {
                const sel = selections[selectedIndex];
                const W = dom.img.naturalWidth, H = dom.img.naturalHeight;
                let left = sel.x, top = sel.y;
                let right = sel.x + sel.w, bottom = sel.y + sel.h;

                if (resizeHandle.includes('w')) left   = Math.max(0, Math.min(coords.x, right - MIN_SIZE));
                if (resizeHandle.includes('e')) right  = Math.min(W, Math.max(coords.x, left  + MIN_SIZE));
                if (resizeHandle.includes('n')) top    = Math.max(0, Math.min(coords.y, bottom - MIN_SIZE));
                if (resizeHandle.includes('s')) bottom = Math.min(H, Math.max(coords.y, top   + MIN_SIZE));

                sel.x = left;
                sel.y = top;
                sel.w = right - left;
                sel.h = bottom - top;
                redrawOverlay();
                return;
            }

            // 移动
            if (moveMode && selectedIndex >= 0) {
                const sel = selections[selectedIndex];
                const W = dom.img.naturalWidth, H = dom.img.naturalHeight;
                let nx = coords.x - moveOffset.x;
                let ny = coords.y - moveOffset.y;
                nx = Math.max(0, Math.min(W - sel.w, nx));
                ny = Math.max(0, Math.min(H - sel.h, ny));
                sel.x = nx;
                sel.y = ny;
                redrawOverlay();
                return;
            }

            // 画新选区
            if (isDrawing) {
                dragCurrent = coords;
                redrawOverlay();
                return;
            }

            // 空闲时更新鼠标样式
            if (selectedIndex >= 0 && selections[selectedIndex]) {
                const h = hitHandle(selections[selectedIndex], coords.x, coords.y);
                if (h) {
                    overlay.style.cursor = cursorForHandle(h);
                    return;
                }
                if (hitTest(coords.x, coords.y) === selectedIndex) {
                    overlay.style.cursor = 'move';
                    return;
                }
            }
            if (hitTest(coords.x, coords.y) >= 0) {
                overlay.style.cursor = 'pointer';
            } else {
                overlay.style.cursor = 'crosshair';
            }
        });

        /* ---- mouseup ---- */
        window.addEventListener('mouseup', e => {
            if (dom.modal.style.display === 'none') return;

            // 结束调整大小
            if (resizeHandle) {
                resizeHandle = null;
                if (selectedIndex >= 0 && selections[selectedIndex]) {
                    updateStatus(`选区 ${selectedIndex + 1} 已调整大小`);
                    invalidateResults();
                }
                redrawOverlay();
                return;
            }

            // 结束移动
            if (moveMode) {
                moveMode = false;
                if (selectedIndex >= 0 && selections[selectedIndex]) {
                    updateStatus(`选区 ${selectedIndex + 1} 已移动`);
                    invalidateResults();
                }
                return;
            }

            // 结束画新选区
            if (!isDrawing) return;
            isDrawing = false;
            if (!dragStart) return;

            const end = getImageCoords(e);
            const x = Math.min(dragStart.x, end.x);
            const y = Math.min(dragStart.y, end.y);
            const w = Math.abs(end.x - dragStart.x);
            const h = Math.abs(end.y - dragStart.y);
            dragStart = dragCurrent = null;

            if (w < MIN_SIZE || h < MIN_SIZE) { redrawOverlay(); return; }

            selections.push({ x, y, w, h });
            dom.clearSelBtn.disabled = false;
            dom.recognizeBtn.disabled = false;
            invalidateResults();
            updateStatus(`已新增选区 ${selections.length} 个，可继续框选或点击「识别选区」`);
            redrawOverlay();
        });

        overlay.addEventListener('dragstart', e => e.preventDefault());
        overlay.addEventListener('contextmenu', e => e.preventDefault());
    }

    /* ==========================================================
     * 识别
     * ========================================================== */
async function recognize() {
    if (selections.length === 0 || !currentImg) return;

    selectedIndex = -1;
    resizeHandle = null;
    moveMode = false;
    redrawOverlay();

    dom.recognizeBtn.disabled = true;
    dom.applyBtn.disabled = true;
    dom.results.innerHTML = '';
    updateStatus('正在初始化识别引擎（首次约 10~20 秒）…');

    try {
        await initWorker(m => {
            if (m.status === 'loading tesseract core') updateStatus('加载引擎…');
            else if (m.status === 'loading language traineddata') updateStatus('加载语言包…');
            else if (m.status === 'initializing api') updateStatus('初始化…');
            else if (m.status === 'recognizing text') {
                updateStatus(`识别中… ${Math.round((m.progress || 0) * 100)}%`);
            }
        });

        const rawNumbers = [];
        for (let i = 0; i < selections.length; i++) {
            updateStatus(`识别中… (${i + 1}/${selections.length})`);
            const sel = selections[i];
            const canvas = cropToCanvas(currentImg, sel.x, sel.y, sel.w, sel.h);
            const { data } = await worker.recognize(canvas);
            const nums = extractNumbers(data.text);
            nums.forEach(v => rawNumbers.push(v));
        }

        if (rawNumbers.length === 0) {
            updateStatus('未识别到数字，请调整框选区域后重试');
            return;                                // ← 用 finally 统一恢复
        }

        currentNumbers = rawNumbers;
        renderResults();
        updateStatus(`识别完成，共 ${currentNumbers.length} 个数字（可手动修改）`);
        dom.applyBtn.disabled = false;
    } catch (e) {
        console.error('[OCR] 识别失败', e);
        updateStatus('识别失败: ' + e.message);
    } finally {
        // ★ 无论成功/失败/异常，都根据当前是否有选区恢复按钮
        dom.recognizeBtn.disabled = (selections.length === 0);
    }
}

    /* ==========================================================
     * 结果表
     * ========================================================== */
    function renderResults() {
        dom.results.innerHTML = '';
        if (currentNumbers.length === 0) return;

        const hint = document.createElement('div');
        hint.className = 'opt-hint';
        hint.style.marginBottom = '6px';
        hint.textContent =
            `已按 ÷10000 换算成「万」。请核对「原值」列确认没有漏位，再改「换算值」并填入表单。`;
        dom.results.appendChild(hint);

        const table = document.createElement('table');
        table.className = 'ocr-result-table';

        const headRow = table.insertRow();
        headRow.innerHTML =
            '<th style="width:40px">#</th>' +
            '<th>原值（识别）</th>' +
            '<th>换算值（万）</th>' +
            '<th style="width:100px">填入属性</th>';

        currentNumbers.forEach((raw, idx) => {
            const tr = table.insertRow();
            tr.insertCell().textContent = String(idx + 1);

            const rawCell = tr.insertCell();
            rawCell.textContent = String(raw);
            rawCell.style.fontFamily = 'Consolas, monospace';
            rawCell.style.color = '#666';

            // 位数异常标红
            const digitCount = String(Math.floor(raw)).replace(/[^0-9]/g, '').length;
            if (digitCount < 7 || digitCount > 10) {
                rawCell.style.color = '#fa541c';
                rawCell.title = `位数 ${digitCount}，可能识别有误`;
            }

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = String(toWan(raw));
            inp.className = 'ocr-result-input';
            inp.dataset.raw = String(raw);
            tr.insertCell().appendChild(inp);

            const sel = document.createElement('select');
            ATTR_LABELS.forEach((label, k) => {
                const opt = document.createElement('option');
                opt.value = String(k);
                opt.textContent = label;
                sel.appendChild(opt);
            });
            sel.value = String(idx < 4 ? idx : 0);
            tr.insertCell().appendChild(sel);
        });

        dom.results.appendChild(table);
    }

    /** 选区变化后作废识别结果 */
    function invalidateResults() {
        if (currentNumbers.length > 0) {
            currentNumbers = [];
            dom.results.innerHTML = '';
            dom.applyBtn.disabled = true;
        }
    }

    /* ==========================================================
     * 应用到表单
     * ========================================================== */
    function apply() {
        if (!window.PkApp) { alert('无法访问主表单'); return; }

        const rowIdx = parseInt(dom.targetRow.value, 10);
        if (isNaN(rowIdx)) return;

        const trs = dom.results.querySelectorAll('tr');
        const values = [null, null, null, null];
        let count = 0;

        for (let i = 1; i < trs.length; i++) {
            const tr = trs[i];
            const input = tr.querySelector('input.ocr-result-input');
            const select = tr.querySelector('select');
            if (!input || !select) continue;

            const val = parseFloat(input.value);
            const attrIdx = parseInt(select.value, 10);
            if (isNaN(val) || isNaN(attrIdx)) continue;
            if (values[attrIdx] === null) {
                values[attrIdx] = val;
                count++;
            }
        }

        if (count === 0) {
            alert('没有可填入的数值');
            return;
        }

        if (window.PkApp.fillRowAttrs(rowIdx, values)) {
            updateStatus(`已填入第 ${rowIdx + 1} 行（${count} 项）`);
        } else {
            alert('填入失败');
        }
    }

    /* ==========================================================
     * 工具
     * ========================================================== */
    function updateStatus(msg) {
        if (dom.status) dom.status.textContent = msg || '';
    }

    function rebuildTargetRowSelect() {
        const sel = dom.targetRow;
        const prev = sel.value;
        sel.innerHTML = '';
        const n = window.PkApp ? window.PkApp.getRowCount() : 5;
        for (let i = 0; i < n; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            const name = window.PkApp ? window.PkApp.getRowRoleName(i) : '';
            opt.textContent = `第 ${i + 1} 行${name ? ' · ' + name : ''}`;
            sel.appendChild(opt);
        }
        if (prev && parseInt(prev, 10) < n) sel.value = prev;
    }

    /* ==========================================================
     * 对外接口
     * ========================================================== */
    function open() {
        if (!dom.modal) return;
        dom.modal.style.display = 'flex';
        rebuildTargetRowSelect();
        updateStatus('');
        setTimeout(redrawOverlay, 0);
    }

    function close() {
        if (dom.modal) dom.modal.style.display = 'none';
    }

    /* ==========================================================
     * 初始化
     * ========================================================== */
    function setup() {
        dom = {
            modal:        document.getElementById('ocrModal'),
            canvasWrap:   document.getElementById('ocrCanvasWrap'),
            img:          document.getElementById('ocrImg'),
            overlay:      document.getElementById('ocrOverlay'),
            emptyHint:    document.getElementById('ocrEmptyHint'),
            status:       document.getElementById('ocrStatus'),
            results:      document.getElementById('ocrResults'),
            clearSelBtn:  document.getElementById('ocrClearSelBtn'),
            recognizeBtn: document.getElementById('ocrRecognizeBtn'),
            applyBtn:     document.getElementById('ocrApplyBtn'),
            targetRow:    document.getElementById('ocrTargetRow'),
            pickBtn:      document.getElementById('ocrPickBtn'),
            fileInput:    document.getElementById('ocrFileInput'),
            closeBtn:     document.getElementById('ocrCloseBtn'),
        };

        if (!dom.modal) {
            console.warn('[OCR] 未找到 #ocrModal，跳过初始化');
            return;
        }

        dom.pickBtn.addEventListener('click', () => dom.fileInput.click());
        dom.fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) loadImageFile(file);
            e.target.value = '';
        });

        // 清空全部选区
        dom.clearSelBtn.addEventListener('click', () => {
            selections = [];
            selectedIndex = -1;
            resizeHandle = null;
            moveMode = false;
            invalidateResults();
            dom.applyBtn.disabled = true;
            dom.clearSelBtn.disabled = true;
            dom.recognizeBtn.disabled = true;
            updateStatus('请在图片上拖拽框选要识别的区域');
            redrawOverlay();
        });

        dom.recognizeBtn.addEventListener('click', recognize);
        dom.applyBtn.addEventListener('click', apply);
        dom.closeBtn.addEventListener('click', close);

        dom.modal.addEventListener('click', e => {
            if (e.target === dom.modal) close();
        });

        dom.img.addEventListener('load', () => setTimeout(redrawOverlay, 0));

        window.addEventListener('resize', () => {
            if (dom.modal.style.display !== 'none') redrawOverlay();
        });

        // 粘贴图片
        document.addEventListener('paste', e => {
            if (dom.modal.style.display === 'none') return;
            for (const item of e.clipboardData.items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) loadImageFile(file);
                    break;
                }
            }
        });

        // 拖拽图片
        dom.modal.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        dom.modal.addEventListener('drop', e => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) loadImageFile(file);
        });

        // 键盘：Delete 删除选中，Esc 取消选中/关闭
        document.addEventListener('keydown', e => {
            if (dom.modal.style.display === 'none') return;

            const tag = document.activeElement?.tagName;
            const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (inInput) return;
                if (selectedIndex >= 0 && selectedIndex < selections.length) {
                    e.preventDefault();
                    selections.splice(selectedIndex, 1);
                    selectedIndex = -1;
                    invalidateResults();
                    dom.applyBtn.disabled = true;
                    dom.clearSelBtn.disabled = selections.length === 0;
                    dom.recognizeBtn.disabled = selections.length === 0;
                    updateStatus(`已删除选区，剩余 ${selections.length} 个`);
                    redrawOverlay();
                }
                return;
            }

            if (e.key === 'Escape') {
                if (inInput) return;
                if (selectedIndex >= 0) {
                    e.preventDefault();
                    selectedIndex = -1;
                    updateStatus('已取消选中');
                    redrawOverlay();
                } else {
                    close();
                }
            }
        });

        bindCanvasEvents();

        if (typeof Tesseract === 'undefined') {
            const openBtn = document.getElementById('ocrOpenBtn');
            if (openBtn) {
                openBtn.disabled = true;
                openBtn.title = 'Tesseract.js 未加载（需联网或本地引入）';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }

    return { open, close };
})();