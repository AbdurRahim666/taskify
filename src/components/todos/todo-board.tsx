"use client";

import { useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DraggableAttributes, type DraggableSyntheticListeners } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { Todo, TodoStatus } from "@/types/database";

const columns: { status: TodoStatus; label: string; tone: string }[] = [
  { status: "TODO", label: "To do", tone: "todo" },
  { status: "IN_PROGRESS", label: "In progress", tone: "progress" },
  { status: "COMPLETED", label: "Completed", tone: "completed" },
];
const priorityNames = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;

type Props = {
  todos: Todo[];
  onMove: (updates: { todo: Todo; status: TodoStatus; position: number }[]) => Promise<void>;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
};

export function TodoBoard({ todos, onMove, onEdit, onDelete }: Props) {
  const [activeTodo, setActiveTodo] = useState<Todo | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordered = useMemo(() => [...todos].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [todos]);

  function handleStart(event: DragStartEvent) {
    setActiveTodo(todos.find(todo => todo.id === event.active.id) ?? null);
  }

  async function handleEnd(event: DragEndEvent) {
    setActiveTodo(null);
    const dragged = todos.find(todo => todo.id === event.active.id);
    if (!dragged || !event.over) return;
    const overId = String(event.over.id);
    const target = columns.some(column => column.status === overId) ? overId as TodoStatus : todos.find(todo => todo.id === overId)?.status;
    if (!target) return;

    const overTodo = todos.find(todo => todo.id === overId);
    let desired: Todo[];
    if (target === dragged.status) {
      const sameColumn = ordered.filter(todo => todo.status === target);
      const oldIndex = sameColumn.findIndex(todo => todo.id === dragged.id);
      const newIndex = overTodo ? sameColumn.findIndex(todo => todo.id === overTodo.id) : sameColumn.length - 1;
      desired = arrayMove(sameColumn, oldIndex, newIndex);
    } else {
      desired = ordered.filter(todo => todo.status === target && todo.id !== dragged.id);
      const insertAt = overTodo && overTodo.id !== dragged.id ? desired.findIndex(todo => todo.id === overTodo.id) : desired.length;
      desired.splice(insertAt < 0 ? desired.length : insertAt, 0, dragged);
    }
    const index = desired.findIndex(todo => todo.id === dragged.id);
    const before = desired[index - 1]?.position;
    const after = desired[index + 1]?.position;
    const candidate = positionBetween(before, after);
    const collides = candidate !== null && desired.some(todo => todo.id !== dragged.id && todo.position === candidate);
    if (candidate !== null && !collides) {
      if (target === dragged.status && candidate === dragged.position) return;
      await onMove([{ todo: dragged, status: target, position: candidate }]);
      return;
    }

    const rebalanced = desired.map((todo, itemIndex) => ({
      todo,
      status: todo.id === dragged.id ? target : todo.status,
      position: (itemIndex + 1) * 1024,
    })).filter(update => update.todo.position !== update.position || update.todo.status !== update.status);
    await onMove(rebalanced);
  }

  return <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleStart} onDragEnd={handleEnd} onDragCancel={() => setActiveTodo(null)}>
    <div className="kanban-board" aria-label="Todo board">
      {columns.map(column => {
        const items = ordered.filter(todo => todo.status === column.status);
        return <BoardColumn key={column.status} status={column.status} label={column.label} tone={column.tone} items={items} onEdit={onEdit} onDelete={onDelete}/>;
      })}
    </div>
    <DragOverlay dropAnimation={{ duration: 160, easing: "ease" }}>{activeTodo ? <TodoCard todo={activeTodo} overlay/> : null}</DragOverlay>
  </DndContext>;
}

function positionBetween(before: number | undefined, after: number | undefined): number | null {
  if (before === undefined && after === undefined) return 1024;
  if (before === undefined) return after !== undefined && after > -2147482624 ? after - 1024 : null;
  if (after === undefined) return before < 2147482623 ? before + 1024 : null;
  if (after - before > 1) return Math.floor((after + before) / 2);
  return null;
}

function BoardColumn({ status, label, tone, items, onEdit, onDelete }: { status: TodoStatus; label: string; tone: string; items: Todo[]; onEdit: (todo: Todo) => void; onDelete: (todo: Todo) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return <section className={`kanban-column ${isOver ? "column-over" : ""}`} aria-label={`${label} tasks`}><header className="column-header"><span className={`column-dot ${tone}`}/><h3>{label}</h3><span className="column-count">{items.length}</span></header><SortableContext items={items.map(todo => todo.id)} strategy={verticalListSortingStrategy}><div ref={setNodeRef} className="column-dropzone">{items.length ? items.map(todo => <SortableTodo key={todo.id} todo={todo} onEdit={onEdit} onDelete={onDelete}/>) : <div className="column-empty">Drop a task here</div>}</div></SortableContext></section>;
}

function SortableTodo({ todo, onEdit, onDelete }: { todo: Todo; onEdit: (todo: Todo) => void; onDelete: (todo: Todo) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "drag-source" : ""}><TodoCard todo={todo} onEdit={() => onEdit(todo)} onDelete={() => onDelete(todo)} dragAttributes={attributes} dragListeners={listeners}/></div>;
}

function TodoCard({ todo, onEdit, onDelete, overlay = false, dragAttributes, dragListeners }: { todo: Todo; onEdit?: () => void; onDelete?: () => void; overlay?: boolean; dragAttributes?: DraggableAttributes; dragListeners?: DraggableSyntheticListeners }) {
  return <article className={`kanban-card ${todo.status === "COMPLETED" ? "kanban-done" : ""} ${overlay ? "kanban-overlay" : ""}`}>
    <div className="kanban-card-top"><span className={`priority-chip priority-${todo.priority.toLowerCase()}`}>{priorityNames[todo.priority]}</span>{!overlay && <button type="button" className="drag-handle" aria-label={`Drag ${todo.title}`} {...dragAttributes} {...dragListeners}><GripVertical size={15}/></button>}</div>
    <h4>{todo.title}</h4>
    {todo.description && <p className="kanban-description">{todo.description}</p>}
    {todo.due_date && <div className="kanban-due"><CalendarDays size={13}/><time dateTime={todo.due_date}>{new Date(`${todo.due_date}T00:00:00`).toLocaleDateString()}</time></div>}
    <footer className="kanban-card-footer"><span title={`Created ${new Date(todo.created_at).toLocaleString()} · Updated ${new Date(todo.updated_at).toLocaleString()}`}>Updated {new Date(todo.updated_at).toLocaleDateString()}</span>{!overlay && <div className="kanban-actions"><button type="button" aria-label={`Edit ${todo.title}`} onPointerDown={event => event.stopPropagation()} onClick={onEdit}><Pencil size={14}/></button><button type="button" aria-label={`Delete ${todo.title}`} onPointerDown={event => event.stopPropagation()} onClick={onDelete}><Trash2 size={14}/></button></div>}</footer>
    {todo.status === "COMPLETED" && <span className="completed-mark" aria-label="Completed"><Check size={12}/></span>}
  </article>;
}
