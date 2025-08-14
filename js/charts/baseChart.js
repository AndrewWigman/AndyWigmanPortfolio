
// wwwroot/js/charts/baseChart.js
export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export class BaseChartEngine {
    constructor(canvas, container, tooltip, opts, categories) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
        this.container = container;
        this.tooltip = tooltip;
        this.opts = opts || {};
        this.categories = categories || [];
        this.series = [];

        // Axis + mode
        this.coordMode = this.opts.coordMode || "cartesian"; // cartesian | polar
        this.axes = {
            x: { type: this.opts.xAxisType || "category" }, // category | linear | time
            y: { type: this.opts.yAxisType || "linear" },
            y2: this.opts.secondaryY ? { type: this.opts.y2AxisType || "percent" } : null
        };

        // Interaction state
        this._zoom = 1;
        this._panX = 0;
        this._dpiCap = (this.opts.devicePixelRatioCap ?? 2.5);

        this._isPanning = false;
        this._last = { x: 0, y: 0 };
        this._hitRects = [];
        this.disposeFns = [];

        const ro = new ResizeObserver(() => this._resize());
        ro.observe(this.container);
        this.disposeFns.push(() => ro.disconnect());

        // Zoom (wheel)
        const onWheel = (e) => {
            if (!(this.opts.enableZoomPan ?? true)) return;
            e.preventDefault();
            const { x: px, w: pw } = this._plotRect();
            const mx = e.offsetX - px;
            const zf = Math.exp(-e.deltaY * 0.0015);
            const old = this._zoom;
            this._zoom = clamp(this._zoom * zf, 0.5, 10);
            const scale = this._zoom / old;
            this._panX = (this._panX - mx) * scale + mx;
            this._applyPanLimits();
            this.render();
        };
        canvas.addEventListener("wheel", onWheel, { passive: false });
        this.disposeFns.push(() => canvas.removeEventListener("wheel", onWheel));

        // Pan + hover
        const onDown = (e) => {
            if (!(this.opts.enableZoomPan ?? true)) return;
            this._isPanning = true;
            this._last = { x: e.clientX, y: e.clientY };
        };
        const onUp = () => { this._isPanning = false; };
        const onMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            if (this._isPanning) {
                const dx = e.clientX - this._last.x;
                this._panX += dx;
                this._last = { x: e.clientX, y: e.clientY };
                this._applyPanLimits();
                this.render();
                this._hideTip();
            } else {
                let hit = null;
                for (let i = 0; i < this._hitRects.length; i++) {
                    const r = this._hitRects[i];
                    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { hit = r; break; }
                }
                if (hit) this._showTip(hit, x, y); else this._hideTip();
            }
        };
        canvas.addEventListener("pointerdown", onDown);
        window.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointermove", onMove);
        this.disposeFns.push(() => {
            canvas.removeEventListener("pointerdown", onDown);
            window.removeEventListener("pointerup", onUp);
            canvas.removeEventListener("pointermove", onMove);
        });

        this._resize();
    }

    setSeries(series) {
        const n = this.categories.length;

        // Special modes skip strict length check
        if (this.coordMode === "polar" || n === 0) {
            const fixed = [];
            for (const s of (series ?? [])) {
                const name = s.Name ?? s.name ?? "(series)";
                const values = s.Values ?? s.values ?? [];
                fixed.push({ name, values });
            }
            this.series = fixed;
            this.render();
            return;
        }

        // Default Cartesian charts: enforce length match
        const fixed = [];
        for (const s of series ?? []) {
            const name = s.Name ?? s.name ?? "(series)";
            const values = s.Values ?? s.values;
            if (!Array.isArray(values) || values.length !== n) {
                throw new Error(`Series '${name}' length != categories`);
            }
            fixed.push({ name, values });
        }
        this.series = fixed;
        this.render();
    }


    _resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, this._dpiCap);
        const wCss = this.container.clientWidth || 640;
        const hCss = parseInt(getComputedStyle(this.canvas).height) || 320;
        this.canvas.width = Math.max(1, Math.floor(wCss * dpr));
        this.canvas.height = Math.max(1, Math.floor(hCss * dpr));
        this.canvas.style.width = `${wCss}px`;
        this.canvas.style.height = `${hCss}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.render();
    }

    _plotRect() {
        const p = this.opts.padding ?? { top: 40, right: 12, bottom: 28, left: 44 };
        const top = p.top, right = p.right, bottom = p.bottom, left = p.left;
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        return { x: left, y: top, w: w - left - right, h: h - top - bottom };
    }

    _applyPanLimits() {
        const { w: pw } = this._plotRect();
        const totalWidth = pw * this._zoom;
        if (this._zoom <= 1) {
            this._panX = (pw - totalWidth) / 2;
        } else {
            const minPan = pw - totalWidth;
            const maxPan = 0;
            this._panX = clamp(this._panX, minPan, maxPan);
        }
    }

    _seriesColor(i) {
        const palette = this.opts.palette ?? ["#6aa9ff", "#ffd166", "#ef476f", "#06d6a0", "#a78bfa", "#f4a261", "#94d2bd"];
        return palette[i % palette.length];
    }

    _format(v) {
        if (this.axes.y.type === "percent" || this.axes.y2?.type === "percent") return v.toFixed(1) + "%";
        if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
        if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "k";
        return String(Math.round(v));
    }

    _showTip(hit, x, y) {
        const t = this.tooltip;
        t.style.visibility = "visible";
        t.style.left = `${x + 12}px`;
        t.style.top = `${y + 12}px`;
        let html = `<b>${hit.cat}</b><br/>${hit.series}: ${this._format(hit.value)}`;
        if (hit.extra) html += `<br/>${hit.extra}`;
        t.innerHTML = html;
    }

    _hideTip() { this.tooltip.style.visibility = "hidden"; }

    destroy() {
        this.disposeFns.forEach(fn => { try { fn(); } catch { } });
        this.disposeFns.length = 0;
    }

    // To be implemented by child chart classes
    render() { throw new Error("render() not implemented"); }
}
