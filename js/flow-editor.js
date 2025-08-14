// ✅ Polyfill for crypto.randomUUID
if (!(window.crypto && typeof window.crypto.randomUUID === 'function')) {
    window.crypto = window.crypto || {};
    window.crypto.randomUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    };
}

window.initFlowEditor = (nodes, links) => {
    const canvasContainer = document.getElementById("flowCanvas");

    // Setup layers
    canvasContainer.innerHTML = `
        <div id="toolbar" style="position:absolute; top:10px; left:10px; z-index:10;"></div>
 <canvas id="linkCanvas" style="position:absolute; top:0; left:0; z-index:0; pointer-events: none;"></canvas>

        <div id="viewport" style="position:absolute; top:0; left:0; width:100%; height:100%; transform-origin: 0 0;"></div>
    `;

    const canvasLayer = canvasContainer.querySelector("#linkCanvas");
    const ctx = canvasLayer.getContext("2d");
    canvasLayer.width = canvasContainer.clientWidth;
    canvasLayer.height = canvasContainer.clientHeight;

    const state = {
        canvas: canvasContainer,
        canvasLayer,
        ctx,
        viewport: canvasContainer.querySelector("#viewport"),
        toolbar: canvasContainer.querySelector("#toolbar"),
        nodes,
        links,
        nodeDivs: {},
        draggingFrom: null,
        tempMousePos: null,
        selectedNodeId: null,
        selectedLinkIndex: null,
        zoom: 1,
        pan: { x: 0, y: 0 },
        lineMode: "straight",
        showArrow: false,
        showDotted: false
    };

    // === Minimap ===
    const minimapContainer = document.createElement("div");
    minimapContainer.style.position = "absolute";
    minimapContainer.style.top = "10px";
    minimapContainer.style.right = "10px";
    minimapContainer.style.width = "200px";
    minimapContainer.style.height = "150px";
    minimapContainer.style.border = "1px solid #ccc";
    minimapContainer.style.background = "#fff";
    minimapContainer.style.zIndex = "50";

    const minimapCanvas = document.createElement("canvas");
    minimapCanvas.width = 200;
    minimapCanvas.height = 150;
    minimapCanvas.style.width = "100%";
    minimapCanvas.style.height = "100%";
    minimapCanvas.id = "minimapCanvas";

    minimapContainer.appendChild(minimapCanvas);
    state.canvas.parentElement.style.position = "relative"; // ensure anchor context
    state.canvas.parentElement.appendChild(minimapContainer);

    // === Save to state ===
    state.minimapCanvas = minimapCanvas;
    state.minimapCtx = minimapCanvas.getContext("2d");


    window._flowEditorDrawAll = () => drawAll(state);

    setupPanAndZoom(state);
    setupToolbar(state);
    setupInputListeners(state);
    drawAll(state);

    window.addEventListener("resize", () => {
        state.canvasLayer.width = canvasContainer.clientWidth;
        state.canvasLayer.height = canvasContainer.clientHeight;
        drawCanvasLinks(state);
    });
};

function updateTransform(state) {
    state.viewport.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    drawMinimap(state);
}

function setupPanAndZoom(state) {
    let isPanning = false;
    let startX = 0, startY = 0;

    state.canvas.addEventListener("mousedown", e => {
        if (e.button !== 1) return;
        isPanning = true;
        startX = e.clientX - state.pan.x;
        startY = e.clientY - state.pan.y;
        state.canvas.style.cursor = "grabbing";
    });

    state.canvas.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;

        const canvasRect = state.canvas.getBoundingClientRect();
        const x = (e.clientX - canvasRect.left - state.pan.x) / state.zoom;
        const y = (e.clientY - canvasRect.top - state.pan.y) / state.zoom;

        // Flag that helps prevent accidental link selection
        state._clickedOnNode = false;

        for (const node of state.nodes) {
            const div = state.nodeDivs[node.id];
            const rect = div.getBoundingClientRect();
            const nodeLeft = (rect.left - canvasRect.left - state.pan.x) / state.zoom;
            const nodeTop = (rect.top - canvasRect.top - state.pan.y) / state.zoom;
            const nodeRight = nodeLeft + rect.width / state.zoom;
            const nodeBottom = nodeTop + rect.height / state.zoom;

            if (x >= nodeLeft && x <= nodeRight && y >= nodeTop && y <= nodeBottom) {
                state._clickedOnNode = true;
                return; // Node was clicked — skip canvas selection
            }
        }

        // ✅ Only test for line selection if not clicking node
        if (!state._clickedOnNode) {
            state.selectedLinkIndex = null;

            for (let i = 0; i < state.links.length; i++) {
                const link = state.links[i];
                const fromNode = state.nodeDivs[link.sourceId];
                const toNode = state.nodeDivs[link.targetId];
                if (!fromNode || !toNode) continue;

                const fromDot = fromNode.querySelector(`.connector-dot[data-position="${link.sourcePosition}"]`);
                const toDot = toNode.querySelector(`.connector-dot[data-position="${link.targetPosition}"]`);
                if (!fromDot || !toDot) continue;

                const p1 = getConnectorWorldPos(fromDot, link.sourcePosition, state);
                const p2 = getConnectorWorldPos(toDot, link.targetPosition, state);

                let dist = Infinity;
                if (state.lineMode === "flowchart") {
                    dist = flowchartDistance(p1, p2, { x, y });
                } else if (state.lineMode === "curve") {
                    const fromDir = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[link.sourcePosition];
                    const toDir = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[link.targetPosition];
                    dist = bezierDistance(p1, p2, fromDir, toDir, { x, y });
                } else {
                    dist = distanceToLine(p1, p2, { x, y });
                }

                if (dist < 8) {
                    state.selectedLinkIndex = i;
                    state.selectedNodeId = null;
                    drawAll(state);
                    return;
                }
            }

            // ✅ Clicked empty canvas — clear all selection
            state.selectedNodeId = null;
            state.selectedLinkIndex = null;
            drawAll(state);
        }
    });


    document.addEventListener("mousemove", e => {
        if (!isPanning) return;
        state.pan.x = e.clientX - startX;
        state.pan.y = e.clientY - startY;
        updateTransform(state);
        drawCanvasLinks(state);
    });

    document.addEventListener("mouseup", () => {
        isPanning = false;
        state.canvas.style.cursor = "default";
    });

    state.canvas.addEventListener("wheel", e => {
        e.preventDefault();
        const zoomFactor = 1.1;
        const scaleDelta = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
        const oldZoom = state.zoom;
        const newZoom = Math.max(0.2, Math.min(3, oldZoom * scaleDelta));

        const rect = state.canvas.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        state.pan.x = offsetX - ((offsetX - state.pan.x) * (newZoom / oldZoom));
        state.pan.y = offsetY - ((offsetY - state.pan.y) * (newZoom / oldZoom));
        state.zoom = newZoom;
        updateTransform(state);
        drawCanvasLinks(state);
    });
}

function setupToolbar(state) {
    const toolbar = state.toolbar;
    toolbar.innerHTML = "";

    ["Straight", "Curve", "Flowchart"].forEach(mode => {
        const btn = document.createElement("button");
        btn.textContent = mode;
        btn.className = "btn btn-outline-secondary btn-sm me-1";
        btn.onclick = () => {
            state.lineMode = mode.toLowerCase();
            drawCanvasLinks(state);
        };
        toolbar.appendChild(btn);
    });

    const arrowToggle = document.createElement("button");
    arrowToggle.textContent = "Toggle Arrow";
    arrowToggle.className = "btn btn-outline-info btn-sm me-1";
    arrowToggle.onclick = () => {
        state.showArrow = !state.showArrow;
        arrowToggle.classList.toggle("btn-info", state.showArrow);
        arrowToggle.classList.toggle("text-white", state.showArrow);
        drawCanvasLinks(state);
    };
    toolbar.appendChild(arrowToggle);

    const dottedToggle = document.createElement("button");
    dottedToggle.textContent = "Toggle Dotted";
    dottedToggle.className = "btn btn-outline-info btn-sm";
    dottedToggle.onclick = () => {
        state.showDotted = !state.showDotted;
        dottedToggle.classList.toggle("btn-info", state.showDotted);
        dottedToggle.classList.toggle("text-white", state.showDotted);
        drawCanvasLinks(state);
    };
    toolbar.appendChild(dottedToggle);

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add Node";
    addBtn.className = "btn btn-success btn-sm ms-2";
    addBtn.onclick = () => {
        const newId = crypto.randomUUID();
        state.nodes.push({ id: newId, label: "New", x: 200, y: 200 });
        drawAll(state);
    };
    toolbar.appendChild(addBtn);
}
function drawAll(state) {
    state.viewport.innerHTML = "";
    state.nodeDivs = {};

    for (const node of state.nodes) {
        const div = document.createElement("div");
        div.className = "flow-node";
        div.setAttribute("data-id", node.id);
        div.style.position = "absolute";
        div.style.left = node.x + "px";
        div.style.top = node.y + "px";
        div.style.width = "100px";
        div.style.height = "50px";
        div.style.boxSizing = "border-box"; // ✅ prevent size change on border
        div.style.border = "1px solid " + (state.selectedNodeId === node.id ? "#2a80ff" : "black");
        div.style.backgroundColor = "#f9f9f9";
        div.style.textAlign = "center";
        div.style.lineHeight = "50px";
        div.style.cursor = "move";
        div.style.userSelect = "none";
        div.textContent = node.label;


        div.onclick = (e) => {
            e.stopPropagation();
            state.selectedNodeId = node.id;
            state.selectedLinkIndex = null;
            drawAll(state);
        };

        state.viewport.appendChild(div);
        state.nodeDivs[node.id] = div;

        const nodeWidth = 100;
        const nodeHeight = 50;
        const dotSize = 10;

        ["top", "right", "bottom", "left"].forEach(pos => {
            const dot = document.createElement("div");
            dot.className = "connector-dot";
            dot.setAttribute("data-node", node.id);
            dot.setAttribute("data-position", pos);
            dot.style.width = `${dotSize}px`;
            dot.style.height = `${dotSize}px`;
            dot.style.background = "#555";
            dot.style.borderRadius = "50%";
            dot.style.position = "absolute";
            dot.style.cursor = "crosshair";

            // Rounded center offsets
            const centerLeft = Math.round((nodeWidth - dotSize) / 2);
            const centerTop = Math.round((nodeHeight - dotSize) / 2);

            switch (pos) {
                case "top":
                    dot.style.left = `${(nodeWidth - dotSize) / 2}px`;
                    dot.style.top = `${-dotSize / 2}px`;
                    break;
                case "right":
                   // dot.style.left = `${nodeWidth - dotSize / 2}px`; // ⛔ Wrong
                    // ✅ Correct:
                    dot.style.left = `${nodeWidth - dotSize / 2}px`;
                    dot.style.top = `${(nodeHeight - dotSize) / 2}px`;
                    break;
                case "bottom":
                    dot.style.left = `${(nodeWidth - dotSize) / 2}px`;
                    // ⛔ dot.style.top = `${nodeHeight - Math.round(dotSize / 2)}px`;
                    // ✅ Correct:
                    dot.style.top = `${nodeHeight - dotSize / 1.8}px`;
                    break;
                case "left":
                    dot.style.left = `${-dotSize / 2}px`;
                    dot.style.top = `${(nodeHeight - dotSize) / 2}px`;
                    break;
            }

            // Highlight if selected
            const isSourceOfSelected =
                state.selectedLinkIndex !== null &&
                state.links[state.selectedLinkIndex].sourceId === node.id &&
                state.links[state.selectedLinkIndex].sourcePosition === pos;

            const isTargetOfSelected =
                state.selectedLinkIndex !== null &&
                state.links[state.selectedLinkIndex].targetId === node.id &&
                state.links[state.selectedLinkIndex].targetPosition === pos;

            if (isSourceOfSelected || isTargetOfSelected) {
                dot.style.background = "#2a80ff";
                dot.style.boxShadow = "0 0 4px #2a80ff";
            }

            dot.onmousedown = (e) => {
                e.stopPropagation();
                const canvasRect = state.canvas.getBoundingClientRect();
                const rect = dot.getBoundingClientRect();

                const isEditingSource = isSourceOfSelected;
                const isEditingTarget = isTargetOfSelected;

                if (isEditingSource || isEditingTarget) {
                    const index = state.selectedLinkIndex;
                    const otherEnd = isEditingSource ? "target" : "source";

                    state.draggingFrom = {
                        nodeId: isEditingSource
                            ? state.links[index].targetId
                            : state.links[index].sourceId,
                        position: isEditingSource
                            ? state.links[index].targetPosition
                            : state.links[index].sourcePosition,
                        editingLinkIndex: index,
                        editingSide: isEditingSource ? "source" : "target"
                    };

                    state.tempMousePos = {
                        x: rect.left + 5 - canvasRect.left,
                        y: rect.top + 5 - canvasRect.top
                    };

                    document.onmousemove = (eMove) => {
                        const x = eMove.pageX - canvasRect.left;
                        const y = eMove.pageY - canvasRect.top;
                        state.tempMousePos = { x, y };
                        drawCanvasLinks(state);
                    };

                    document.onmouseup = (eUp) => {
                        document.onmousemove = null;
                        document.onmouseup = null;

                        const target = document.elementFromPoint(eUp.clientX, eUp.clientY);
                        if (target?.classList.contains("connector-dot")) {
                            const targetId = target.getAttribute("data-node");
                            const targetPos = target.getAttribute("data-position");

                            if (targetId) {
                                if (state.draggingFrom.editingSide === "target") {
                                    state.links[index].targetId = targetId;
                                    state.links[index].targetPosition = targetPos;
                                } else {
                                    state.links[index].sourceId = targetId;
                                    state.links[index].sourcePosition = targetPos;
                                }
                            }
                        }

                        state.draggingFrom = null;
                        state.tempMousePos = null;
                        drawAll(state);
                    };
                } else {
                    // create new link
                    const rect = dot.getBoundingClientRect();
                    state.draggingFrom = {
                        nodeId: node.id,
                        position: pos,
                        startX: rect.left + 5 - canvasRect.left,
                        startY: rect.top + 5 - canvasRect.top
                    };
                    state.tempMousePos = {
                        x: state.draggingFrom.startX,
                        y: state.draggingFrom.startY
                    };

                    document.onmousemove = (eMove) => {
                        //const x = eMove.pageX - canvasRect.left;
                        //const y = eMove.pageY - canvasRect.top;
                        //state.tempMousePos = { x, y };
                        const viewX = eMove.pageX - canvasRect.left;
                        const viewY = eMove.pageY - canvasRect.top;

                        state.tempMousePos = {
                            x: (viewX - state.pan.x) / state.zoom,
                            y: (viewY - state.pan.y) / state.zoom
                        };
                        drawCanvasLinks(state);
                    };

                    document.onmouseup = (eUp) => {
                        document.onmousemove = null;
                        document.onmouseup = null;

                        const target = document.elementFromPoint(eUp.clientX, eUp.clientY);
                        if (target?.classList.contains("connector-dot")) {
                            const targetId = target.getAttribute("data-node");
                            const targetPos = target.getAttribute("data-position");

                            if (targetId && targetId !== node.id) {
                                state.links.push({
                                    sourceId: node.id,
                                    sourcePosition: pos,
                                    targetId,
                                    targetPosition: targetPos
                                });
                            }
                        }

                        state.draggingFrom = null;
                        state.tempMousePos = null;
                        drawAll(state);
                    };
                }
            };

            div.appendChild(dot);
        });

        // === Node drag logic ===
        let isDragging = false;
        let offsetX = 0, offsetY = 0;

        div.onmousedown = (e) => {

            if (e.target.classList.contains("connector-dot")) return;
            isDragging = true;

            const canvasRect = state.canvas.getBoundingClientRect();
            const viewX = e.pageX - canvasRect.left;
            const viewY = e.pageY - canvasRect.top;
            const trueX = (viewX - state.pan.x) / state.zoom;
            const trueY = (viewY - state.pan.y) / state.zoom;
            offsetX = trueX - node.x;
            offsetY = trueY - node.y;

            document.onmousemove = (eMove) => {
                if (!isDragging) return;
                const mx = eMove.pageX - canvasRect.left;
                const my = eMove.pageY - canvasRect.top;
                node.x = (mx - state.pan.x) / state.zoom - offsetX;
                node.y = (my - state.pan.y) / state.zoom - offsetY;
                div.style.left = `${node.x}px`;
                div.style.top = `${node.y}px`;
                drawCanvasLinks(state);
            };

            document.onmouseup = () => {
                isDragging = false;
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };
    }

    drawCanvasLinks(state);
    drawMinimap(state);
}

function drawCanvasLinks(state) {
    const ctx = state.ctx;
    const canvas = state.canvasLayer;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    const canvasRect = state.canvas.getBoundingClientRect();

    for (let i = 0; i < state.links.length; i++) {
        const link = state.links[i];
        const fromNode = state.nodeDivs[link.sourceId];
        const toNode = state.nodeDivs[link.targetId];
        if (!fromNode || !toNode) continue;

        const fromDot = fromNode.querySelector(`.connector-dot[data-position="${link.sourcePosition}"]`);
        const toDot = toNode.querySelector(`.connector-dot[data-position="${link.targetPosition}"]`);
        if (!fromDot || !toDot) continue;

        const p1 = getConnectorWorldPos(fromDot, link.sourcePosition, state);
        const p2 = getConnectorWorldPos(toDot, link.targetPosition, state);

        drawLinkLine(ctx, p1, p2, link, state, i);
    }

    // 🟡 If dragging an endpoint
    if (state.draggingEndpoint && state.tempMousePos) {
        const link = state.links[state.draggingEndpoint.linkIndex];
        const fromNode = state.nodeDivs[link.sourceId];
        const toNode = state.nodeDivs[link.targetId];

        const fixedDot = (state.draggingEndpoint.isSource ? toNode : fromNode)
            ?.querySelector(`.connector-dot[data-position="${state.draggingEndpoint.isSource ? link.targetPosition : link.sourcePosition}"]`);
        if (!fixedDot) return;

        const fixedPos = getConnectorWorldPos(fixedDot, "", state);
        const dragPos = state.tempMousePos;

        const p1 = state.draggingEndpoint.isSource ? dragPos : fixedPos;
        const p2 = state.draggingEndpoint.isSource ? fixedPos : dragPos;

        drawLinkLine(ctx, p1, p2, null, state, -1);
    }

    ctx.restore();
    drawMinimap(state);
}

function drawCanvasLinks(state) {
    const ctx = state.ctx;
    const canvas = state.canvasLayer;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    for (let i = 0; i < state.links.length; i++) {
        const link = state.links[i];
        const fromNode = state.nodeDivs[link.sourceId];
        const toNode = state.nodeDivs[link.targetId];
        if (!fromNode || !toNode) continue;

        const fromDot = fromNode.querySelector(`.connector-dot[data-position="${link.sourcePosition}"]`);
        const toDot = toNode.querySelector(`.connector-dot[data-position="${link.targetPosition}"]`);
        if (!fromDot || !toDot) continue;

        const p1 = getConnectorWorldPos(fromDot, link.sourcePosition, state);
        const p2 = getConnectorWorldPos(toDot, link.targetPosition, state);

        drawLinkLine(ctx, p1, p2, link, state, i);
    }

    // 🟡 Live update when editing link source/target
    if (state.draggingFrom && state.tempMousePos && state.draggingFrom.editingLinkIndex !== undefined) {
        const link = state.links[state.draggingFrom.editingLinkIndex];
        const otherNode = state.nodeDivs[state.draggingFrom.nodeId];
        if (otherNode) {
            const dot = otherNode.querySelector(`.connector-dot[data-position="${state.draggingFrom.position}"]`);
            if (dot) {
                const fixed = getConnectorWorldPos(dot, "", state);
                const ghost = state.tempMousePos;
                const p1 = (state.draggingFrom.editingSide === "source") ? ghost : fixed;
                const p2 = (state.draggingFrom.editingSide === "source") ? fixed : ghost;
                drawLinkLine(ctx, p1, p2, null, state, -1);
            }
        }
    }

    // 🟡 Ghost line when creating a new link
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

    ctx.restore();
    drawMinimap(state);
}



function getConnectorWorldPos(dotEl, _direction, state) {
    const rect = dotEl.getBoundingClientRect();
    const canvasRect = state.canvas.getBoundingClientRect();

    return {
        x: (rect.left + rect.width / 2 - canvasRect.left - state.pan.x) / state.zoom,
        y: (rect.top + rect.height / 2 - canvasRect.top - state.pan.y) / state.zoom
    };
}
function drawLinkLine(ctx, p1, p2, link, state, index) {
    const fromDir = link ? { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[link.sourcePosition] : [0, 0];
    const toDir = link ? { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[link.targetPosition] : [0, 0];

    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;

    ctx.beginPath();
    ctx.lineWidth = (link && state.selectedLinkIndex === index) ? 4 : 2;
    ctx.strokeStyle = (link && state.selectedLinkIndex === index) ? "#2a80ff" : "#333";
    ctx.setLineDash(state.showDotted ? [4, 4] : []);

    let arrowAngle = 0;
    let arrowX = x2;
    let arrowY = y2;
    const arrowOffset = 3.5;
    if (state.lineMode === "flowchart") {
        let stubLen = 20;

        const availableX = Math.abs(x2 - x1);
        const availableY = Math.abs(y2 - y1);

        if (fromDir[0] !== 0) {
            // Horizontal stub (left or right)
            stubLen = Math.min(stubLen, availableX / 2 - 5);
        } else {
            // Vertical stub (top or bottom)
            stubLen = Math.min(stubLen, availableY / 2 - 5);
        }

        // Prevent negative stubs (flip line entirely if needed)
        stubLen = Math.max(stubLen, 4);


        // Stub away from source
        const startStubX = x1 + fromDir[0] * stubLen;
        const startStubY = y1 + fromDir[1] * stubLen;

        // Stub toward target
        const endStubX = x2 + toDir[0] * stubLen;
        const endStubY = y2 + toDir[1] * stubLen;

        // Midpoint between stub lines
        const midX = (startStubX + endStubX) / 2;
        const midY = (startStubY + endStubY) / 2;

        ctx.moveTo(x1, y1);
        ctx.lineTo(startStubX, startStubY);

        if (fromDir[0] !== 0) {
            // Horizontal start, draw H-V-H-V
            ctx.lineTo(midX, startStubY);
            ctx.lineTo(midX, endStubY);
            ctx.lineTo(endStubX, endStubY);
        } else {
            // Vertical start, draw V-H-V-H
            ctx.lineTo(startStubX, midY);
            ctx.lineTo(endStubX, midY);
            ctx.lineTo(endStubX, endStubY);
        }

        ctx.lineTo(x2, y2);

        // Set arrow angle from last segment (endStub → x2/y2)
        arrowAngle = Math.atan2(y2 - endStubY, x2 - endStubX);
        arrowX = x2 - Math.cos(arrowAngle) * arrowOffset;
        arrowY = y2 - Math.sin(arrowAngle) * arrowOffset;
    }


    else if (state.lineMode === "curve") {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        const ctrlLen = Math.min(dist * 0.5, 100);

        const cx1 = x1 + fromDir[0] * ctrlLen;
        const cy1 = y1 + fromDir[1] * ctrlLen;
        const cx2 = x2 + toDir[0] * ctrlLen;
        const cy2 = y2 + toDir[1] * ctrlLen;

        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);

        arrowAngle = Math.atan2(y2 - cy2, x2 - cx2);
        arrowX = x2 - Math.cos(arrowAngle) * arrowOffset;
        arrowY = y2 - Math.sin(arrowAngle) * arrowOffset;

    } else {
        // Straight
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        const dx = x2 - x1;
        const dy = y2 - y1;
        arrowAngle = Math.atan2(dy, dx);
        arrowX = x2 - Math.cos(arrowAngle) * arrowOffset;
        arrowY = y2 - Math.sin(arrowAngle) * arrowOffset;
    }

    ctx.stroke();

    if (state.showArrow) {
        drawArrowhead(ctx, arrowX, arrowY, arrowAngle, ctx.strokeStyle);
    }
}


function drawArrowhead(ctx, x, y, angle, color) {
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

function setupInputListeners(state) {
    document.addEventListener("keydown", (e) => {
        if (e.key === "Delete") {
            if (state.selectedNodeId) {
                const idx = state.nodes.findIndex(n => n.id === state.selectedNodeId);
                if (idx !== -1) {
                    state.nodes.splice(idx, 1);
                    state.links = state.links.filter(l => l.sourceId !== state.selectedNodeId && l.targetId !== state.selectedNodeId);
                }
                state.selectedNodeId = null;
            } else if (state.selectedLinkIndex !== null) {
                state.links.splice(state.selectedLinkIndex, 1);
                state.selectedLinkIndex = null;
            }
            drawAll(state);
        }
    });

    state.canvas.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;

        const canvasRect = state.canvas.getBoundingClientRect();
        const x = (e.clientX - canvasRect.left - state.pan.x) / state.zoom;
        const y = (e.clientY - canvasRect.top - state.pan.y) / state.zoom;

        // === 🔒 Prioritize node hit first
        for (const node of state.nodes) {
            const div = state.nodeDivs[node.id];
            const rect = div.getBoundingClientRect();
            const nodeLeft = (rect.left - canvasRect.left - state.pan.x) / state.zoom;
            const nodeTop = (rect.top - canvasRect.top - state.pan.y) / state.zoom;
            const nodeRight = nodeLeft + rect.width / state.zoom;
            const nodeBottom = nodeTop + rect.height / state.zoom;

            if (x >= nodeLeft && x <= nodeRight && y >= nodeTop && y <= nodeBottom) {
                // ✅ Hit node — select and enable dragging
                state.selectedNodeId = node.id;
                state.selectedLinkIndex = null;
                drawAll(state);

                // Enable drag on canvas mousedown instead of only inside drawAll()
                let offsetX = x - node.x;
                let offsetY = y - node.y;

                const onMove = (eMove) => {
                    const mx = (eMove.clientX - canvasRect.left - state.pan.x) / state.zoom;
                    const my = (eMove.clientY - canvasRect.top - state.pan.y) / state.zoom;
                    node.x = mx - offsetX;
                    node.y = my - offsetY;

                    const nodeDiv = state.nodeDivs[node.id];
                    if (nodeDiv) {
                        nodeDiv.style.left = `${node.x}px`;
                        nodeDiv.style.top = `${node.y}px`;
                    }

                    drawCanvasLinks(state);
                    drawMinimap(state);
                };

                const onUp = () => {
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                };

                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
                return;
            }

        }

        // === 🎯 Try to select a line only if no node was hit
        state.selectedLinkIndex = null;

        for (let i = 0; i < state.links.length; i++) {
            const link = state.links[i];
            const fromNode = state.nodeDivs[link.sourceId];
            const toNode = state.nodeDivs[link.targetId];
            if (!fromNode || !toNode) continue;

            const fromDot = fromNode.querySelector(`.connector-dot[data-position="${link.sourcePosition}"]`);
            const toDot = toNode.querySelector(`.connector-dot[data-position="${link.targetPosition}"]`);
            if (!fromDot || !toDot) continue;

            const p1 = getConnectorWorldPos(fromDot, link.sourcePosition, state);
            const p2 = getConnectorWorldPos(toDot, link.targetPosition, state);

            let dist = Infinity;
            if (state.lineMode === "flowchart") {
                dist = flowchartDistance(p1, p2, { x, y });
            } else if (state.lineMode === "curve") {
                const fromDir = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[link.sourcePosition];
                const toDir = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[link.targetPosition];
                dist = bezierDistance(p1, p2, fromDir, toDir, { x, y });
            } else {
                dist = distanceToLine(p1, p2, { x, y });
            }

            if (dist < 8) {
                state.selectedLinkIndex = i;
                state.selectedNodeId = null;
                drawAll(state);
                return;
            }
        }

        // ✅ Clicked blank canvas — clear all selections
        state.selectedNodeId = null;
        state.selectedLinkIndex = null;
        drawAll(state);
    });


}

function drawMinimap(state) {
    if (!state.minimapCtx || !state.minimapCanvas) return;

    const ctx = state.minimapCtx;
    const canvas = state.minimapCanvas;
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Determine world bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    state.nodes.forEach(node => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + 150);
        maxY = Math.max(maxY, node.y + 60);
    });

    if (minX === Infinity) return;

    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;

    const scaleX = w / worldWidth;
    const scaleY = h / worldHeight;
    const scale = Math.min(scaleX, scaleY);

    // Store for click-pan later
    state.minimapScale = scale;
    state.minimapOffset = { x: minX, y: minY };

    // Draw nodes
    ctx.fillStyle = "#333";
    for (const node of state.nodes) {
        const x = (node.x - minX) * scale;
        const y = (node.y - minY) * scale;
        const width = 150 * scale;
        const height = 60 * scale;
        ctx.fillRect(x, y, width, height);
    }

    // === Correct viewport rectangle ===
    const viewLeft = -state.pan.x / state.zoom;
    const viewTop = -state.pan.y / state.zoom;
    const viewRight = viewLeft + state.canvas.clientWidth / state.zoom;
    const viewBottom = viewTop + state.canvas.clientHeight / state.zoom;

    const viewX = (viewLeft - minX) * scale;
    const viewY = (viewTop - minY) * scale;
    const viewW = (viewRight - viewLeft) * scale;
    const viewH = (viewBottom - viewTop) * scale;

    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(viewX, viewY, viewW, viewH);

}

function distanceToLine(p1, p2, pt) {
    const A = pt.x - p1.x;
    const B = pt.y - p1.y;
    const C = p2.x - p1.x;
    const D = p2.y - p1.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;

    let xx, yy;
    if (param < 0) {
        xx = p1.x;
        yy = p1.y;
    } else if (param > 1) {
        xx = p2.x;
        yy = p2.y;
    } else {
        xx = p1.x + param * C;
        yy = p1.y + param * D;
    }

    const dx = pt.x - xx;
    const dy = pt.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function bezierPoint(p0, p1, p2, p3, t) {
    return (1 - t) ** 3 * p0 +
        3 * (1 - t) ** 2 * t * p1 +
        3 * (1 - t) * t ** 2 * p2 +
        t ** 3 * p3;
}

function bezierDistance(p1, p2, fromDir, toDir, pt) {
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
        const dx = pt.x - x;
        const dy = pt.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 8) return dist; // early hit
        minDist = Math.min(minDist, dist);
    }
    return minDist;
}


function flowchartDistance(p1, p2, pt) {
    const midX = (p1.x + p2.x) / 2;

    const seg1 = distanceToLine(p1, { x: midX, y: p1.y }, pt);
    const seg2 = distanceToLine({ x: midX, y: p1.y }, { x: midX, y: p2.y }, pt);
    const seg3 = distanceToLine({ x: midX, y: p2.y }, p2, pt);

    return Math.min(seg1, seg2, seg3);
}
