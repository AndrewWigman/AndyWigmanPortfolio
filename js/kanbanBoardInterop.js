window.kanbanBoardInterop = {
    dotNetHelper: null,

    init: function (dotNetRef) {
        this.dotNetHelper = dotNetRef;
    },

    renderBoard: function (data) {
        const { tasks, columns, currentUserId, boardOwnerId, isEditMode = false, disableAddTask = false } = data;
        const root = document.getElementById('kanban-root');
        root.innerHTML = '';

        const columnMap = {};

        columns.forEach(col => {
            const colDiv = document.createElement('div');
            colDiv.className = 'kanban-column';
            colDiv.dataset.column = col.name;

            // Header container
            const header = document.createElement('div');
            header.className = 'kanban-header';

            // Header top row: ≡ Title 🗑
            const headerTop = document.createElement('div');
            headerTop.className = 'kanban-header-top';

            // Drag handle - only show if edit mode
            const dragHandle = document.createElement('div');
            dragHandle.className = 'column-drag-handle';
            dragHandle.innerHTML = '≡';
            dragHandle.setAttribute('draggable', 'true');
            dragHandle.style.display = isEditMode ? 'inline-block' : 'none';
            dragHandle.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/column', col.name);
                colDiv.classList.add('dragging');
            });
            dragHandle.addEventListener('dragend', () => {
                colDiv.classList.remove('dragging');
            });

            // Column title (dblclick to rename)
            const title = document.createElement('div');
            title.className = 'kanban-header-title';
            title.innerText = col.name;
            title.style.cursor = isEditMode ? 'pointer' : 'default';
            title.ondblclick = () => {
                if (!isEditMode) return; // prevent rename if not edit mode
                const newName = prompt("Rename column:", col.name);
                if (newName && newName.trim() !== col.name) {
                    kanbanBoardInterop.dotNetHelper.invokeMethodAsync("RenameColumn", col.name, newName.trim());
                }
            };

            // Delete column button - only show if edit mode AND no tasks in column
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-col-btn';
            deleteBtn.innerText = '🗑';
            const colHasTasks = tasks.some(t => t.columnName === col.name);
            deleteBtn.style.display = (colHasTasks || !isEditMode) ? 'none' : 'inline-block';
            deleteBtn.onclick = () => {
                kanbanBoardInterop.dotNetHelper.invokeMethodAsync("DeleteColumn", col.name);
            };

            headerTop.appendChild(dragHandle);
            headerTop.appendChild(title);
            headerTop.appendChild(deleteBtn);

            // Header bottom row: add task button
            const headerBottom = document.createElement('div');
            headerBottom.className = 'kanban-header-bottom';

            // Show add task button if:
            // - user is owner/admin (always)
            // - OR edit mode enabled and disableAddTask false
            if (currentUserId === boardOwnerId || isEditMode && !disableAddTask) {
                const addTaskBtn = document.createElement('button');
                addTaskBtn.className = 'add-task-btn';
                addTaskBtn.innerText = '+';
                addTaskBtn.onclick = () => {
                    kanbanBoardInterop.dotNetHelper.invokeMethodAsync("AddTaskToColumn", col.name);
                };
                headerBottom.appendChild(addTaskBtn);
            }

            header.appendChild(headerTop);
            header.appendChild(headerBottom);
            colDiv.appendChild(header);

            // Drag-over handling for column reordering - only if edit mode
            if (isEditMode) {
                colDiv.addEventListener('dragover', e => {
                    e.preventDefault();
                    const dragging = document.querySelector('.kanban-column.dragging');
                    if (!dragging || dragging === colDiv) return;

                    const columns = [...root.querySelectorAll('.kanban-column:not(.add-column-box)')];
                    const currentIndex = columns.indexOf(dragging);
                    const targetIndex = columns.indexOf(colDiv);

                    if (currentIndex > targetIndex) {
                        root.insertBefore(dragging, colDiv);
                    } else {
                        root.insertBefore(dragging, colDiv.nextSibling);
                    }
                });

                colDiv.addEventListener('drop', e => {
                    const taskId = e.dataTransfer.getData('text/plain');
                    const taskEl = document.querySelector(`[data-taskid="${taskId}"]`);
                    const from = taskEl?.parentElement?.dataset?.column;
                    const to = col.name;
                    if (taskId && from && to && from !== to) {
                        kanbanBoardInterop.dotNetHelper.invokeMethodAsync("OnTaskMoved", parseInt(taskId), from, to);
                        colDiv.appendChild(taskEl);
                    }
                });
            }

            // Enable drag-and-drop of tasks always (all users can move tasks)
            colDiv.addEventListener('dragover', e => e.preventDefault());
            colDiv.addEventListener('drop', e => {
                const taskId = e.dataTransfer.getData('text/plain');
                const taskEl = document.querySelector(`[data-taskid="${taskId}"]`);
                const from = taskEl?.parentElement?.dataset?.column;
                const to = col.name;
                if (taskId && from && to && from !== to) {
                    kanbanBoardInterop.dotNetHelper.invokeMethodAsync("OnTaskMoved", parseInt(taskId), from, to);
                    colDiv.appendChild(taskEl);
                }
            });

            columnMap[col.name] = colDiv;
            root.appendChild(colDiv);
        });

        // Helper functions
        function stripTime(date) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        }
        function formatUKDate(date) {
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }

        // Render tasks
        tasks.forEach(task => {
            const taskDiv = document.createElement('div');
            taskDiv.className = 'kanban-task';
            taskDiv.draggable = true;
            taskDiv.dataset.taskid = task.id;

            // Default styles
            taskDiv.style.borderLeft = "6px solid gray";
            taskDiv.style.backgroundColor = "#fefefe";
            taskDiv.style.color = "inherit";

            let isOverdue = false;
            let dueDateFormatted = '';

            if (task.dueDate) {
                const dueDateObj = new Date(task.dueDate);
                dueDateFormatted = formatUKDate(dueDateObj);
                const dueDateOnly = stripTime(dueDateObj);
                const todayOnly = stripTime(new Date());

                if (dueDateOnly < todayOnly) {
                    isOverdue = true;
                    taskDiv.style.backgroundColor = '#f8d7da';
                    taskDiv.style.borderLeft = '6px solid #dc3545';
                    taskDiv.style.color = '#721c24';
                }
            }

            const assignee = task.assignee ? `Assigned to: ${task.assignee}` : '';
            const due = dueDateFormatted ? `Due: ${dueDateFormatted}` : '';

            taskDiv.innerHTML = `
                <div class="task-title">${task.title}</div>
                <div class="task-meta">${assignee}</div>
                <div class="task-meta">${due}</div>
            `;

            // Priority colors if not overdue
            if (!isOverdue) {
                switch (task.priority) {
                    case 3: taskDiv.style.borderLeft = "6px solid darkred"; break;
                    case 2: taskDiv.style.borderLeft = "6px solid red"; break;
                    case 1: taskDiv.style.borderLeft = "6px solid orange"; break;
                    default: taskDiv.style.borderLeft = "6px solid gray";
                }
            }

            // Delete button for owner or creator
            if (currentUserId === boardOwnerId || currentUserId === task.creatorId) {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-sm btn-danger kanban-task-delete-btn';
                delBtn.innerText = 'Delete';
                delBtn.style.marginTop = '6px';
                delBtn.onclick = e => {
                    e.stopPropagation();
                    if (confirm("Delete this task?")) {
                        kanbanBoardInterop.dotNetHelper.invokeMethodAsync("DeleteTask", task.id);
                    }
                };
                taskDiv.appendChild(delBtn);
            }

            // Enable dragging of task (always)
            taskDiv.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', task.id);
            });

            // Open task modal on click
            taskDiv.addEventListener('click', () => {
                kanbanBoardInterop.dotNetHelper.invokeMethodAsync("OpenTaskModal", task.id);
            });

            // Append to correct column
            const parent = columnMap[task.columnName];
            if (parent) {
                parent.appendChild(taskDiv);
            }
        });

        // Add column box - only visible in edit mode for owners/admins
        if (isEditMode) {
            const addColumnBox = document.createElement('div');
            addColumnBox.className = 'add-column-box';
            addColumnBox.innerHTML = '+';
            addColumnBox.addEventListener('click', () => {
                kanbanBoardInterop.dotNetHelper.invokeMethodAsync("AddColumn");
            });
            root.appendChild(addColumnBox);
        }
    },

    updateTask: function (task) {
        const el = document.querySelector(`[data-taskid="${task.id}"]`);
        if (el) el.textContent = task.title;
    }
};
