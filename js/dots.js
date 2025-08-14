window.dotsInterop = (function () {
    const R = 10;
    const MERGE_THRESHOLD = 14;
    const EDGE_INSERT_THRESHOLD = 18;   // more forgiving
    const CLICK_GUARD = 16;             // near shape guard (prevents accidental new-shape starts)
    const COLORS = ["#ff5555", "#ffa133", "#ffe14d", "#37c76b", "#3b82f6", "#a855f7", "#22d3ee", "#8b5e3c", "#111"];

    let canvas, ctx, container, dpr = 1;

    const DragMode = Object.freeze({ None: 0, Vertex: 1, Whole: 2 });

    // shape: { id:'a', vertices:[{id,x,y,color}], closed:false }
    const shapes = [];
    let active = { mode: DragMode.None, shapeIdx: -1, vIdx: -1, dx: 0, dy: 0, startX: 0, startY: 0, moveDX: 0, moveDY: 0 };

    // ---------- init ----------
    function init() {
        canvas = document.getElementById("dotCanvas");
        container = canvas?.closest(".dot-container");
        if (!canvas || !container) return;

        ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });

        canvas.addEventListener("dblclick", onDblClick);
        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        canvas.addEventListener("mouseleave", onMouseUp);

        const ro = new ResizeObserver(resizeCanvas);
        ro.observe(container);
        resizeCanvas();
        draw();
    }

    function resizeCanvas() {
        dpr = window.devicePixelRatio || 1;
        const w = container.clientWidth;
        const h = container.clientHeight;
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        draw();
    }

    // ---------- helpers ----------
    function nextId() { return "v_" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36); }
    function nextShapeLetter() {
        const n = shapes.length;
        let s = "", x = n + 1;
        while (x > 0) { x--; s = String.fromCharCode(97 + (x % 26)) + s; x = Math.floor(x / 26); }
        return s;
    }
    function pickColor(shape) { return COLORS[shape.vertices.length % COLORS.length]; }
    function getMousePos(evt) { const r = canvas.getBoundingClientRect(); return { x: evt.clientX - r.left, y: evt.clientY - r.top }; }
    function clampVertex(v) {
        const w = container.clientWidth, h = container.clientHeight;
        v.x = Math.max(R, Math.min(v.x, w - R)); v.y = Math.max(R, Math.min(v.y, h - R));
    }
    function isOverlapping(a, b, thr = MERGE_THRESHOLD) { return Math.hypot(a.x - b.x, a.y - b.y) < thr; }

    function pointInPolygon(pt, verts) {
        let inside = false;
        for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
            const xi = verts[i].x, yi = verts[i].y, xj = verts[j].x, yj = verts[j].y;
            const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
                (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-7) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function distPtToSegment(px, py, ax, ay, bx, by) {
        const vx = bx - ax, vy = by - ay;
        const wx = px - ax, wy = py - ay;
        const vv = vx * vx + vy * vy;
        if (vv === 0) return { dist: Math.hypot(px - ax, py - ay), t: 0, cx: ax, cy: ay };
        let t = (wx * vx + wy * vy) / vv;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * vx, cy = ay + t * vy;
        return { dist: Math.hypot(px - cx, py - cy), t, cx, cy };
    }

    function hitTestVertexAll(x, y) {
        for (let s = shapes.length - 1; s >= 0; s--) {
            const vs = shapes[s].vertices;
            for (let i = vs.length - 1; i >= 0; i--) if (Math.hypot(x - vs[i].x, y - vs[i].y) <= R) return { s, i };
        }
        return null;
    }

    function neighborsOf(shape, idx) {
        const n = shape.vertices.length;
        if (idx < 0 || idx >= n) return [];
        if (!shape.closed) {
            const ns = []; if (idx > 0) ns.push(idx - 1); if (idx < n - 1) ns.push(idx + 1); return ns;
        } else {
            return [(idx - 1 + n) % n, (idx + 1) % n];
        }
    }

    function findEdgeNearPointAll(p, threshold) {
        let best = null;
        for (let s = shapes.length - 1; s >= 0; s--) {
            const shape = shapes[s], n = shape.vertices.length;
            if (n < 2) continue;
            const last = shape.closed ? n : n - 1;
            for (let i = 0; i < last; i++) {
                const a = shape.vertices[i], b = shape.vertices[(i + 1) % n];
                const r = distPtToSegment(p.x, p.y, a.x, a.y, b.x, b.y);
                if (r.dist <= threshold && r.t > 0.02 && r.t < 0.98) { // avoid snapping too close to vertices
                    if (!best || r.dist < best.dist) best = { s, i, cx: r.cx, cy: r.cy, dist: r.dist };
                }
            }
        }
        return best;
    }

    function isNearAnyShape(p, tol) {
        if (hitTestVertexAll(p.x, p.y)) return true;
        if (findEdgeNearPointAll(p, tol)) return true;
        for (let s = shapes.length - 1; s >= 0; s--) {
            const sh = shapes[s];
            if (sh.closed && sh.vertices.length >= 3 && pointInPolygon(p, sh.vertices)) return true;
        }
        return false;
    }

    function deleteVertexAt(shape, idx) {
        if (idx < 0 || idx >= shape.vertices.length) return;
        shape.vertices.splice(idx, 1);
        if (shape.closed && shape.vertices.length < 3) shape.closed = false;
    }

    function getOpenShape() {
        for (let s = shapes.length - 1; s >= 0; s--) if (!shapes[s].closed) return shapes[s];
        return null;
    }

    // ---------- events ----------
    function onDblClick(e) {
        const p = getMousePos(e);

        // 1) Insert on nearest edge if within threshold
        const edge = findEdgeNearPointAll(p, EDGE_INSERT_THRESHOLD);
        if (edge) {
            const sh = shapes[edge.s];
            const insertIdx = edge.i + 1;
            sh.vertices.splice(insertIdx, 0, { id: nextId(), x: edge.cx, y: edge.cy, color: pickColor(sh) });
            draw();
            return;
        }

        // 2) If dblclick not near any shape:
        if (!isNearAnyShape(p, CLICK_GUARD)) {
            // If there is an open shape, append to it; else create a new open shape
            let sh = getOpenShape();
            if (!sh) {
                const id = nextShapeLetter();
                sh = { id, closed: false, vertices: [] };
                shapes.push(sh);
            }
            sh.vertices.push({ id: nextId(), x: p.x, y: p.y, color: pickColor(sh) });
            draw();
            return;
        }
        // If inside a closed shape, ignore (whole-drag via mousedown handles moving)
    }

    function onMouseDown(e) {
        const p = getMousePos(e);

        // Vertex drag?
        const hitV = hitTestVertexAll(p.x, p.y);
        if (hitV) {
            active.mode = DragMode.Vertex;
            active.shapeIdx = hitV.s;
            active.vIdx = hitV.i;
            const v = shapes[hitV.s].vertices[hitV.i];
            active.dx = p.x - v.x; active.dy = p.y - v.y;
            e.preventDefault();
            return;
        }

        // Inside a closed shape? -> whole-drag (topmost first)
        for (let s = shapes.length - 1; s >= 0; s--) {
            const sh = shapes[s];
            if (sh.closed && sh.vertices.length >= 3 && pointInPolygon(p, sh.vertices)) {
                active.mode = DragMode.Whole;
                active.shapeIdx = s;
                active.startX = p.x; active.startY = p.y;
                active.moveDX = 0; active.moveDY = 0;
                e.preventDefault();
                return;
            }
        }
        // IMPORTANT: No new shape on single-click. New shapes only via double-click outside.
    }

    function onMouseMove(e) {
        const p = getMousePos(e);

        if (active.mode === DragMode.Vertex) {
            const sh = shapes[active.shapeIdx]; if (!sh) return;
            const v = sh.vertices[active.vIdx]; if (!v) return;
            v.x = p.x - active.dx; v.y = p.y - active.dy; clampVertex(v);
            draw(); return;
        }

        if (active.mode === DragMode.Whole) {
            const sh = shapes[active.shapeIdx]; if (!sh) return;
            const dx = p.x - active.startX, dy = p.y - active.startY;
            const ddx = dx - active.moveDX, ddy = dy - active.moveDY;
            for (const v of sh.vertices) { v.x += ddx; v.y += ddy; clampVertex(v); }
            active.moveDX = dx; active.moveDY = dy;
            draw(); return;
        }
    }

    function onMouseUp() {
        if (active.mode === DragMode.Vertex) {
            const sh = shapes[active.shapeIdx];
            if (sh) {
                const dragIdx = active.vIdx;
                const dragged = sh.vertices[dragIdx];

                // Close by dragging LAST to FIRST (len>3) -> delete last + close
                if (!sh.closed && sh.vertices.length > 3 && dragIdx === sh.vertices.length - 1) {
                    const firstV = sh.vertices[0];
                    if (dragged && isOverlapping(dragged, firstV)) {
                        deleteVertexAt(sh, dragIdx);
                        sh.closed = true;
                        resetActive(); draw(); return;
                    }
                }

                // Merge-delete onto a connected neighbor
                if (dragged) {
                    const ns = neighborsOf(sh, dragIdx);
                    for (const nIdx of ns) {
                        const neighbor = sh.vertices[nIdx];
                        if (neighbor && isOverlapping(dragged, neighbor)) {
                            deleteVertexAt(sh, dragIdx);
                            resetActive(); draw(); return;
                        }
                    }
                }
            }
            resetActive(); draw(); return;
        }

        if (active.mode === DragMode.Whole) { resetActive(); draw(); return; }
    }

    function resetActive() {
        active = { mode: DragMode.None, shapeIdx: -1, vIdx: -1, dx: 0, dy: 0, startX: 0, startY: 0, moveDX: 0, moveDY: 0 };
    }

    // ---------- drawing ----------
    function draw() {
        const w = container.clientWidth, h = container.clientHeight;
        ctx.clearRect(0, 0, w, h);

        for (let s = 0; s < shapes.length; s++) {
            const sh = shapes[s], vs = sh.vertices;

            // Fill closed polys
            if (sh.closed && vs.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(vs[0].x, vs[0].y);
                for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y);
                ctx.closePath();
                ctx.fillStyle = "rgba(59,130,246,0.15)";
                ctx.fill();
            }

            // Edges (open & closed)
            ctx.lineWidth = 2; ctx.strokeStyle = "#111";
            for (let i = 0; i < vs.length - 1; i++) {
                ctx.beginPath(); ctx.moveTo(vs[i].x, vs[i].y); ctx.lineTo(vs[i + 1].x, vs[i + 1].y); ctx.stroke();
            }
            if (sh.closed && vs.length >= 2) {
                ctx.beginPath(); ctx.moveTo(vs[vs.length - 1].x, vs[vs.length - 1].y); ctx.lineTo(vs[0].x, vs[0].y); ctx.stroke();
            }

            // Vertices + labels
            for (let i = 0; i < vs.length; i++) {
                const v = vs[i];
                ctx.beginPath(); ctx.arc(v.x, v.y, R, 0, Math.PI * 2);
                ctx.fillStyle = v.color || COLORS[i % COLORS.length]; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();

                ctx.font = "10px system-ui, sans-serif"; ctx.fillStyle = "rgba(0,0,0,.75)";
                ctx.fillText(`${sh.id}${i + 1}`, v.x - 6, v.y + 3);
            }
        }

        // Drag highlight
        if (active.mode === DragMode.Vertex && shapes[active.shapeIdx]) {
            const v = shapes[active.shapeIdx].vertices[active.vIdx];
            if (v) {
                ctx.beginPath(); ctx.arc(v.x, v.y, R + 3, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(0,123,255,0.6)"; ctx.lineWidth = 3; ctx.stroke();
            }
        }
    }

    // ---------- public API ----------
    return { init };
})();

