// drawing.js
import { getConnectorWorldPos, getDirectionVector, drawArrowhead } from './shapes.js';
import { distanceToLine, bezierDistance, flowchartDistance } from './utils.js';

// Draw all links (and ghost/rewire lines) plus minimap overlay
export function drawCanvasLinks(state) {
    const ctx = state.ctx;
    const c = state.canvasLayer;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    // permanent links
    state.links.forEach((link, i) => {
        const fromNode = state.nodeDivs[link.sourceId];
        const toNode = state.nodeDivs[link.targetId];
        if (!fromNode || !toNode) return;
        const d1 = fromNode.querySelector(`.connector-dot[data-position="${link.sourcePosition}"]`);
        const d2 = toNode.querySelector(`.connector-dot[data-position="${link.targetPosition}"]`);
        if (!d1 || !d2) return;
        const p1 = getConnectorWorldPos(d1, link.sourcePosition, state);
        const p2 = getConnectorWorldPos(d2, link.targetPosition, state);
        drawLinkLine(ctx, p1, p2, link, state, i);
    });

    // ghost while creating new
    if (state.draggingFrom && state.tempMousePos && state.draggingFrom.editingLinkIndex === undefined) {
        const fromNode = state.nodeDivs[state.draggingFrom.nodeId];
        if (fromNode) {
            const dot = fromNode.querySelector(`.connector-dot[data-position="${state.draggingFrom.position}"]`);
            if (dot) {
                const p1 = getConnectorWorldPos(dot, state.draggingFrom.position, state);
                const p2 = state.tempMousePos;
                drawLinkLine(ctx, p1, p2, null, state, -1);
            }
        }
    }

    // ghost while rewiring existing
    if (state.draggingFrom && state.tempMousePos && state.draggingFrom.editingLinkIndex !== undefined) {
        const link = state.links[state.draggingFrom.editingLinkIndex];
        const other = state.nodeDivs[state.draggingFrom.nodeId];
        if (other) {
            const dot = other.querySelector(`.connector-dot[data-position="${state.draggingFrom.position}"]`);
            if (dot) {
                const fixed = getConnectorWorldPos(dot, '', state);
                const ghost = state.tempMousePos;
                const p1 = state.draggingFrom.editingSide === 'source' ? ghost : fixed;
                const p2 = state.draggingFrom.editingSide === 'source' ? fixed : ghost;
                drawLinkLine(ctx, p1, p2, null, state, -1);
            }
        }
    }

    ctx.restore();

    // minimap
    if (typeof state.drawMinimap === 'function') state.drawMinimap();
}

// Draw a single link (straight/curve/flowchart + optional arrow)
export function drawLinkLine(ctx, p1, p2, link, state, index) {
    const fromDir = link ? getDirectionVector(link.sourcePosition) : [0, 0];
    const toDir = link ? getDirectionVector(link.targetPosition) : [0, 0];
    const [x1, y1] = [p1.x, p1.y], [x2, y2] = [p2.x, p2.y];
    const isSel = link && index >= 0 && state.selectedLinkIndex === index;

    ctx.beginPath();
    ctx.lineWidth = isSel ? 4 : 2;
    ctx.strokeStyle = isSel ? '#2a80ff' : '#333';
    ctx.setLineDash(state.showDotted ? [4, 4] : []);
    ctx.shadowColor = isSel ? '#2a80ff' : 'transparent';
    ctx.shadowBlur = isSel ? 4 : 0;

    let arrowAngle = 0, arrowX = x2, arrowY = y2;
    const arrowOffset = 3.5;

    if (state.lineMode === 'flowchart') {
        let stub = 20;
        const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
        stub = Math.min(stub, (fromDir[0] !== 0 ? dx / 2 : dy / 2) - 5);
        stub = Math.max(stub, 4);
        const sx1 = x1 + fromDir[0] * stub, sy1 = y1 + fromDir[1] * stub;
        const sx2 = x2 + toDir[0] * stub, sy2 = y2 + toDir[1] * stub;
        const midX = (sx1 + sx2) / 2, midY = (sy1 + sy2) / 2;
        ctx.moveTo(x1, y1);
        ctx.lineTo(sx1, sy1);
        if (fromDir[0] !== 0) {
            ctx.lineTo(midX, sy1);
            ctx.lineTo(midX, sy2);
        } else {
            ctx.lineTo(sx1, midY);
            ctx.lineTo(sx2, midY);
        }
        ctx.lineTo(sx2, sy2);
        ctx.lineTo(x2, y2);
        arrowAngle = Math.atan2(y2 - sy2, x2 - sx2);
        arrowX = x2 - Math.cos(arrowAngle) * arrowOffset;
        arrowY = y2 - Math.sin(arrowAngle) * arrowOffset;
    }
    else if (state.lineMode === 'curve') {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const cl = Math.min(dist * 0.5, 100);
        const cx1 = x1 + fromDir[0] * cl, cy1 = y1 + fromDir[1] * cl;
        const cx2 = x2 + toDir[0] * cl, cy2 = y2 + toDir[1] * cl;
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
        arrowAngle = Math.atan2(y2 - cy2, x2 - cx2);
        arrowX = x2 - Math.cos(arrowAngle) * arrowOffset;
        arrowY = y2 - Math.sin(arrowAngle) * arrowOffset;
    }
    else {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        arrowAngle = Math.atan2(y2 - y1, x2 - x1);
        arrowX = x2 - Math.cos(arrowAngle) * arrowOffset;
        arrowY = y2 - Math.sin(arrowAngle) * arrowOffset;
    }

    ctx.stroke();
    if (state.showArrow) drawArrowhead(ctx, arrowX, arrowY, arrowAngle, ctx.strokeStyle);
}

// Create and hook up the minimap
export function createMinimap(state) {
    const wrap = document.createElement('div');
    wrap.style.position = 'absolute';
    wrap.style.top = '10px'; wrap.style.right = '10px';
    wrap.style.width = '200px'; wrap.style.height = '150px';
    wrap.style.border = '1px solid #ccc'; wrap.style.background = '#fff';
    wrap.style.zIndex = 50;

    const cv = document.createElement('canvas');
    cv.width = 200; cv.height = 150;
    cv.style.width = '100%'; cv.style.height = '100%';
    wrap.appendChild(cv);

    state.canvas.parentElement.style.position = 'relative';
    state.canvas.parentElement.appendChild(wrap);
    state.minimapCanvas = cv;
    state.minimapCtx = cv.getContext('2d');

    state.drawMinimap = () => {
        const ctx = state.minimapCtx, w = cv.width, h = cv.height;
        ctx.clearRect(0, 0, w, h);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        state.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + 100);
            maxY = Math.max(maxY, n.y + 50);
        });
        if (minX === Infinity) return;
        const pad = 100; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const worldW = maxX - minX, worldH = maxY - minY;
        const scale = Math.min(w / worldW, h / worldH);
        state.minimapScale = scale;
        state.minimapOffset = { x: minX, y: minY };

        ctx.fillStyle = '#333';
        state.nodes.forEach(n => {
            const x = (n.x - minX) * scale, y = (n.y - minY) * scale;
            ctx.fillRect(x, y, 100 * scale, 50 * scale);
        });

        const viewL = -state.pan.x / state.zoom;
        const viewT = -state.pan.y / state.zoom;
        const viewW = state.canvas.clientWidth / state.zoom;
        const viewH = state.canvas.clientHeight / state.zoom;
        const vx = (viewL - minX) * scale, vy = (viewT - minY) * scale;
        ctx.strokeStyle = 'red'; ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, viewW * scale, viewH * scale);
    };
}
