// Смоук-загрузка js/app.js как ES-модуля с минимальным DOM-стабом.
// Цель: поймать ошибки на этапе инициализации (top-level) после
// рефакторинга на модули. Полноценный рендеринг не требуется.

function makeEl(tag) {
    const el = {
        tagName: (tag || "div").toUpperCase(),
        dataset: {}, style: {}, attributes: {}, children: [],
        value: "", textContent: "", innerHTML: "", hidden: false,
        checked: false, type: "", placeholder: "", title: "", id: "",
        classList: {
            _s: new Set(),
            add() {}, remove() {}, toggle() {}, contains() { return false; },
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k]; },
        removeAttribute(k) { delete this.attributes[k]; },
        addEventListener() {}, removeEventListener() {},
        appendChild(c) { this.children.push(c); return c; },
        insertBefore(c) { this.children.push(c); return c; },
        removeChild() {}, remove() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        focus() {}, blur() {}, click() {},
        getBoundingClientRect() { return { width: 120, height: 20, left: 0, top: 0 }; },
        get scrollWidth() { return 120; },
        get offsetWidth() { return 200; },
        get clientWidth() { return 200; },
        scrollIntoView() {},
    };
    return el;
}

const elements = Object.create(null);
function getEl(id) {
    if (!elements[id]) { elements[id] = makeEl("div"); elements[id].id = id; }
    return elements[id];
}

const side = makeEl("aside");

globalThis.document = {
    getElementById(id) { return getEl(id); },
    querySelector(sel) { return sel === ".side" ? side : makeEl("div"); },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    createTextNode(t) { return { nodeValue: t }; },
    addEventListener() {},
    activeElement: null,
    body: makeEl("body"),
    documentElement: makeEl("html"),
};

globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    getComputedStyle() { return { paddingLeft: "8px", paddingRight: "8px", width: "200px" }; },
    matchMedia() { return { matches: false, addEventListener() {} }; },
    location: { protocol: "http:", href: "http://127.0.0.1:8000/", replace() {} },
    localStorage: null,
};

globalThis.localStorage = {
    _d: {},
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
};
globalThis.window.localStorage = globalThis.localStorage;

globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
// fetch — возвращаем «пустой» ответ, чтобы loadSession() не падал.
globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({}),
    text: async () => "{}",
});

try {
    const mod = await import("../js/app.js");
    // Проверяем, что модуль секций зарегистрирован в реестре и его refresh —
    // функция (значит initSections() вернула рабочую функцию).
    const busMod = await import("../js/core/bus.js");
    const reg = busMod.registry.get("sections");
    if (!reg || typeof reg.refresh !== "function") {
        throw new Error("sections не зарегистрирован в registry или refresh не функция");
    }
    console.log("SMOKE OK: app.js загрузился без ошибок инициализации");
    console.log("  registry.get('sections').refresh ->",
                typeof reg.refresh);
    // Модуль sessionGuard держит периодический таймер опроса /api/heartbeat —
    // в браузере это правильно, но в smoke-среде он не даёт процессу выйти.
    // Явно завершаем процесс после успешной проверки.
    process.exit(0);
} catch (e) {
    console.error("SMOKE FAIL:", e && e.stack ? e.stack : e);
    process.exitCode = 1;
}

