// wwwroot/js/charts/pieChart.js
import { BaseChartEngine } from './baseChart.js';

class PieChartEngine extends BaseChartEngine {
    render() {
        const ctx = this.ctx;
        const { x, y, w, h } = this._plotRect();

        // bg
        ctx.save(); ctx.fillStyle = "#111722";
        ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
        ctx.restore();

        // title
        const title = this.opts.title ?? this.opts.Title;
        if (title) {
            ctx.save(); ctx.fillStyle = "#e6e6e6"; ctx.font = "600 14px system-ui, sans-serif";
            ctx.fillText(title, x, y - 16); ctx.restore();
        }

        // data
        const first = this.series[0];
        if (!first) return;
        const vals = first.values.map(v => Math.max(0, v || 0));
        const total = vals.reduce((a, b) => a + b, 0) || 1;

        // geometry
        const cx = x + w / 2, cy = y + h / 2;
        const R = Math.min(w, h) * 0.45;
        const innerFrac = (this.opts.innerRadiusFrac ?? this.opts.InnerRadiusFrac ?? 0); // 0=pie, 0.5=donut
        const r0 = Math.max(0, Math.min(0.95, innerFrac)) * R;
        const startDeg = (this.opts.startAngleDeg ?? this.opts.StartAngleDeg ?? -90);
        let a0 = (startDeg * Math.PI) / 180;

        this._hitRects.length = 0;

        // slices
        for (let i = 0; i < vals.length; i++) {
            const v = vals[i];
            const da = (v / total) * Math.PI * 2;

            ctx.beginPath();
            if (r0 > 0) {
                // donut
                ctx.arc(cx, cy, R, a0, a0 + da, false);
                ctx.arc(cx, cy, r0, a0 + da, a0, true);
                ctx.closePath();
            } else {
                // pie
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, R, a0, a0 + da, false);
                ctx.closePath();
            }
            ctx.fillStyle = this._seriesColor(i);
            ctx.fill();

            // very simple hit box
            this._hitRects.push({
                x: cx - R, y: cy - R, w: R * 2, h: R * 2,
                series: first.name, cat: this.categories[i], value: v
            });

            a0 += da;
        }

        // optional labels
        const showLabels = this.opts.showLabels ?? this.opts.ShowLabels ?? true;
        if (showLabels) {
            ctx.save();
            ctx.fillStyle = "rgba(255,255,255,.9)";
            ctx.font = "12px system-ui, sans-serif";
            let a = (startDeg * Math.PI) / 180;
            for (let i = 0; i < vals.length; i++) {
                const v = vals[i];
                const da = (v / total) * Math.PI * 2;
                const mid = a + da / 2;
                const lr = r0 > 0 ? (r0 + R) / 2 : R * 0.65;
                const lx = cx + Math.cos(mid) * lr;
                const ly = cy + Math.sin(mid) * lr;
                const label = `${this.categories[i]} (${Math.round((v / total) * 100)}%)`;
                const tw = ctx.measureText(label).width;
                ctx.fillText(label, lx - tw / 2, ly + 4);
                a += da;
            }
            ctx.restore();
        }
    }
}

// Blazor exports
export function chart_create(canvas, container, tooltip, opts, categories) {
    return new PieChartEngine(canvas, container, tooltip, opts, categories);
}
export function chart_setSeries(engine, series) { engine.setSeries(series); }
export function chart_destroy(engine) { engine.destroy(); }
