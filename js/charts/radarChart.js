// wwwroot/js/charts/radarChart.js
import { BaseChartEngine } from './baseChart.js';



class RadarChartEngine extends BaseChartEngine {
    render() {
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

        // center & radius inside plot
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = Math.min(w, h) / 2;

        const cats = this.categories;
        const M = cats.length || 1;

        // max across all series to normalize
        let max = 0;
        for (const s of this.series) for (const v of s.values) max = Math.max(max, v ?? 0);
        if (max <= 0) max = 1;

        // grid
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.15)";
        const rings = 4;
        for (let i = 1; i <= rings; i++) {
            const rr = (i / rings) * r;
            ctx.beginPath();
            for (let k = 0; k < M; k++) {
                const ang = (-Math.PI / 2) + (k / M) * (Math.PI * 2);
                const px = cx + Math.cos(ang) * rr;
                const py = cy + Math.sin(ang) * rr;
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
        }
        // spokes
        for (let k = 0; k < M; k++) {
            const ang = (-Math.PI / 2) + (k / M) * (Math.PI * 2);
            const px = cx + Math.cos(ang) * r;
            const py = cy + Math.sin(ang) * r;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        }
        ctx.restore();

        // labels
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "12px system-ui, sans-serif";
        for (let k = 0; k < M; k++) {
            const ang = (-Math.PI / 2) + (k / M) * (Math.PI * 2);
            const px = cx + Math.cos(ang) * (r + 12);
            const py = cy + Math.sin(ang) * (r + 12);
            const label = cats[k] ?? "";
            const tw = ctx.measureText(label).width;
            ctx.fillText(label, px - tw / 2, py + 4);
        }
        ctx.restore();

        // series polygons
        this._hitRects.length = 0;
        for (let si = 0; si < this.series.length; si++) {
            const s = this.series[si];
            const color = this._seriesColor(si);

            const pts = [];
            for (let k = 0; k < M; k++) {
                const v = s.values[k] ?? 0;
                const rr = (v / max) * r;
                const ang = (-Math.PI / 2) + (k / M) * (Math.PI * 2);
                pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
            }

            // fill (light)
            ctx.save();
            ctx.beginPath();
            pts.forEach(([px, py], idx) => { if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
            ctx.closePath();
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = color;
            ctx.fill();

            // stroke
            ctx.globalAlpha = 1;
            ctx.lineWidth = 2;
            ctx.strokeStyle = color;
            ctx.stroke();

            // markers
            for (let k = 0; k < M; k++) {
                const [px, py] = pts[k];
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();

                // hit area (small square)
                this._hitRects.push({ x: px - 5, y: py - 5, w: 10, h: 10, series: s.name, cat: cats[k], value: s.values[k] ?? 0 });
            }
            ctx.restore();
        }
    }
}

export function chart_create(canvas, container, tooltip, opts, categories) {
    return new RadarChartEngine(canvas, container, tooltip, opts, categories);
}
export function chart_setSeries(engine, series) { engine.setSeries(series); }
export function chart_destroy(engine) { engine.destroy(); }
