// core.js
import './utils.js';                       // polyfill + utilities
import { drawCanvasLinks, createMinimap } from './drawing.js';
import { setupInputListeners } from './events.js';

// ─── Shape registry & proximity settings ─────────────────────────────────────

const SHAPE_STYLES = new Set([
    'rect', 'diamond', 'ellipse', 'parallelogram'
    // …add more shape keys as you define CSS classes…
]);

const PROXIMITY_RADIUS = 40; // px in screen-space

function isDotConnected(nodeId, position, links) {
    return links.some(l =>
        (l.sourceId === nodeId && l.sourcePosition === position) ||
        (l.targetId === nodeId && l.targetPosition === position)
    );
}

function enableDotProximityReveal(state) {
    const vp = state.viewport;
    vp.addEventListener('mousemove', e => {
        Object.values(state.nodeDivs).forEach(div => {
            div.querySelectorAll('.connector-dot.unconnected').forEach(dot => {
                const r = dot.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const d = Math.hypot(e.clientX - cx, e.clientY - cy);
                dot.classList.toggle('nearby', d < PROXIMITY_RADIUS);
            });
        });
    });
    vp.addEventListener('mouseleave', () => {
        Object.values(state.nodeDivs).forEach(div =>
            div.querySelectorAll('.connector-dot.nearby')
                .forEach(dot => dot.classList.remove('nearby'))
        );
    });
}

// ─── Initialization ───────────────────────────────────────────────────────────

window.initFlowEditor = (nodes, links) => {
    const canvasContainer = document.getElementById('flowCanvas');
    canvasContainer.innerHTML = `
    <div id="toolbar"  style="position:absolute; top:10px; left:10px; z-index:10;"></div>
    <canvas id="linkCanvas" style="position:absolute; top:0; left:0; z-index:0; pointer-events:none;"></canvas>
    <div id="viewport"   style="position:absolute; top:0; left:0; width:100%; height:100%; transform-origin:0 0;"></div>
  `;

    const canvasLayer = canvasContainer.querySelector('#linkCanvas');
    const ctx = canvasLayer.getContext('2d');
    canvasLayer.width = canvasContainer.clientWidth;
    canvasLayer.height = canvasContainer.clientHeight;

    const state = {
        canvas: canvasContainer,
        canvasLayer,
        ctx,
        viewport: canvasContainer.querySelector('#viewport'),
        toolbar: canvasContainer.querySelector('#toolbar'),
        nodes, links,
        nodeDivs: {},
        draggingFrom: null,
        tempMousePos: null,
        selectedNodeId: null,
        selectedLinkIndex: null,
        zoom: 1,
        pan: { x: 0, y: 0 },
        lineMode: 'straight',
        showArrow: false,
        showDotted: false
    };

    window._flowEditorDrawAll = () => drawAll(state);

    setupToolbar(state);
    setupPanAndZoom(state);
    setupInputListeners(state);

    drawAll(state);
    createMinimap(state);
    drawCanvasLinks(state);
    enableDotProximityReveal(state);

    window.addEventListener('resize', () => {
        canvasLayer.width = canvasContainer.clientWidth;
        canvasLayer.height = canvasContainer.clientHeight;
        drawCanvasLinks(state);
    });
};

// ─── Full redraw: nodes + links ───────────────────────────────────────────────

function drawAll(state) {
    const vp = state.viewport;
    vp.innerHTML = '';
    state.nodeDivs = {};

    for (const node of state.nodes) {
        // 1) shape + base class
        const cls = ['flow-node'];
        cls.push(SHAPE_STYLES.has(node.shapeType) ? node.shapeType : 'rect');

        // 2) create div
        const div = document.createElement('div');
        div.className = cls.join(' ');
        div.dataset.id = node.id;
        const w = node.width || 100;
        const h = node.height || 50;
        Object.assign(div.style, {
            position: 'absolute',
            left: `${node.x}px`,
            top: `${node.y}px`,
            width: `${w}px`,
            height: `${h}px`,
            boxSizing: 'border-box',
            border: state.selectedNodeId === node.id
                ? '2px solid #2a80ff'
                : '1px solid black',
            backgroundColor: '#f9f9f9',
            textAlign: 'center',
            lineHeight: `${h}px`,
            cursor: 'move',
            userSelect: 'none',
            transition: 'border-color 0.1s'
        });
        div.textContent = node.label;

        div.onclick = e => {
            e.stopPropagation();
            state.selectedNodeId = node.id;
            state.selectedLinkIndex = null;
            drawAll(state);
        };

        // 3) connector-dots
        ['top', 'right', 'bottom', 'left'].forEach(pos => {
            const dot = document.createElement('div');
            dot.className = 'connector-dot';
            dot.dataset.node = node.id;
            dot.dataset.position = pos;
            Object.assign(dot.style, {
                width: '10px',
                height: '10px',
                background: '#555',
                borderRadius: '50%',
                position: 'absolute',
                cursor: 'crosshair',
                transition: 'opacity 0.15s ease-in-out, transform 0.15s ease-in-out'
            });
            // position
            switch (pos) {
                case 'top':
                    dot.style.left = '50%';
                    dot.style.top = '-5px';
                    dot.style.transform = 'translateX(-50%)';
                    break;
                case 'right':
                    dot.style.top = '50%';
                    dot.style.right = '-5px';
                    dot.style.transform = 'translateY(-50%)';
                    break;
                case 'bottom':
                    dot.style.left = '50%';
                    dot.style.bottom = '-5px';
                    dot.style.transform = 'translateX(-50%)';
                    break;
                case 'left':
                    dot.style.top = '50%';
                    dot.style.left = '-5px';
                    dot.style.transform = 'translateY(-50%)';
                    break;
            }

            // only hide truly unconnected ports
            if (!isDotConnected(node.id, pos, state.links)) {
                dot.classList.add('unconnected');
            }

            // highlight selected link ends
            if (state.selectedLinkIndex !== null) {
                const L = state.links[state.selectedLinkIndex];
                if ((L.sourceId === node.id && L.sourcePosition === pos) ||
                    (L.targetId === node.id && L.targetPosition === pos)) {
                    dot.style.background = '#2a80ff';
                    dot.style.boxShadow = '0 0 4px #2a80ff';
                }
            }

            // mousedown: new link or rewire
            dot.onmousedown = e => {
                e.stopPropagation();
                const rect = dot.getBoundingClientRect();
                const canvasRect = state.canvas.getBoundingClientRect();
                const sel = state.selectedLinkIndex;
                const L = sel != null ? state.links[sel] : null;
                const isSrc = sel != null && L.sourceId === node.id && L.sourcePosition === pos;
                const isTgt = sel != null && L.targetId === node.id && L.targetPosition === pos;

                state.draggingFrom = {
                    nodeId: node.id,
                    position: pos,
                    editingLinkIndex: (isSrc || isTgt) ? sel : undefined,
                    editingSide: isSrc ? 'source' : isTgt ? 'target' : undefined
                };
                state.tempMousePos = {
                    x: rect.left + 5 - canvasRect.left,
                    y: rect.top + 5 - canvasRect.top
                };

                document.onmousemove = ev => {
                    const x = ev.pageX - canvasRect.left;
                    const y = ev.pageY - canvasRect.top;
                    state.tempMousePos = {
                        x: (x - state.pan.x) / state.zoom,
                        y: (y - state.pan.y) / state.zoom
                    };
                    drawCanvasLinks(state);
                };

                document.onmouseup = ev => {
                    document.onmousemove = null;
                    document.onmouseup = null;
                    const tgt = document.elementFromPoint(ev.clientX, ev.clientY);
                    if (tgt?.classList.contains('connector-dot')) {
                        const tid = tgt.dataset.node;
                        const tpos = tgt.dataset.position;
                        if (tid) {
                            if (state.draggingFrom.editingLinkIndex != null) {
                                // **rewire:** allow even if same node
                                const idx = state.draggingFrom.editingLinkIndex;
                                if (state.draggingFrom.editingSide === 'source') {
                                    state.links[idx].sourceId = tid;
                                    state.links[idx].sourcePosition = tpos;
                                } else {
                                    state.links[idx].targetId = tid;
                                    state.links[idx].targetPosition = tpos;
                                }
                            } else if (tid !== node.id) {
                                // **new link:** still prevent self-loop
                                state.links.push({
                                    sourceId: node.id,
                                    sourcePosition: pos,
                                    targetId: tid,
                                    targetPosition: tpos
                                });
                            }
                        }
                    }

                    state.draggingFrom = null;
                    state.tempMousePos = null;
                    drawAll(state);
                };
            };

            div.appendChild(dot);
        });

        // 4) drag the node itself
        div.onmousedown = e => {
            if (e.target.classList.contains('connector-dot')) return;
            e.stopPropagation();
            let dragging = true;
            const cRect = state.canvas.getBoundingClientRect();
            const startX = (e.pageX - cRect.left - state.pan.x) / state.zoom;
            const startY = (e.pageY - cRect.top - state.pan.y) / state.zoom;
            const offX = startX - node.x;
            const offY = startY - node.y;

            document.onmousemove = ev => {
                if (!dragging) return;
                const mx = ev.pageX - cRect.left, my = ev.pageY - cRect.top;
                node.x = (mx - state.pan.x) / state.zoom - offX;
                node.y = (my - state.pan.y) / state.zoom - offY;
                div.style.left = `${node.x}px`;
                div.style.top = `${node.y}px`;
                drawCanvasLinks(state);
            };

            document.onmouseup = () => {
                dragging = false;
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };

        vp.appendChild(div);
        state.nodeDivs[node.id] = div;
    }

    drawCanvasLinks(state);
}

// ─── Toolbar & Pan/Zoom (unchanged) ──────────────────────────────────────────
// Copy your existing setupPanAndZoom(state) and setupToolbar(state) here.

// ─── Toolbar & Pan/Zoom (unchanged) ──────────────────────────────────────────
function setupPanAndZoom(state) {
    let isPan = false, sx = 0, sy = 0;
    state.canvas.addEventListener('mousedown', e => {
        if (e.button !== 1) return;
        isPan = true;
        sx = e.clientX - state.pan.x;
        sy = e.clientY - state.pan.y;
        state.canvas.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', e => {
        if (!isPan) return;
        state.pan.x = e.clientX - sx;
        state.pan.y = e.clientY - sy;
        updateTransform(state);
        drawCanvasLinks(state);
    });
    document.addEventListener('mouseup', () => {
        isPan = false;
        state.canvas.style.cursor = 'default';
    });
    state.canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = 1.1;
        const oldZ = state.zoom;
        const delta = e.deltaY < 0 ? factor : 1 / factor;
        const nz = Math.min(3, Math.max(0.2, oldZ * delta));
        const rect = state.canvas.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        state.pan.x = ox - ((ox - state.pan.x) * (nz / oldZ));
        state.pan.y = oy - ((oy - state.pan.y) * (nz / oldZ));
        state.zoom = nz;
        updateTransform(state);
        drawCanvasLinks(state);
    });
}

function updateTransform(state) {
    state.viewport.style.transform = `translate(${state.pan.x}px,${state.pan.y}px) scale(${state.zoom})`;
}

function setupToolbar(state) {
    const tb = state.toolbar;
    tb.innerHTML = '';

    ['Straight', 'Curve', 'Flowchart'].forEach(mode => {
        const btn = document.createElement('button');
        btn.textContent = mode;
        btn.className = 'btn btn-outline-secondary btn-sm me-1';
        btn.onclick = () => {
            state.lineMode = mode.toLowerCase();
            drawCanvasLinks(state);
        };
        tb.appendChild(btn);
    });

    const arrowB = document.createElement('button');
    arrowB.textContent = 'Toggle Arrow';
    arrowB.className = 'btn btn-outline-info btn-sm me-1';
    arrowB.onclick = () => {
        state.showArrow = !state.showArrow;
        arrowB.classList.toggle('btn-info', state.showArrow);
        arrowB.classList.toggle('text-white', state.showArrow);
        drawCanvasLinks(state);
    };
    tb.appendChild(arrowB);

    const dotB = document.createElement('button');
    dotB.textContent = 'Toggle Dotted';
    dotB.className = 'btn btn-outline-info btn-sm';
    dotB.onclick = () => {
        state.showDotted = !state.showDotted;
        dotB.classList.toggle('btn-info', state.showDotted);
        dotB.classList.toggle('text-white', state.showDotted);
        drawCanvasLinks(state);
    };
    tb.appendChild(dotB);

    const addB = document.createElement('button');
    addB.textContent = '+ Add Node';
    addB.className = 'btn btn-success btn-sm ms-2';
    addB.onclick = () => {
        const id = crypto.randomUUID();
        state.nodes.push({ id, label: 'New', x: 200, y: 200 });
        drawAll(state);
    };
    tb.appendChild(addB);
}
