window.gerberViewer = (() => {
    let offsetX = 0, offsetY = 0;
    let scale = 1;
    let isPanning = false;
    let startX = 0, startY = 0;

    let selectedPads = [];

    function applyWrapperTransform() {
        const svgElement = document.querySelector('svg');
        if (!svgElement) return;
        svgElement.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        svgElement.style.transformOrigin = 'center center';
    }

    function togglePadSelection(el, ctrlPressed) {
        const key = `${el.dataset.x},${el.dataset.y}`;

        if (!ctrlPressed) {
            // Clear all previous
            document.querySelectorAll(".flash-pad").forEach(p => p.setAttribute("stroke", "black"));
            selectedPads = [];
        }

        const index = selectedPads.indexOf(key);

        if (index >= 0) {
            selectedPads.splice(index, 1);
            el.setAttribute("stroke", "black");
        } else {
            selectedPads.push(key);
            el.setAttribute("stroke", "cyan");
        }
    }

    document.addEventListener("click", function (e) {
        if (e.target.classList.contains("flash-pad")) {
            togglePadSelection(e.target, e.ctrlKey);
        }

        // XY Dot click handler
        const dotGroup = e.target.closest(".xy-dot");
        if (dotGroup) {
            gerberViewer.alignXYDot(dotGroup);
        }
    });

    return {
        panZoomInit: function () {
            const container = document.getElementById("svg-container");
            if (!container) return;

            container.addEventListener("wheel", function (e) {
                e.preventDefault();
                const zoomFactor = 0.1;
                scale += (e.deltaY < 0 ? zoomFactor : -zoomFactor);
                scale = Math.max(0.2, Math.min(20, scale));
                applyWrapperTransform();
            });

            container.addEventListener("mousedown", function (e) {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
            });

            container.addEventListener("mouseup", () => isPanning = false);
            container.addEventListener("mouseleave", () => isPanning = false);

            container.addEventListener("mousemove", function (e) {
                if (!isPanning) return;
                offsetX += e.clientX - startX;
                offsetY += e.clientY - startY;
                startX = e.clientX;
                startY = e.clientY;
                applyWrapperTransform();
            });

            this.centerSvg();
        },

        centerSvg: function () {
            const container = document.getElementById("svg-container");
            if (!container) return;

            const svgElement = document.querySelector('svg');
            if (!svgElement) return;

            const bounds = svgElement.getBoundingClientRect();
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;

            offsetX = (containerWidth / 2) - (bounds.width / 2);
            offsetY = (containerHeight / 2) - (bounds.height / 2);
            scale = 1;

            applyWrapperTransform();
        },

        resetView: function () {
            offsetX = 0;
            offsetY = 0;
            scale = 1;
            this.centerSvg();
        },

        exportSvg: function () {
            const svg = document.querySelector("svg");

            const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${svg.getAttribute("width") || '100%'}"
     height="${svg.getAttribute("height") || '100%'}"
     viewBox="${svg.getAttribute("viewBox") || ''}"
     preserveAspectRatio="xMidYMid meet">
    ${svg.innerHTML}
</svg>`;

            const blob = new Blob([fullSvg], { type: 'image/svg+xml' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'gerber-file.svg';
            link.click();
        },

        setSvgTransform: function (newRotation, newFlip) {
            rotation = newRotation;
            flip = newFlip;

            const mainTransform = document.querySelector("svg > g#main-transform");

            if (mainTransform) {
                const bbox = mainTransform.getBBox();
                const cx = bbox.x + bbox.width / 2;
                const cy = bbox.y + bbox.height / 2;

                let transform = `translate(${cx}, ${cy})`;

                if (rotation !== 0) {
                    transform += ` rotate(${rotation})`;
                }

                if (flip) {
                    transform += ` scale(-1, 1)`;
                }

                transform += ` translate(${-cx}, ${-cy})`;

                mainTransform.setAttribute("transform", transform.trim());
            }
        },

        initSortableLayers: function (dotNetRef) {
            const el = document.getElementById("layer-list");

            new Sortable(el, {
                handle: ".drag-handle",
                animation: 150,
                onStart: () => {
                    el.querySelectorAll("input").forEach(i => i.disabled = true);
                },
                onEnd: function () {
                    el.querySelectorAll("input").forEach(i => i.disabled = false);

                    const newOrder = Array.from(el.children).map((li, index) => {
                        return {
                            id: li.getAttribute("data-id"),
                            index: index
                        };
                    });

                    dotNetRef.invokeMethodAsync("ReorderLayers", newOrder);
                }
            });
        },

        setXYTransform: function (offsetX, offsetY, rotation, flip) {
            const xyGroup = document.querySelector("#xy-transform");
            if (!xyGroup) return;

            let transform = `translate(${offsetX}, ${offsetY})`;

            if (rotation !== 0) {
                transform += ` rotate(${rotation})`;
            }

            if (flip) {
                transform += ` scale(-1, 1)`;
            }

            xyGroup.setAttribute("transform", transform.trim());
        },

        alignXYDot: function (el, partName) {
            if (selectedPads.length !== 2) {
                alert("Select exactly two pads first.");
                return;
            }

            const [p1, p2] = selectedPads.map(p => p.split(',').map(parseFloat));
            const midX = (p1[0] + p2[0]) / 2;
            const midY = (p1[1] + p2[1]) / 2;

            const circle = el.querySelector("circle");
            const dx = midX - parseFloat(circle.getAttribute("cx"));
            const dy = midY - parseFloat(circle.getAttribute("cy"));

            const xyGroup = document.getElementById("xy-transform");
            const prev = xyGroup.getAttribute("transform") || "";
            xyGroup.setAttribute("transform", `${prev} translate(${dx}, ${dy})`.trim());

            console.log(`Aligned ${partName} to midpoint (${midX}, ${midY})`);
        },

        alignXYDot: function (dotEl) {
            if (selectedPads.length !== 2) {
                alert("Select exactly two pads first.");
                return;
            }

            // Compute midpoint between two selected pads
            const [p1, p2] = selectedPads.map(p => p.split(',').map(parseFloat));
            const midX = (p1[0] + p2[0]) / 2;
            const midY = (p1[1] + p2[1]) / 2;

            // XY dot's current position
            const cx = parseFloat(dotEl.dataset.x);
            const cy = parseFloat(dotEl.dataset.y);

            // Difference needed to move the dot
            const dx = midX - cx;
            const dy = midY - cy;

            // Update the overall XY group transform
            const xyGroup = document.getElementById("xy-transform");
            const prevTransform = xyGroup.getAttribute("transform") || "";

            // If an existing translate exists, sum the deltas
            const match = prevTransform.match(/translate\(\s*([^)]+)\s*\)/);
            let newTransform;

            if (match) {
                const [prevX, prevY] = match[1].split(',').map(parseFloat);
                newTransform = prevTransform.replace(
                    /translate\([^)]+\)/,
                    `translate(${(prevX + dx).toFixed(4)}, ${(prevY + dy).toFixed(4)})`
                );
            } else {
                newTransform = `${prevTransform} translate(${dx.toFixed(4)}, ${dy.toFixed(4)})`.trim();
            }

            xyGroup.setAttribute("transform", newTransform);
            console.log(`Moved '${dotEl.dataset.name}' to midpoint (${midX.toFixed(2)}, ${midY.toFixed(2)})`);
        }



    };
})();
