/* 工作目录管理：File System Access API + IndexedDB 持久化句柄 */
const Workspace = {
    dirHandle: null,

    isSupported() {
        return 'showDirectoryPicker' in window;
    },

    /* 启动恢复句柄。返回 true 表示已授权可直接用 */
    async init() {
        if (!this.isSupported()) return false;
        try {
            const saved = await this._loadHandle();
            if (saved) {
                this.dirHandle = saved;
                return await this.hasPermission();
            }
        } catch (e) {
            console.warn('恢复工作目录失败', e);
        }
        return false;
    },

    /* 只查询权限，不弹出授权框（可在页面加载时安全调用） */
    async hasPermission() {
        if (!this.dirHandle) return false;
        try {
            return (await this.dirHandle.queryPermission({ mode: 'readwrite' })) === 'granted';
        } catch (_) {
            return false;
        }
    },

    /* 申请权限。必须在用户手势（click 等）内调用 */
    async ensurePermission() {
        if (!this.dirHandle) return false;
        const q = await this.dirHandle.queryPermission({ mode: 'readwrite' });
        if (q === 'granted') return true;
        try {
            const r = await this.dirHandle.requestPermission({ mode: 'readwrite' });
            return r === 'granted';
        } catch (_) {
            return false;
        }
    },

    /* 让用户挑一个目录，成功后记住（必须在用户手势内调用） */
    async pick() {
        if (!this.isSupported()) throw new Error('浏览器不支持 File System Access API');
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        this.dirHandle = handle;
        await this._saveHandle(handle);
        return handle;
    },

    async listJsonFiles() {
        const out = [];
        if (!this.dirHandle) return out;
        for await (const [name, h] of this.dirHandle.entries()) {
            if (h.kind === 'file' && name.toLowerCase().endsWith('.json')) {
                out.push(name);
            }
        }
        return out.sort();
    },

    async fileExists(name) {
        if (!this.dirHandle) return false;
        try {
            await this.dirHandle.getFileHandle(name);
            return true;
        } catch (_) {
            return false;
        }
    },

    async writeFile(name, text) {
        const fileHandle = await this.dirHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
    },

    async readFile(name) {
        const fileHandle = await this.dirHandle.getFileHandle(name);
        const file = await fileHandle.getFile();
        return await file.text();
    },

    /* IndexedDB 存储句柄（句柄可结构化克隆） */
    _db() {
        return new Promise((res, rej) => {
            const req = indexedDB.open('pkcal-fs', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('handles');
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    },
    async _saveHandle(handle) {
        const db = await this._db();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'workspace');
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    },
    async _loadHandle() {
        const db = await this._db();
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('workspace');
        return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    }
};