// events.js
import { drawCanvasLinks } from './drawing.js';
import { getConnectorWorldPos, getDirectionVector } from './shapes.js';
import { distanceToLine, bezierDistance, flowchartDistance } from './utils.js';

export function setupInputListeners(state) {
    // Delete key → remove node or link & redraw
    document.addEventListener('keydown', e => {
        if (e.key === 'Delete') {
            if (state.selectedNodeId) {
                state.nodes = state.nodes.filter(n => n.id !== state.selectedNodeId);
                state.links = state.links.filter(l =>
                    l.sourceId !== state.selectedNodeId && l.targetId !== state.selectedNodeId
                );
                state.selectedNodeId = null;
            } else if (state.selectedLinkIndex !== null) {
                state.links.splice(state.selectedLinkIndex, 1);
                state.selectedLinkIndex = null;
            }
            window._flowEditorDrawAll();
        }
    });

    // Left-click on canvas → select node / link / clear
    state.canvas.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const rect = state.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - state.pan.x) / state.zoom;
        const y = (e.clientY - rect.top - state.pan.y) / state.zoom;

        // 1️⃣ Node hit?
        for (const node of state.nodes) {
            const div = state.nodeDivs[node.id];
            const r = div.getBoundingClientRect();
            const nl = (r.left - rect.left - state.pan.x) / state.zoom;
            const nt = (r.top - rect.top - state.pan.y) / state.zoom;
            const nr = nl + r.width / state.zoom;
            const nb = nt + r.height / state.zoom;
            if (x >= nl && x <= nr && y >= nt && y <= nb) {
                state.selectedNodeId = node.id;
                state.selectedLinkIndex = null;
                window._flowEditorDrawAll();
                return;
            }
        }

        // 2️⃣ Link hit?
        state.selectedLinkIndex = null;
        for (let i = 0; i < state.links.length; i++) {
            const L = state.links[i];
            const n1 = state.nodeDivs[L.sourceId];
            const n2 = state.nodeDivs[L.targetId];
            if (!n1 || !n2) continue;

            const d1 = n1.querySelector(`.connector-dot[data-position="${L.sourcePosition}"]`);
            const d2 = n2.querySelector(`.connector-dot[data-position="${L.targetPosition}"]`);
            if (!d1 || !d2) continue;

            const p1 = getConnectorWorldPos(d1, L.sourcePosition, state);
            const p2 = getConnectorWorldPos(d2, L.targetPosition, state);

            let dist;
            if (state.lineMode === 'flowchart') {
                dist = flowchartDistance(p1, p2, { x, y });
            } else if (state.lineMode === 'curve') {
                dist = bezierDistance(
                    p1, p2,
                    getDirectionVector(L.sourcePosition),
                    getDirectionVector(L.targetPosition),
                    { x, y }
                );
            } else {
                dist = distanceToLine(p1, p2, { x, y });
            }

            // use screen-threshold (pixels)
            if (dist * state.zoom < 8) {
                state.selectedLinkIndex = i;
                state.selectedNodeId = null;
                window._flowEditorDrawAll();
                return;
            }
        }

        // 3️⃣ Blank → clear
        state.selectedNodeId = null;
        state.selectedLinkIndex = null;
        window._flowEditorDrawAll();
    });
}
