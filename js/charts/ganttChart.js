// wwwroot/js/charts/ganttChart.js
import { BaseChartEngine } from './baseChart.js';


function toTs(v) { return (v instanceof Date) ? v.getTime() : (typeof v === "string" ? Date.parse(v) : v); }

class GanttChartEngine extends BaseChartEngine {
    render() {
        // NOTE: zoom/pan is horizontal (time) — reuse _zoom/_panX like bars.
        this._applyPanLimits();
        const ctx = this.ctx;
        const { x, y, w, h } = this._plotRect();

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

        // Expect opts.Gantt (array of { label, start, end, color? })
        const rows = (this.opts.gantt ?? this.opts.Gantt ?? []).slice();
        // If not provided, try to infer from categories + series[0] pairs (start,end) — fallback
        // but we’ll rely on opts.gantt in tests.

        if (!rows.length) return;

        // time domain
        let tMin = Infinity, tMax = -Infinity;
        rows.forEach(r => {
            const a = toTs(r.start), b = toTs(r.end);
            if (isFinite(a) && isFinite(b)) { tMin = Math.min(tMin, a); tMax = Math.max(tMax, b); }
        });
        if (!isFinite(tMin) || !isFinite(tMax) || tMax <= tMin) { tMin = Date.now(); tMax = tMin + 86400000; } // 1 day

        // pan+zoom in time (map time -> x)
        const zoom = this._zoom, panX = this._panX;
        const timeToX = (t) => {
            const frac = (t - tMin) / (tMax - tMin);
            return x + frac * w * zoom + panX;
        };

        // rows layout
        const rowH = Math.max(18, Math.min(40, h / rows.length));
        const gap = Math.min(8, rowH * 0.2);
        const barH = rowH - gap;

        // axes / grid (vertical time ticks: 6)
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.2)";
        ctx.lineWidth = 1;
        // frame
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();

        // time ticks
        const ticks = 6;
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.font = "12px system-ui, sans-serif";
        for (let i = 0; i <= ticks; i++) {
            const tt = tMin + (i / ticks) * (tMax - tMin);
            const tx = timeToX(tt);
            // grid line
            ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + h); ctx.stroke(); ctx.globalAlpha = 1;
            // label
            const d = new Date(tt);
            const label = d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
            const tw = ctx.measureText(label).width;
            if (tx - tw / 2 > x && tx + tw / 2 < x + w) {
                ctx.fillText(label, tx - tw / 2, y + h + 16);
            }
        }
        ctx.restore();

        // clip plot region
        this._hitRects.length = 0;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

        // draw rows + labels
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "12px system-ui, sans-serif";
        rows.forEach((r, i) => {
            const ry = y + i * rowH + gap / 2;
            // row label at left gutter (outside clip so it won’t be cut)
            ctx.save();
            ctx.restore();

            const a = timeToX(toTs(r.start));
            const b = timeToX(toTs(r.end));
            const bx = Math.min(a, b);
            const bw = Math.max(2, Math.abs(b - a));

            // bar
            ctx.fillStyle = r.color || this._seriesColor(i);
            ctx.fillRect(bx, ry, bw, barH);

            // hit
            this._hitRects.push({
                x: bx, y: ry, w: bw, h: barH,
                series: r.label ?? "Task", cat: r.label ?? `Row ${i + 1}`,
                value: ((toTs(r.end) - toTs(r.start)) / 3600000) // hours
            });
        });

        ctx.restore();

        // row labels (not clipped), align to left of plot
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "12px system-ui, sans-serif";
        rows.forEach((r, i) => {
            const ry = y + i * rowH + gap / 2 + barH / 2 + 4;
            const label = r.label ?? `Row ${i + 1}`;
            const tw = ctx.measureText(label).width;
            ctx.fillText(label, Math.max(6, x - 8 - tw), ry);
        });
        ctx.restore();
    }
}

export function chart_create(canvas, container, tooltip, opts, categories) {
    return new GanttChartEngine(canvas, container, tooltip, opts, categories);
}
export function chart_setSeries(engine, series) { engine.setSeries(series); }
export function chart_destroy(engine) { engine.destroy(); }
