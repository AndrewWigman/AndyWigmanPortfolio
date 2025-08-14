window.customDataGrid = {
    makeColumnsResizable: function (tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;

        const headers = table.querySelectorAll("th");

        headers.forEach((header, index) => {
            const resizer = header.querySelector('.resizer');
            if (!resizer) return;

            let startX, startWidth;

            const onMouseMove = (event) => {
                const newWidth = startWidth + (event.pageX - startX);
                header.style.width = `${newWidth}px`;
                header.style.minWidth = `${newWidth}px`;

                const cells = table.querySelectorAll(`tbody tr td:nth-child(${index + 1})`);
                cells.forEach(cell => {
                    cell.style.width = `${newWidth}px`;
                    cell.style.minWidth = `${newWidth}px`;
                });
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            resizer.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                startX = e.pageX;
                startWidth = header.offsetWidth;

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            resizer.addEventListener('dblclick', () => {
                let maxWidth = 0;

                const getTextWidth = (text) => {
                    const span = document.createElement('span');
                    span.style.position = 'absolute';
                    span.style.whiteSpace = 'nowrap';
                    span.style.visibility = 'hidden';
                    span.textContent = text;
                    document.body.appendChild(span);
                    const width = span.offsetWidth;
                    document.body.removeChild(span);
                    return width;
                };

                maxWidth = Math.max(maxWidth, getTextWidth(header.textContent));

                const cells = table.querySelectorAll(`tbody tr td:nth-child(${index + 1})`);
                cells.forEach(cell => {
                    maxWidth = Math.max(maxWidth, getTextWidth(cell.textContent));
                });

                maxWidth += 20;
                header.style.width = `${maxWidth}px`;
                header.style.minWidth = `${maxWidth}px`;
                cells.forEach(cell => {
                    cell.style.width = `${maxWidth}px`;
                    cell.style.minWidth = `${maxWidth}px`;
                });
            });
        });
    }
};
