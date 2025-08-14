// wwwroot/js/charts/lineChart.js
import { BaseChartEngine } from './baseChart.js';



class LineChartEngine extends BaseChartEngine {
    render() {
        this._applyPanLimits();
        const ctx = this.ctx;
        const { x, y, w, h } = this._plotRect();

        // bg + axes
        ctx.save(); ctx.fillStyle = "#111722";
        ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
        ctx.restore();

        ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.2)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
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

        // y-scale over all series
        let max = 0;
        for (const s of this.series) for (const v of s.values) max = Math.max(max, v ?? 0);
        if (max <= 0) max = 1;

        // grid + labels
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

        // lines
        const zoom = this._zoom, panX = this._panX;
        const M = this.categories.length;
        const dx = (w / Math.max(1, M - 1)) * zoom;

        this._hitRects.length = 0;

        // clip to plot
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

        for (let si = 0; si < this.series.length; si++) {
            const s = this.series[si];
            ctx.beginPath();
            for (let i = 0; i < M; i++) {
                const px = x + i * dx + panX;
                const py = y + h - (Math.max(0, s.values[i] ?? 0) / max) * h;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                // hit area around point (for tooltip)
                this._hitRects.push({ x: px - 4, y: py - 4, w: 8, h: 8, series: s.name, cat: this.categories[i], value: s.values[i] ?? 0 });
            }
            ctx.lineWidth = (this.opts.lineWidth ?? this.opts.LineWidth ?? 2);
            ctx.strokeStyle = this._seriesColor(si);
            ctx.stroke();

            // optional markers
            const showMarkers = this.opts.showMarkers ?? this.opts.ShowMarkers ?? true;
            const r = (this.opts.markerSize ?? this.opts.MarkerSize ?? 3);
            if (showMarkers) {
                ctx.fillStyle = this._seriesColor(si);
                for (let i = 0; i < M; i++) {
                    const px = x + i * dx + panX;
                    const py = y + h - (Math.max(0, s.values[i] ?? 0) / max) * h;
                    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
                }
            }

            // optional area
            const ao = (this.opts.areaOpacity ?? this.opts.AreaOpacity ?? 0);
            if (ao > 0) {
                ctx.save();
                ctx.globalAlpha = ao;
                ctx.fillStyle = this._seriesColor(si);
                ctx.lineTo(x + (M - 1) * dx + panX, y + h);
                ctx.lineTo(x + 0 * dx + panX, y + h);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }

        ctx.restore();

        // x labels (outside clip so they’re fully visible, but you can clip if you prefer)
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "12px system-ui, sans-serif";
        for (let i = 0; i < M; i++) {
            const px = x + i * dx + panX;
            const label = this.categories[i];
            const tw = ctx.measureText(label).width;
            ctx.fillText(label, px - tw / 2, y + h + 16);
        }
        ctx.restore();
    }
}

// Blazor exports
export function chart_create(canvas, container, tooltip, opts, categories) {
    return new LineChartEngine(canvas, container, tooltip, opts, categories);
}
export function chart_setSeries(engine, series) { engine.setSeries(series); }
export function chart_destroy(engine) { engine.destroy(); }
