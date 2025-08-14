// shapes.js
// 🔹 Direction vector for connectors
export function getDirectionVector(position) {
    return {
        top: [0, -1],
        right: [1, 0],
        bottom: [0, 1],
        left: [-1, 0]
    }[position] || [0, 0];
}

// 🔹 World‐space connector position
export function getConnectorWorldPos(dotEl, _, state) {
    const rect = dotEl.getBoundingClientRect();
    const canvasRect = state.canvas.getBoundingClientRect();
    return {
        x: (rect.left + rect.width / 2 - canvasRect.left - state.pan.x) / state.zoom,
        y: (rect.top + rect.height / 2 - canvasRect.top - state.pan.y) / state.zoom
    };
}

// 🔹 Draw an arrowhead
export function drawArrowhead(ctx, x, y, angle, color) {
    const size = 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size / 2);
    ctx.lineTo(-size, -size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
