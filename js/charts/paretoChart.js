// wwwroot/js/charts/paretoChart.js
import { BaseChartEngine } from './baseChart.js';


class ParetoChartEngine extends BaseChartEngine {
    render() {
        this._applyPanLimits();
        const ctx = this.ctx;
        const { x, y, w, h } = this._plotRect();

        // BG
        ctx.save();
        ctx.fillStyle = "#111722";
        ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
        ctx.restore();

        const title = this.opts.title ?? this.opts.Title;
        if (title) {
            ctx.save();
            ctx.fillStyle = "#e6e6e6";
            ctx.font = "600 14px system-ui, sans-serif";
            ctx.fillText(title, x, y - 16);
            ctx.restore();
        }

        const cats = this.categories.slice();
        const s = this.series[0] ?? { name: "(values)", values: [] };
        const values = s.values.slice();

        // Sort descending for classic Pareto
        const pairs = cats.map((c, i) => ({ c, v: values[i] ?? 0 }));
        pairs.sort((a, b) => (b.v - a.v));
        const sortedCats = pairs.map(p => p.c);
        const sortedVals = pairs.map(p => p.v);

        const total = sortedVals.reduce((a, b) => a + (b ?? 0), 0) || 1;
        const cumulative = [];
        let acc = 0;
        for (let i = 0; i < sortedVals.length; i++) {
            acc += sortedVals[i] ?? 0;
            cumulative.push((acc / total) * 100); // percent line (y2)
        }

        // Scales
        const maxVal = Math.max(1, ...sortedVals);
        const zoom = this._zoom, panX = this._panX;
        const bandW = (w / sortedCats.length) * zoom;
        const gap = bandW * ((this.opts.barGap ?? this.opts.BarGap ?? 0.15));
        const barW = bandW - gap;

        // Axes
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.2)";
        ctx.lineWidth = 1;
        // y1 (bars)
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
        // x
        ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
        ctx.restore();

        // y1 ticks (left)
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.font = "12px system-ui, sans-serif";
        const ticks = 5;
        for (let i = 0; i <= ticks; i++) {
            const t = (i / ticks) * maxVal;
            const py = y + h - (t / maxVal) * h;
            ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke(); ctx.globalAlpha = 1;
            ctx.fillText(this._format(t), 6, py - 2);
        }
        ctx.restore();

        // Bars + hit rects (clipped)
        this._hitRects.length = 0;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h + 20); ctx.clip();

        for (let i = 0; i < sortedCats.length; i++) {
            const bx = x + (i * bandW) + gap / 2 + panX;
            const v = sortedVals[i] ?? 0;
            const bh = (v / maxVal) * h;
            const by = y + h - bh;
            ctx.fillStyle = this._seriesColor(0);
            ctx.fillRect(bx, by, barW, bh);
            this._hitRects.push({ x: bx, y: by, w: barW, h: bh, series: s.name, cat: sortedCats[i], value: v });
        }

        // Category labels
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "12px system-ui, sans-serif";
        for (let i = 0; i < sortedCats.length; i++) {
            const cx = x + (i * bandW) + gap / 2 + panX + barW / 2;
            const label = sortedCats[i];
            const tw = ctx.measureText(label).width;
            ctx.fillText(label, cx - tw / 2, y + h + 16);
        }

        // Cumulative % line (y2)
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffd166";
        ctx.beginPath();
        for (let i = 0; i < cumulative.length; i++) {
            const cx = x + (i * bandW) + gap / 2 + panX + barW / 2;
            const py = y + h - (cumulative[i] / 100) * h; // 0..100 mapped to plot height
            if (i === 0) ctx.moveTo(cx, py); else ctx.lineTo(cx, py);
        }
        ctx.stroke();

        // Right axis (0..100%)
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.font = "12px system-ui, sans-serif";
        for (let i = 0; i <= 5; i++) {
            const p = (i / 5) * 100;
            const py = y + h - (p / 100) * h;
            const txt = p.toFixed(0) + "%";
            const tw = ctx.measureText(txt).width;
            ctx.fillText(txt, x + w - tw - 2, py - 2);
        }
        ctx.restore();

        ctx.restore(); // end clip
    }
}

export function chart_create(canvas, container, tooltip, opts, categories) {
    return new ParetoChartEngine(canvas, container, tooltip, opts, categories);
}
export function chart_setSeries(engine, series) { engine.setSeries(series); }
export function chart_destroy(engine) { engine.destroy(); }
