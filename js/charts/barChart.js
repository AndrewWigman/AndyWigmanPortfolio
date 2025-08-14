// wwwroot/js/charts/barChart.js
import { BaseChartEngine } from './baseChart.js';



class BarChartEngine extends BaseChartEngine {
    render() {
        this._applyPanLimits();
        const ctx = this.ctx;
        const { x, y, w, h } = this._plotRect();

        // bg
        ctx.save();
        ctx.fillStyle = "#111722";
        ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
        ctx.restore();

        // title
        const title = this.opts.title ?? this.opts.Title;
        if (title) {
            ctx.save();
            ctx.fillStyle = "#e6e6e6";
            ctx.font = "600 14px system-ui, sans-serif";
            ctx.fillText(title, x, y - 16);
            ctx.restore();
        }

        const cats = this.categories;
        const M = cats.length;

        // max value (stacked or grouped)
        let max = 0;
        const stacked = this.opts.stacked ?? this.opts.Stacked ?? false;
        if (stacked) {
            for (let i = 0; i < M; i++) {
                let sum = 0;
                for (const s of this.series) sum += (s.values[i] ?? 0);
                max = Math.max(max, sum);
            }
        } else {
            for (const s of this.series) for (const v of s.values) max = Math.max(max, v ?? 0);
        }
        if (max <= 0) max = 1;

        // axes + grid
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.2)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.font = "12px system-ui, sans-serif";
        const ticks = 5;
        for (let i = 0; i <= ticks; i++) {
            const t = (i / ticks) * max;
            const py = y + h - (t / max) * h;
            ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke(); ctx.globalAlpha = 1;
            ctx.fillText(this._format(t), 6, py - 2);
        }
        ctx.restore();

        // geometry
        const zoom = this._zoom, panX = this._panX;
        const bandW = (w / M) * zoom;
        const gap = bandW * ((this.opts.barGap ?? this.opts.BarGap ?? 0.15));
        const barAreaW = bandW - gap;
        const groups = stacked ? 1 : this.series.length;

        this._hitRects.length = 0;

        // clip plot (bars + labels)
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h + 20);
        ctx.clip();

        // bars
        for (let i = 0; i < M; i++) {
            const catX = x + (i * bandW) + gap / 2 + panX;
            let baseTop = y + h;

            if (stacked) {
                for (let sIndex = 0; sIndex < this.series.length; sIndex++) {
                    const s = this.series[sIndex];
                    const v = s.values[i] ?? 0;
                    const bh = (v / max) * h;
                    const bx = catX, by = baseTop - bh; baseTop = by;
                    ctx.fillStyle = this._seriesColor(sIndex);
                    ctx.fillRect(bx, by, barAreaW, bh);
                    this._hitRects.push({ x: bx, y: by, w: barAreaW, h: bh, series: s.name, cat: cats[i], value: v });
                }
            } else {
                const barW = (barAreaW / groups);
                for (let g = 0; g < groups; g++) {
                    const s = this.series[g];
                    const v = s.values[i] ?? 0;
                    const bh = (v / max) * h;
                    const bx = catX + g * barW;
                    const by = y + h - bh;
                    ctx.fillStyle = this._seriesColor(g);
                    ctx.fillRect(bx, by, barW, bh);
                    this._hitRects.push({ x: bx, y: by, w: barW, h: bh, series: s.name, cat: cats[i], value: v });
                }
            }
        }

        // category labels
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "12px system-ui, sans-serif";
        for (let i = 0; i < M; i++) {
            const labelX = x + (i * bandW) + gap / 2 + panX + barAreaW / 2;
            const label = cats[i];
            const tw = ctx.measureText(label).width;
            ctx.fillText(label, labelX - tw / 2, y + h + 16);
        }

        ctx.restore();
    }
}

// Blazor exports
export function chart_create(canvas, container, tooltip, opts, categories) {
    return new BarChartEngine(canvas, container, tooltip, opts, categories);
}
export function chart_setSeries(engine, series) { engine.setSeries(series); }
export function chart_destroy(engine) { engine.destroy(); }
