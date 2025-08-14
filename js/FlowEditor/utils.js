// utils.js

// ✅ Polyfill for crypto.randomUUID — only patch the method, never overwrite window.crypto
if (!(window.crypto && typeof window.crypto.randomUUID === 'function')) {
    window.crypto.randomUUID = function () {
        // RFC‑4122 version‑4 compliant UUID generator
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    };
}

// 🔹 Basic straight‑line distance from point pt to segment p1→p2
export function distanceToLine(p1, p2, pt) {
    const A = pt.x - p1.x;
    const B = pt.y - p1.y;
    const C = p2.x - p1.x;
    const D = p2.y - p1.y;
    const dot = A * C + B * D;
    const len = C * C + D * D;
    const t = len !== 0 ? dot / len : -1;

    let xx, yy;
    if (t < 0) { xx = p1.x; yy = p1.y; }
    else if (t > 1) { xx = p2.x; yy = p2.y; }
    else { xx = p1.x + t * C; yy = p1.y + t * D; }

    const dx = pt.x - xx;
    const dy = pt.y - yy;
    return Math.hypot(dx, dy);
}

// 🔹 Bézier helper for a 4‑point curve
function bezierPoint(p0, p1, p2, p3, t) {
    return (1 - t) ** 3 * p0 +
        3 * (1 - t) ** 2 * t * p1 +
        3 * (1 - t) * t ** 2 * p2 +
        t ** 3 * p3;
}

// 🔹 Distance from pt to cubic Bézier defined by p1→p2 with controls fromDir/toDir
export function bezierDistance(p1, p2, fromDir, toDir, pt) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const ctrlLen = Math.min(dist * 0.5, 100);
    const cx1 = p1.x + fromDir[0] * ctrlLen;
    const cy1 = p1.y + fromDir[1] * ctrlLen;
    const cx2 = p2.x + toDir[0] * ctrlLen;
    const cy2 = p2.y + toDir[1] * ctrlLen;

    let minDist = Infinity;
    for (let t = 0; t <= 1; t += 0.025) {
        const x = bezierPoint(p1.x, cx1, cx2, p2.x, t);
        const y = bezierPoint(p1.y, cy1, cy2, p2.y, t);
        const d = Math.hypot(pt.x - x, pt.y - y);
        if (d < 8) return d;   // early exit if very close
        minDist = Math.min(minDist, d);
    }
    return minDist;
}

// 🔹 Distance through an orthogonal “flowchart” route p1→p2
export function flowchartDistance(p1, p2, pt) {
    const midX = (p1.x + p2.x) / 2;
    const d1 = distanceToLine(p1, { x: midX, y: p1.y }, pt);
    const d2 = distanceToLine({ x: midX, y: p1.y }, { x: midX, y: p2.y }, pt);
    const d3 = distanceToLine({ x: midX, y: p2.y }, p2, pt);
    return Math.min(d1, d2, d3);
}
