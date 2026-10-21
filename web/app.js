/* ============================================================
 * 内置默认配置（对应 Java 端的 config.properties，字段改为 JSON 结构）
 * ============================================================ */
const BUILTIN_DEFAULT = {
    sequence: ["归尘紫英", "射日天河", "魔化玄霄", "幻瞑梦璃", "望舒菱纱"],
    roles: [
        { value: [14655.4572, 2730.3894, 4298.9504, 1503.2915],
          skins: ["乾元归尘紫英", "乾元望舒菱纱", "乾元幻瞑梦璃"] },
 	{ value: [14911.2706, 4124.4034, 2925.3824, 1539.4858],
          skins: ["乾元射日天河", "乾元九尾苏媚", "洞玄弑神重楼"] },
        { value: [14667.7057, 2720.9806, 2870.4592, 2285.5577],
          skins: ["乾元魔化玄霄", "化神禺族临渊", "乾元归尘紫英"] },
        { value: [14654.6786, 2718.6833, 4304.7179, 1538.5171],
          skins: ["乾元幻瞑梦璃", "乾元罡斩", "洞玄魔剑龙葵"] },
        { value: [14636.0185, 4059.6227, 2886.1203, 1535.7925],
          skins: ["乾元望舒菱纱", "乾元断剑菖兰", "乾元左冠人"] }
    ]
};

const ROLE_NAMES = Array.from(Init.roleMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);

const SKIN_NAMES = Array.from(Init.skinIncludeMap.keys())
    .filter(k => k !== null && k !== undefined)
    .map(String)
    .sort();

/* ============================================================
 * 皮肤详情 Tooltip（移植 Complete.getExtraInfoForSkin）
 * ============================================================ */
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatRuleHtml(rule) {
    const src = rule[0] - 1, tgt = rule[1] - 1, rate = rule[2];
    const names = ["体", "攻", "灵", "防", "速"];
    const srcName = (src >= 0 && src < names.length) ? names[src] : "?";
    const tgtName = (tgt >= 0 && tgt < names.length) ? names[tgt] : (tgt === -1 ? "速" : "?");
    return `${srcName} → ${tgtName}  ${Math.round(rate * 100)}%<br>`;
}

function getExtraInfoForSkin(fullName) {
    if (!fullName || !fullName.trim()) return "无效名称";
    const simpleName = Init.skinIncludeMap.get(fullName.trim());
    if (!simpleName) return "无效名称";
    let result = `<div class="title">${escapeHtml(fullName)}</div>`;
    if (Init.conversionMap.has(simpleName)) {
        result += formatRuleHtml(Init.conversionMap.get(simpleName));
    } else if (Init.qianYuan.has(simpleName)) {
        for (const str of Init.qianYuan.get(simpleName)) {
            result += formatRuleHtml(Init.conversionMap.get(str));
        }
    } else {
        return "无效名称";
    }
    return result;
}

/* ============================================================
 * 自动补全 ComboBox
 * ============================================================ */
class AutoCompleteComboBox {
    constructor(items, onRightClick) {
        this.items = items;
        this.filtered = [];
        this.highlightIndex = 0;
        this.onRightClick = onRightClick;

        this.container = document.createElement('div');
        this.container.className = 'combo';
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.autocomplete = 'off';
        this.list = document.createElement('div');
        this.list.className = 'combo-list';
        this.container.appendChild(this.input);
        this.container.appendChild(this.list);
        this._bind();
    }

    _bind() {
        let timer = null;
        this.input.addEventListener('input', () => {
            this.highlightIndex = 0;
            clearTimeout(timer);
            timer = setTimeout(() => this._filter(), 200);
        });
        this.input.addEventListener('focus', () => { if (this.input.value) this._filter(); });
        this.input.addEventListener('keydown', e => this._onKey(e));
        this.input.addEventListener('blur', () => setTimeout(() => this._hide(), 150));
        this.input.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (this.onRightClick) this.onRightClick(this.input.value, e);
        });
    }

    _filter() {
        const text = this.input.value.trim();
        const lower = text.toLowerCase();
        this.filtered = lower
            ? this.items.filter(i => i.toLowerCase().includes(lower))
            : this.items.slice();
        this._render();
        if (text) this._show(); else this._hide();
    }

    _render() {
        const MAX = 60;
        this.list.innerHTML = '';
        this.filtered.slice(0, MAX).forEach((item, idx) => {
            const el = document.createElement('div');
            el.className = 'combo-item' + (idx === this.highlightIndex ? ' highlight' : '');
            el.textContent = item;
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                this.setValue(item);
                this._hide();
            });
            this.list.appendChild(el);
        });
        if (this.filtered.length > MAX) {
            const more = document.createElement('div');
            more.className = 'combo-more';
            more.textContent = `... 还有 ${this.filtered.length - MAX} 项`;
            this.list.appendChild(more);
        }
    }

    _onKey(e) {
        const visible = this.list.classList.contains('open');
        if (!visible && e.key === 'ArrowDown') { this._filter(); e.preventDefault(); return; }
        if (!visible) return;
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.highlightIndex > 0) { this.highlightIndex--; this._render(); }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.highlightIndex < this.filtered.length - 1) { this.highlightIndex++; this._render(); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.filtered[this.highlightIndex] !== undefined) {
                this.setValue(this.filtered[this.highlightIndex]);
                this._hide();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this._hide();
        }
    }

    _show() { this.list.classList.add('open'); }
    _hide() { this.list.classList.remove('open'); }
    setValue(v) { this.input.value = (v == null ? '' : String(v)); }
    getValue() { return this.input.value; }
}

/* ============================================================
 * Tooltip 全局
 * ============================================================ */
const tooltipEl = document.getElementById('tooltip');
function showTooltip(html, x, y) {
    tooltipEl.innerHTML = html;
    tooltipEl.style.display = 'block';
    const rect = tooltipEl.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 10;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 10;
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = y + 'px';
}
function hideTooltip() { tooltipEl.style.display = 'none'; }
document.addEventListener('click', () => hideTooltip());
document.addEventListener('scroll', () => hideTooltip(), true);

/* ============================================================
 * 行组件
 * ============================================================ */
class Row {
    constructor(data) {
        this.el = document.createElement('div');
        this.el.className = 'row';
        this.el.dataset.index = '0';

        this.handle = document.createElement('div');
        this.handle.className = 'drag-handle';
        this.handle.textContent = '⠿';
        this.el.appendChild(this.handle);

        this.seq = document.createElement('select');
        ROLE_NAMES.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            this.seq.appendChild(opt);
        });
        this.el.appendChild(this.seq);

        this.attrs = [];
        for (let i = 0; i < 4; i++) {
            const inp = document.createElement('input');
            inp.type = 'text';
            this.attrs.push(inp);
            this.el.appendChild(inp);
        }

        this.skins = [];
        for (let i = 0; i < 3; i++) {
            const combo = new AutoCompleteComboBox(SKIN_NAMES, (value, e) => {
                showTooltip(getExtraInfoForSkin(value), e.clientX + 10, e.clientY + 10);
                e.stopPropagation();
            });
            this.skins.push(combo);
            this.el.appendChild(combo.container);
        }

        if (data) this.setData(data);
    }

    setData(data) {
        if (data.name && ROLE_NAMES.includes(data.name)) {
            this.seq.value = data.name;
        }
        if (Array.isArray(data.value)) {
            for (let i = 0; i < 4; i++) this.attrs[i].value = data.value[i] ?? '';
        }
        if (Array.isArray(data.skins)) {
            for (let i = 0; i < 3; i++) this.skins[i].setValue(data.skins[i] ?? '');
        }
    }

    getData() {
        return {
            name: this.seq.value,
            value: this.attrs.map(a => a.value.trim()),
            skins: this.skins.map(c => c.getValue().trim())
        };
    }
}

/* ============================================================
 * 主体状态
 * ============================================================ */
const rowsContainer = document.getElementById('rowsContainer');
const resultArea = document.getElementById('resultArea');
let rows = [];

function buildRows(config) {
    rowsContainer.innerHTML = '';
    rows = [];
    const seq = config.sequence || [];
    const roles = config.roles || [];
    for (let i = 0; i < 5; i++) {
        const r = roles[i] || {};
        const row = new Row({
            name: seq[i] || r.name || ROLE_NAMES[0],
            value: r.value || [0, 0, 0, 0],
            skins: r.skins || ["空点化", "空点化", "空点化"]
        });
        rows.push(row);
        rowsContainer.appendChild(row.el);
        setupRowDrag(row);
    }
    updateRowIndices();
}

function updateRowIndices() {
    const children = Array.from(rowsContainer.children);
    children.forEach((el, i) => { el.dataset.index = i; });
    const map = new Map(rows.map(r => [r.el, r]));
    rows = children.map(el => map.get(el)).filter(Boolean);
}

/* ============================================================
 * 拖拽排序
 * ============================================================ */
let dragSourceIndex = -1;

function setupRowDrag(row) {
    const el = row.el;
    row.handle.addEventListener('mousedown', () => { el.draggable = true; });

    el.addEventListener('dragstart', e => {
        dragSourceIndex = parseInt(el.dataset.index);
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(dragSourceIndex)); } catch (_) {}
    });
    el.addEventListener('dragend', () => {
        el.draggable = false;
        el.classList.remove('dragging');
        dragSourceIndex = -1;
        document.querySelectorAll('.row.drag-over').forEach(r => r.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const targetIndex = parseInt(el.dataset.index);
        if (dragSourceIndex !== -1 && dragSourceIndex !== targetIndex) {
            swapRows(dragSourceIndex, targetIndex);
        }
    });
}

document.addEventListener('mouseup', () => {
    document.querySelectorAll('.row[draggable="true"]').forEach(el => { el.draggable = false; });
});

function swapRows(fromIdx, toIdx) {
    const children = Array.from(rowsContainer.children);
    const a = children[fromIdx], b = children[toIdx];
    if (!a || !b || a === b) return;
    const placeholder = document.createElement('div');
    a.parentNode.insertBefore(placeholder, a);
    b.parentNode.insertBefore(a, b);
    placeholder.parentNode.replaceChild(b, placeholder);
    updateRowIndices();
}

/* ============================================================
 * 收集 / 计算
 * ============================================================ */
function collectFormData() {
    const seq = [], roleValues = [], roleTransforms = [];
    rows.forEach(r => {
        const d = r.getData();
        seq.push(d.name);
        roleValues.push(d.value.join(','));
        roleTransforms.push(d.skins.join(','));
    });
    return { seq: seq.join('，'), roleValues, roleTransforms, roles: rows.map(r => r.getData()) };
}

function toConfig(formData) {
    return {
        version: "1.0",
        sequence: formData.seq.split('，'),
        roles: formData.roles.map(r => ({
            name: r.name,
            value: r.value.map(v => Number(v) || 0),
            skins: r.skins
        }))
    };
}

document.getElementById('calcBtn').addEventListener('click', () => {
    try {
        const { seq, roleValues, roleTransforms } = collectFormData();
        resultArea.value = PkCal.calculate(seq, roleValues, roleTransforms);
    } catch (e) {
        console.error(e);
        alert('计算出错: ' + e.message);
    }
});

document.getElementById('clearBtn').addEventListener('click', () => { resultArea.value = ''; });

/* ============================================================
 * 默认配置（localStorage 降级 / config.json 持久层）
 * ============================================================ */
const DefaultConfig = {
    FILE_NAME: 'config.json',
    STORAGE_KEY: 'pkcal_default_config',

    /**
     * 加载默认配置。优先级：
     *   1. 工作目录下 config.json（仅当权限已授予，或在 interactive 模式下申请）
     *   2. localStorage
     *   3. null（由调用方决定回退到 BUILTIN_DEFAULT）
     *
     * @param {{interactive?: boolean}} opts
     *        interactive=true 时若权限不足会弹授权框；必须在用户手势内调用
     */
    async load({ interactive = false } = {}) {
        // 1) 目录模式
        if (Workspace.dirHandle) {
            let ok = await Workspace.hasPermission();
            if (!ok && interactive) ok = await Workspace.ensurePermission();
            if (ok) {
                try {
                    const text = await Workspace.readFile(this.FILE_NAME);
                    return JSON.parse(text);
                } catch (_) {
                    // 文件不存在或解析失败 → 继续向下
                }
            }
        }
        // 2) localStorage
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try { return JSON.parse(saved); } catch (_) {}
        }
        return null;
    },

    /**
     * 保存为默认配置。优先写 config.json，否则写 localStorage。
     * 必须在用户手势内调用（写入需要权限）。
     * @returns {Promise<'file'|'storage'>} 实际保存位置
     */
    async save(config) {
        const json = JSON.stringify(config, null, 2);
        if (Workspace.dirHandle) {
            const ok = await Workspace.ensurePermission();
            if (ok) {
                await Workspace.writeFile(this.FILE_NAME, json);
                return 'file';
            }
        }
        localStorage.setItem(this.STORAGE_KEY, json);
        return 'storage';
    },

    /* 目录模式下初次启动时确保 config.json 存在，用于 "随程序自带" 的语义 */
    async ensureFileExists(config) {
        if (!Workspace.dirHandle) return false;
        if (!(await Workspace.hasPermission())) return false;
        try {
            if (!(await Workspace.fileExists(this.FILE_NAME))) {
                await Workspace.writeFile(this.FILE_NAME, JSON.stringify(config, null, 2));
                return true;
            }
        } catch (_) {}
        return false;
    }
};

/* ============================================================
 * 工作目录 UI
 * ============================================================ */
const dirLabel = document.getElementById('dirLabel');
const pickDirBtn = document.getElementById('pickDirBtn');

function updateDirLabel() {
    if (Workspace.dirHandle) {
        dirLabel.textContent = `📁 ${Workspace.dirHandle.name}/`;
        dirLabel.style.color = '#1890ff';
    } else {
        dirLabel.textContent = '（未选择，将使用浏览器下载/文件选择）';
        dirLabel.style.color = '#999';
    }
}

async function initWorkspace() {
    if (!Workspace.isSupported()) {
        pickDirBtn.disabled = true;
        pickDirBtn.title = '当前浏览器不支持 File System Access API，请使用 Chrome / Edge';
        dirLabel.textContent = '（当前浏览器不支持工作目录，导出将下载到浏览器下载目录）';
        return;
    }
    const ready = await Workspace.init();
    if (ready) {
        updateDirLabel();
    } else if (Workspace.dirHandle) {
        dirLabel.textContent = '⚠ 上次的目录需要重新授权，请点击"选择工作目录"或任一操作按钮';
        dirLabel.style.color = '#faad14';
    } else {
        updateDirLabel();
    }
}

pickDirBtn.addEventListener('click', async () => {
    try {
        await Workspace.pick();
        updateDirLabel();
        // 首次选完目录且默认配置可用时，顺便补一份 config.json 出去
        const loaded = await DefaultConfig.load({ interactive: false });
        if (loaded) await DefaultConfig.ensureFileExists(loaded);
    } catch (e) {
        if (e.name !== 'AbortError') alert('选择目录失败: ' + e.message);
    }
});

/* ============================================================
 * 导出
 * ============================================================ */
function downloadJsonFile(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

document.getElementById('exportBtn').addEventListener('click', async () => {
    const config = toConfig(collectFormData());
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // 目录模式
    if (Workspace.dirHandle && await Workspace.ensurePermission()) {
        let name = prompt(`保存文件名（将写入工作目录 "${Workspace.dirHandle.name}"）`, `config-${ts}.json`);
        if (!name) return;
        name = name.trim();
        if (!name.toLowerCase().endsWith('.json')) name += '.json';
        try {
            await Workspace.writeFile(name, JSON.stringify(config, null, 2));
            alert(`已保存到工作目录：${name}`);
        } catch (e) {
            alert('保存失败: ' + e.message);
        }
        return;
    }
    // 降级
    downloadJsonFile(config, `config-${ts}.json`);
});

/* ============================================================
 * 导入
 * ============================================================ */
const pickFileModal = document.getElementById('pickFileModal');
const fileListEl = document.getElementById('fileList');
const fileInputEl = document.getElementById('fileInput');

/* 展示目录下的 .json 列表 */
async function showDirFileList() {
    try {
        const files = await Workspace.listJsonFiles();
        console.log('[import] 目录中 .json 文件:', files);
        if (files.length === 0) {
            alert(`工作目录 "${Workspace.dirHandle.name}" 下没有 .json 文件。\n\n` +
                  `请先用"导出配置"写入该目录，或选择本地文件。`);
            return;
        }
        fileListEl.innerHTML = '';
        files.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            fileListEl.appendChild(opt);
        });
        pickFileModal.style.display = 'flex';
    } catch (e) {
        alert('读取目录失败: ' + e.message);
    }
}

document.getElementById('importBtn').addEventListener('click', () => {
    if (!Workspace.dirHandle) { fileInputEl.click(); return; }
    Workspace.hasPermission().then(ok => {
        if (ok) { showDirFileList(); return; }
        const useDir = confirm(
            `工作目录 "${Workspace.dirHandle.name}" 的访问权限已丢失。\n\n` +
            `【确定】重新授权该目录\n` +
            `【取消】改为选择本地文件`
        );
        if (!useDir) { fileInputEl.click(); return; }
        Workspace.ensurePermission().then(granted => {
            if (granted) showDirFileList();
            else alert('目录授权失败，请重试或改为选择本地文件');
        });
    });
});

document.getElementById('pickFileCancel').addEventListener('click', () => {
    pickFileModal.style.display = 'none';
});

document.getElementById('pickFileOk').addEventListener('click', async () => {
    const name = fileListEl.value;
    if (!name) return;
    try {
        const text = await Workspace.readFile(name);
        buildRows(JSON.parse(text));
        pickFileModal.style.display = 'none';
    } catch (e) {
        alert('读取或解析失败: ' + e.message);
    }
});

fileInputEl.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try { buildRows(JSON.parse(ev.target.result)); }
        catch (err) { alert('配置文件解析失败: ' + err.message); }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
});

/* ============================================================
 * 默认配置按钮：保存 / 加载 / 重置
 * ============================================================ */
document.getElementById('saveDefaultBtn').addEventListener('click', async () => {
    const config = toConfig(collectFormData());
    try {
        const where = await DefaultConfig.save(config);
        if (where === 'file') {
            alert(`已保存为默认配置（写入 ${Workspace.dirHandle.name}/${DefaultConfig.FILE_NAME}）`);
        } else {
            alert('已保存到浏览器本地存储（当前浏览器有效）。\n如需跨浏览器 / 跨机器使用，请先选择工作目录，或使用"导出配置"。');
        }
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
});

document.getElementById('loadDefaultBtn').addEventListener('click', async () => {
    try {
        const config = await DefaultConfig.load({ interactive: true });
        if (config) buildRows(config);
        else alert('没有已保存的默认配置，请先"保存为默认"或加载初始配置');
    } catch (e) {
        alert('加载默认配置失败: ' + e.message);
    }
});

document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('确定要重置为初始配置吗？')) buildRows(BUILTIN_DEFAULT);
});

/* ============================================================
 * OCR 填入接口（供 ocr.js 调用）
 * ============================================================ */
window.PkApp = {
    getRowCount() { return rows.length; },
    getRowRoleName(i) { return rows[i] ? rows[i].seq.value : ''; },
    fillRowAttrs(i, values) {
        const row = rows[i];
        if (!row) return false;
        for (let k = 0; k < 4; k++) {
            const v = values[k];
            if (v !== null && v !== undefined && v !== '') {
                row.attrs[k].value = String(v);
            }
        }
        return true;
    }
};

/* 打开 OCR 模态框 */
document.getElementById('ocrOpenBtn')?.addEventListener('click', () => {
    if (typeof OCRUI === 'undefined') {
        alert('OCR 模块未加载：请确认 index.html 已引入 ocr.js 与 tesseract.js');
        return;
    }
    OCRUI.open();
});

/* ============================================================
 * 皮肤优化器 UI
 * ============================================================ */
(function initOptimizerUI() {
    const $ = id => document.getElementById(id);
    if (!$('optimizerPanel')) {
        console.warn('[optimizer] 缺少 #optimizerPanel，跳过');
        return;
    }

    /* ====== 基准配置模块 ====== */
    const BaselineConfig = {
        KEY: 'pkcal_baseline_config',
        _cache: null,

        load() {
            if (this._cache) return this._cache;
            const s = localStorage.getItem(this.KEY);
            if (!s) return null;
            try {
                this._cache = JSON.parse(s);
                return this._cache;
            } catch (_) {
                return null;
            }
        },

        save(sequence, skins) {
            this._cache = {
                sequence: sequence.slice(),
                skins: skins.map(s => s.slice()),
                savedAt: new Date().toISOString()
            };
            localStorage.setItem(this.KEY, JSON.stringify(this._cache));
            return this._cache;
        },

        clear() {
            this._cache = null;
            localStorage.removeItem(this.KEY);
        }
    };

    function updateBaselineUI() {
        const b = BaselineConfig.load();
        const statusEl = $('optBaselineStatus');
        const summaryEl = $('optBaselineSummary');
        if (!b) {
            statusEl.textContent = '（未设置）';
            statusEl.style.color = '#999';
            summaryEl.textContent = '';
            return;
        }
        const ts = b.savedAt ? new Date(b.savedAt).toLocaleString() : '';
        statusEl.textContent = `（已设置 ${b.sequence.length} 个角色${ts ? ' · ' + ts : ''}）`;
        statusEl.style.color = '#1890ff';

        const lines = [];
        for (let i = 0; i < b.sequence.length; i++) {
            const skins = b.skins[i] || [];
            lines.push(`${i + 1}. ${b.sequence[i]}: ${skins.map(s => `[${s || '空'}]`).join(' | ')}`);
        }
        summaryEl.textContent = lines.join('\n');
    }

    $('optTarget').addEventListener('change', e => {
        $('optWeights').style.display = (e.target.value === 'weighted') ? 'flex' : 'none';
    });

    function buildObjective(target) {
        switch (target) {
            case 'total':    return r => r.teamAttr[0] / 1.5 + r.teamAttr[1] + r.teamAttr[2] * 1.3;
            case 'body':     return r => r.teamAttr[0];
            case 'attack':   return r => r.teamAttr[1];
            case 'spirit':   return r => r.teamAttr[2];
            case 'weighted': {
                const w = [
                    parseFloat($('wBody').value)    || 0,
                    parseFloat($('wAttack').value)  || 0,
                    parseFloat($('wSpirit').value)  || 0,
                    parseFloat($('wDefense').value) || 0,
                    parseFloat($('wSpeed').value)   || 0
                ];
                return r => r.teamAttr[0]*w[0] + r.teamAttr[1]*w[1] +
                            r.teamAttr[2]*w[2] + r.teamAttr[3]*w[3] +
                            (r.speed || 0) * w[4];
            }
            default: return r => 0;
        }
    }

    /* ====== 候选池 ====== */
    const CANDIDATE_EXCLUDE = new Set(["待替换"]);
    const ALL_CANDIDATE_SKINS = SKIN_NAMES.filter(s => !CANDIDATE_EXCLUDE.has(s));
    const selectedSet = new Set();

    /* ====== 默认皮肤列表（显式维护，按需增删） ====== */
    const DEFAULT_SKIN_NAMES = [
        "玄星归尘紫英","洞玄夏侯夫人","洞玄蚩尤云凡","洞玄归尘紫英",
        "洞玄射日天河","升龙厉江流","化神仙霞欺霜","洞玄断剑菖兰","洞玄梦蛇忆如","升龙掌门长卿","玄星魔翳",
        "玄星仙霞欺霜","洞玄魔剑龙葵","化神射日天河","洞玄幻瞑梦璃","升龙断剑菖兰","玄星姜世离",
        "玄星梦蛇忆如","化神魔化玄霄","升龙梦蛇小蛮","飞天夏侯夫人",

        "乾元归尘紫英","乾元灵灯明绣","乾元望舒菱纱","乾元梦蛇忆如",
        "乾元断剑菖兰","乾元射日天河","乾元左冠人","乾元飞龙景天","乾元夏侯家主",
        "乾元幻瞑梦璃",
        "乾元树灵雪见","乾元魔化玄霄"
        // ↓ 继续按需添加
    ];

    /* 列表合法性校验：写错皮肤会打印警告 */
    (function validateDefaultList() {
        const validSet = new Set(ALL_CANDIDATE_SKINS);
        const invalid = DEFAULT_SKIN_NAMES.filter(s => !validSet.has(s));
        if (invalid.length) {
            console.warn('[optimizer] 默认皮肤列表中存在无效项:', invalid);
        }
        const dup = DEFAULT_SKIN_NAMES.filter((s, i) => DEFAULT_SKIN_NAMES.indexOf(s) !== i);
        if (dup.length) {
            console.warn('[optimizer] 默认皮肤列表存在重复:', dup);
        }
    })();

    const ROLE_NAMES_CLEAN = ROLE_NAMES.filter(n => n !== '空');
    // 默认勾选判定
    function isDefaultSkin(skin) {
        return DEFAULT_SKIN_NAMES.includes(skin);
    }
    ALL_CANDIDATE_SKINS.forEach(s => { if (isDefaultSkin(s)) selectedSet.add(s); });

    const candListEl = $('optCandList');
    const candSearchEl = $('optCandSearch');
    const candCountEl = $('optCandCount');

    function renderCandidateList() {
        const filter = candSearchEl.value.trim().toLowerCase();
        const filterMatchesEmpty = !filter || '空点化'.includes(filter);

        const visible = ALL_CANDIDATE_SKINS.filter(s =>
            s !== '空点化' && (!filter || s.toLowerCase().includes(filter))
        );
        const list = filterMatchesEmpty ? ['空点化', ...visible] : visible;

        const frag = document.createDocumentFragment();
        list.forEach(skin => {
            const lbl = document.createElement('label');
            lbl.className = 'opt-cand-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = skin;
            cb.checked = selectedSet.has(skin);
            cb.addEventListener('change', () => {
                if (cb.checked) selectedSet.add(skin);
                else selectedSet.delete(skin);
                updateCandidateCount();
            });
            const span = document.createElement('span');
            span.textContent = skin;
            lbl.appendChild(cb);
            lbl.appendChild(span);
            frag.appendChild(lbl);
        });
        candListEl.innerHTML = '';
        candListEl.appendChild(frag);
        updateCandidateCount();
    }

    function updateCandidateCount() {
        candCountEl.textContent = `已选 ${selectedSet.size} / ${ALL_CANDIDATE_SKINS.length}`;
    }

    candSearchEl.addEventListener('input', renderCandidateList);

    $('optCandSelectAll').addEventListener('click', () => {
        const filter = candSearchEl.value.trim().toLowerCase();
        if (!filter || '空点化'.includes(filter)) selectedSet.add('空点化');
        ALL_CANDIDATE_SKINS.forEach(s => {
            if (s !== '空点化' && (!filter || s.toLowerCase().includes(filter))) {
                selectedSet.add(s);
            }
        });
        renderCandidateList();
    });

    $('optCandClearAll').addEventListener('click', () => {
        const filter = candSearchEl.value.trim().toLowerCase();
        if (!filter) {
            selectedSet.clear();
        } else {
            if ('空点化'.includes(filter)) selectedSet.delete('空点化');
            ALL_CANDIDATE_SKINS.forEach(s => {
                if (s !== '空点化' && s.toLowerCase().includes(filter)) selectedSet.delete(s);
            });
        }
        renderCandidateList();
    });

    $('optCandRoleOnly').addEventListener('click', () => {
        selectedSet.clear();
        ALL_CANDIDATE_SKINS.forEach(s => { if (isDefaultSkin(s)) selectedSet.add(s); });
        renderCandidateList();
    });

    renderCandidateList();

    /* ====== 基准按钮绑定 ====== */
    $('optBaselineSetBtn').addEventListener('click', () => {
        const data = collectFormData();
        const config = toConfig(data);
        BaselineConfig.save(config.sequence, config.roles.map(r => r.skins));
        updateBaselineUI();
    });

    $('optBaselineLoadBtn').addEventListener('click', () => {
        const b = BaselineConfig.load();
        if (!b) { alert('尚未设置基准'); return; }
        for (let i = 0; i < rows.length; i++) {
            if (b.sequence[i] && ROLE_NAMES.includes(b.sequence[i])) {
                rows[i].seq.value = b.sequence[i];
            }
            if (b.skins[i]) {
                for (let k = 0; k < 3; k++) {
                    rows[i].skins[k].setValue(b.skins[i][k] || '');
                }
            }
        }
    });

    $('optBaselineClearBtn').addEventListener('click', () => {
        if (!confirm('确定清空基准吗？')) return;
        BaselineConfig.clear();
        updateBaselineUI();
    });

    updateBaselineUI();

    /* ====== 工具 ====== */
    function fmtTeam(ta) {
        return `体${ta[0].toFixed(0)} 攻${ta[1].toFixed(0)} 灵${ta[2].toFixed(0)} 防${ta[3].toFixed(0)}`;
    }

    function randomStartSkins(currentSkins, candidates) {
        return currentSkins.map(arr => {
            const copy = arr.slice();
            copy[1] = candidates[Math.floor(Math.random() * candidates.length)];
            copy[2] = candidates[Math.floor(Math.random() * candidates.length)];
            return copy;
        });
    }

    let pendingResult = null;

    /* ====== 开始优化 ====== */
    $('optStartBtn').addEventListener('click', async () => {
        const candidates = Array.from(selectedSet);
        if (candidates.length === 0) {
            alert('请至少勾选一个候选皮肤');
            return;
        }

        const data = collectFormData();
        const seqParts = data.seq.split('，');
        const roleValues = data.roleValues;
        const currentSkins = data.roles.map(r =>
            r.skins.map(s => s === "待替换" ? "空点化" : s)
        );

        const objectiveFn = buildObjective($('optTarget').value);
        const maxRounds = parseInt($('optMaxRounds').value) || 5;
        const restartCount = parseInt($('optRestarts').value) || 1;
        const totalTimeoutMs = (parseInt($('optTimeout').value) || 30) * 1000;
        const seqStr = seqParts.join('，');

        const startBtn = $('optStartBtn'), stopBtn = $('optStopBtn'), applyBtn = $('optApplyBtn');
        const progressRow = $('optProgressRow'), progressFill = $('optProgressFill');
        const progressText = $('optProgressText'), resultInfo = $('optResultInfo');

        startBtn.disabled = true;
        applyBtn.disabled = true;
        stopBtn.disabled = false;
        progressRow.style.display = 'flex';
        progressFill.style.width = '0%';
        progressText.textContent = '初始化…';
        resultInfo.textContent = '';
        pendingResult = null;

        const logLines = [];
        logLines.push(`【候选池】共 ${candidates.length} 个皮肤`);
        logLines.push('');
        logLines.push('【改进日志】（皮肤1 固定，仅优化皮肤2/3）');
        resultInfo.textContent = logLines.join('\n');

        const globalStart = Date.now();
        let bestRes = null;
        let completedRestarts = 0;

        try {
            for (let restart = 0; restart < restartCount; restart++) {
                const usedMs = Date.now() - globalStart;
                if (usedMs >= totalTimeoutMs) {
                    logLines.push(`[!] 总超时 ${(totalTimeoutMs / 1000).toFixed(1)}s 已到，提前停止重启`);
                    resultInfo.textContent = logLines.join('\n');
                    break;
                }
                if (optimizer.cancelled) break;

                const startSkins = (restart === 0)
                    ? currentSkins
                    : randomStartSkins(currentSkins, candidates);
                const remainingMs = totalTimeoutMs - usedMs;

                logLines.push('');
                logLines.push(`━━━ 重启 ${restart + 1} / ${restartCount} ━━━`);
                resultInfo.textContent = logLines.join('\n');

                const res = await optimizer.run({
                    seqParts, roleValues, currentSkins: startSkins,
                    candidates, objectiveFn,
                    maxRounds, timeoutMs: remainingMs,
                    onProgress: p => {
                        if (p.pendingImprovement) {
                            const imp = p.pendingImprovement;
                            logLines.push(
                                `  [改进] ${imp.roleName} 皮肤${imp.slotIndex + 1}: ` +
                                `${imp.from} → ${imp.to}  (评分 ${p.bestScore.toFixed(0)})`
                            );
                            resultInfo.textContent = logLines.join('\n');
                            resultInfo.scrollTop = resultInfo.scrollHeight;
                        }
                        if (p.totalSteps) {
                            const pct = Math.min(99, (p.step / p.totalSteps) * 100);
                            progressFill.style.width = pct.toFixed(1) + '%';
                        }
                        progressText.textContent =
                            `重启 ${restart + 1}/${restartCount} | 步 ${p.step} | ` +
                            `评分 ${p.bestScore.toFixed(0)} | ${fmtTeam(p.bestResult.teamAttr)}`;
                    }
                });

                if (!res.ok) {
                    logLines.push(`  [X] 重启 ${restart + 1} 失败: ${res.reason}`);
                    resultInfo.textContent = logLines.join('\n');
                    continue;
                }

                completedRestarts++;
                logLines.push(
                    `  重启 ${restart + 1} 完成: 评分 ${res.score.toFixed(0)} | ` +
                    `耗时 ${(res.elapsed / 1000).toFixed(1)}s` +
                    (res.timedOut ? ' (超时)' : '') +
                    (res.cancelled ? ' (停止)' : '')
                );
                resultInfo.textContent = logLines.join('\n');

                if (!bestRes || res.score > bestRes.score) bestRes = res;
                if (optimizer.cancelled) break;
            }

            if (!bestRes) {
                alert('优化未产生有效结果');
                return;
            }

            progressFill.style.width = '100%';
            const totalElapsed = (Date.now() - globalStart) / 1000;
            progressText.textContent =
                `完成 ${completedRestarts}/${restartCount} 次重启 | ` +
                `总耗时 ${totalElapsed.toFixed(1)}s | 评分 ${bestRes.score.toFixed(0)}`;

            const baseRes = PkCal.evaluate(
                seqStr, roleValues, currentSkins.map(s => s.join(','))
            );
            const baseScore = baseRes.valid ? objectiveFn(baseRes) : 0;

            logLines.push('');
            logLines.push('====== 最终结果 ======');
            logLines.push(fmtTeam(bestRes.result.teamAttr));
            if (bestRes.result.speed > 0) logLines.push(`速度: ${bestRes.result.speed.toFixed(0)}`);
            logLines.push('');
            logLines.push(`起点评分: ${baseScore.toFixed(0)}`);
            logLines.push(`最优评分: ${bestRes.score.toFixed(0)}`);
            if (baseScore > 0) {
                const pct = (bestRes.score - baseScore) / baseScore * 100;
                if (pct > 0) logLines.push(`提升: +${pct.toFixed(2)}%`);
                else if (pct === 0) logLines.push(`提升: 0.00%（无变化）`);
            } else {
                logLines.push(`提升: 起点评分为 0，无法计算百分比`);
            }
            logLines.push('');
            logLines.push('【最终配置】（皮肤1 保持原值）');
            for (let i = 0; i < seqParts.length; i++) {
                const s = bestRes.config[i];
                logLines.push(
                    `  ${seqParts[i]}:\n` +
                    `    皮肤1=[固定]${s[0]}\n` +
                    `    皮肤2=${s[1]}\n` +
                    `    皮肤3=${s[2]}`
                );
            }

            // ===================== 与基准对比 =====================
            const baseline = BaselineConfig.load();
            if (baseline) {
                logLines.push('');
                logLines.push('====== 与基准对比 ======');

                const sameOrder = baseline.sequence.length === seqParts.length
                    && baseline.sequence.every((name, i) => name === seqParts[i]);

                if (!sameOrder) {
                    logLines.push('⚠ 基准角色顺序与当前表单不同，无法逐角色对比');
                    logLines.push('  基准角色: ' + baseline.sequence.join('，'));
                    logLines.push('  当前角色: ' + seqParts.join('，'));
                    logLines.push('  建议：点击"从基准载入表单"后再优化，或重新设置基准');
                } else {
                    const baselineTrans = baseline.skins.map(s => s.join(','));
                    const baselineEval = PkCal.evaluate(seqStr, roleValues, baselineTrans);
                    if (!baselineEval.valid) {
                        logLines.push('⚠ 基准配置评估失败: ' + (baselineEval.reason || '未知'));
                    } else {
                        const baselineScore = objectiveFn(baselineEval);
                        logLines.push(`基准评分: ${baselineScore.toFixed(1)}`);
                        logLines.push(`最优评分: ${bestRes.score.toFixed(1)}`);
                        if (baselineScore > 0) {
                            const pct = (bestRes.score - baselineScore) / baselineScore * 100;
                            const sign = pct > 0 ? '+' : '';
                            logLines.push(`差异: ${sign}${pct.toFixed(2)}%`);
                        } else {
                            logLines.push(`差异: 基准评分为 0，无法计算百分比`);
                        }

                        logLines.push('');
                        logLines.push('【角色差异】（仅对比皮肤2/3，皮肤1 固定）');
                        let hasDiff = false;
                        for (let i = 0; i < seqParts.length; i++) {
                            const baseSkins = baseline.skins[i] || [];
                            const optSkins = bestRes.config[i];
                            const roleName = seqParts[i];
                            const slotDiffs = [];
                            for (let k = 1; k <= 2; k++) {
                                const b = baseSkins[k] || '';
                                const o = optSkins[k] || '';
                                if (b !== o) {
                                    slotDiffs.push({ slot: k + 1, from: b || '空', to: o || '空' });
                                }
                            }
                            if (slotDiffs.length === 0) {
                                logLines.push(`  位置${i + 1} ${roleName}: （无变化）`);
                            } else {
                                hasDiff = true;
                                logLines.push(`  位置${i + 1} ${roleName}:`);
                                for (const d of slotDiffs) {
                                    logLines.push(`    皮肤${d.slot}: ${d.from} → ${d.to}`);
                                }
                            }
                        }
                        // ★ 改为属性逐项对比，兼容"设基准后改过皮肤1"的场景
                        const sameTeamAttr = !hasDiff
                            && baselineEval.teamAttr.every((v, k) =>
                                   Math.abs(v - bestRes.result.teamAttr[k]) < 1e-6)
                            && Math.abs((baselineEval.speed || 0) - (bestRes.result.speed || 0)) < 1e-6;
                        if (sameTeamAttr) {
                            logLines.push('');
                            logLines.push('  （与基准完全一致）');
                        }
                    }
                }
            }

            resultInfo.textContent = logLines.join('\n');
            resultInfo.scrollTop = resultInfo.scrollHeight;

            pendingResult = bestRes.config;
            applyBtn.disabled = false;
        } catch (e) {
            console.error(e);
            alert('优化异常: ' + e.message);
        } finally {
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    });

    $('optStopBtn').addEventListener('click', () => {
        optimizer.stop();
        $('optStopBtn').disabled = true;
    });

    $('optApplyBtn').addEventListener('click', () => {
        if (!pendingResult) return;
        for (let i = 0; i < rows.length && i < pendingResult.length; i++) {
            const skins = pendingResult[i];
            for (let k = 1; k <= 2; k++) {
                rows[i].skins[k].setValue(skins[k] || '');
            }
        }
        $('optApplyBtn').disabled = true;
        pendingResult = null;

        try {
            const { seq, roleValues, roleTransforms } = collectFormData();
            resultArea.value = PkCal.calculate(seq, roleValues, roleTransforms);
        } catch (_) {}
    });
})();

/* ============================================================
 * 说明文档
 * 加载顺序：
 *   1. 工作目录下的 README.txt（需授权）
 *   2. 同目录 fetch('README.txt')（需 http/https）
 *   3. 内置兜底说明
 * ============================================================ */
(function initReadme() {
    const $ = id => document.getElementById(id);
    const modal = $('readmeModal');
    const contentEl = $('readmeContent');
    const readmeBtn = $('readme');
    if (!modal || !contentEl || !readmeBtn) {
        console.warn('[readme] 缺少说明 modal 或按钮，跳过');
        return;
    }

    const FILE_NAME = 'README.txt';

    const BUILTIN_README = [
        '属性计算器 使用说明（内置简版）',
        '================================',
        '',
        '【为什么显示这段文字】',
        '未找到外部说明文件 README.txt。',
        '',
        '【如何添加完整说明】',
        '1. 在 index.html 同目录下创建 README.txt',
        '2. 或先点击"选择工作目录"授权一个文件夹，',
        '   并在该文件夹放 README.txt',
        '',
        '【基本用法】',
        '- 填写 5 个角色的基础属性和皮肤',
        '- 拖动 ⠿ 手柄可交换角色顺序',
        '- 点击"计算"查看结果',
        '- 皮肤输入框右键可查看转换规则',
        '',
        '【皮肤优化器】',
        '- 展开"皮肤优化器"面板',
        '- 勾选候选皮肤池后点击"开始优化"',
        '- 皮肤1 固定不参与优化'
    ].join('\n');

    let cachedText = null;

    async function loadReadme() {
        // 1. 工作目录
        if (Workspace.dirHandle) {
            try {
                const ok = await Workspace.hasPermission();
                if (ok) {
                    return await Workspace.readFile(FILE_NAME);
                }
            } catch (_) {}
        }
        // 2. fetch 同目录
        try {
            const res = await fetch(FILE_NAME, { cache: 'no-cache' });
            if (res.ok) {
                return await res.text();
            }
        } catch (_) {}
        // 3. 兜底
        return BUILTIN_README;
    }

    async function openReadme() {
        modal.style.display = 'flex';
        contentEl.textContent = '加载中…';
        try {
            const text = cachedText !== null ? cachedText : await loadReadme();
            cachedText = text;
            contentEl.textContent = text;
            contentEl.scrollTop = 0;
        } catch (e) {
            contentEl.textContent = '加载失败: ' + e.message + '\n\n' + BUILTIN_README;
        }
    }

    function closeReadme() {
        modal.style.display = 'none';
    }

    readmeBtn.addEventListener('click', openReadme);
    $('readmeClose').addEventListener('click', closeReadme);

    // 点击遮罩关闭
    modal.addEventListener('click', e => {
        if (e.target === modal) closeReadme();
    });

    // Esc 关闭
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
            closeReadme();
        }
    });
})();

/* ============================================================
 * 启动
 * ============================================================ */
(async function boot() {
    const versionEl = document.querySelector('h1 .version');
    if (versionEl) versionEl.textContent = `[${Init.DATA} / ${Init.VERSION}]`;

    await initWorkspace();

    // 读取默认配置（boot 阶段不能弹授权框，所以 interactive=false）
    let config = await DefaultConfig.load({ interactive: false });

    // 目录模式下，如果拿到的是内置或 localStorage 配置，顺带把文件补出去
    if (config) {
        await DefaultConfig.ensureFileExists(config);
    }

    // 完全没有 → 内置默认 + 目录模式首次生成 config.json
    if (!config) {
        config = BUILTIN_DEFAULT;
        const created = await DefaultConfig.ensureFileExists(BUILTIN_DEFAULT);
        if (created) console.log('[boot] 已生成默认 config.json');
    }

    buildRows(config);
})();