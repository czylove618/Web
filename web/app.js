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

function guiGetNum(s) {
    for (let i = 0; i < ROLE_NAMES.length; i++) if (ROLE_NAMES[i].includes(s)) return i;
    return -1;
}

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
    console.log('[import] 点击。dirHandle=',
        Workspace.dirHandle ? Workspace.dirHandle.name : '(null)',
        '| supported=', Workspace.isSupported());

    // 情况 A：没有工作目录 → 同步打开文件选择器（保证用户手势有效）
    if (!Workspace.dirHandle) {
        console.log('[import] 无工作目录，打开文件选择器');
        fileInputEl.click();
        return;
    }

    // 情况 B：有工作目录 → 先查询权限（不弹框）
    Workspace.hasPermission().then(ok => {
        console.log('[import] hasPermission=', ok);

        if (ok) {
            // B1：权限有效 → 直接列目录
            showDirFileList();
            return;
        }

        // B2：权限丢失 → 用 confirm 让用户明确选择，避免直接弹授权框卡住
        const useDir = confirm(
            `工作目录 "${Workspace.dirHandle.name}" 的访问权限已丢失。\n\n` +
            `【确定】重新授权该目录\n` +
            `【取消】改为选择本地文件`
        );
        if (!useDir) {
            console.log('[import] 用户选择本地文件');
            fileInputEl.click();
            return;
        }

        // 重新授权：必须放在 confirm 之后（用户刚刚的手势仍有效）
        Workspace.ensurePermission().then(granted => {
            console.log('[import] ensurePermission=', granted);
            if (granted) {
                showDirFileList();
            } else {
                alert('目录授权失败，请重试或改为选择本地文件');
            }
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

document.getElementById('fileInput').addEventListener('change', e => {
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
        if (config) {
            buildRows(config);
        } else {
            alert('没有已保存的默认配置，请先"保存为默认"或加载初始配置');
        }
    } catch (e) {
        alert('加载默认配置失败: ' + e.message);
    }
});

document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('确定要重置为初始配置吗？')) buildRows(BUILTIN_DEFAULT);
});

/* ============================================================
 * 启动
 * ============================================================ */
(async function boot() {
    document.querySelector('h1 .version').textContent = `[${Init.DATA} / ${Init.VERSION}]`;

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