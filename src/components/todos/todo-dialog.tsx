"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { X } from "lucide-react";
import type { Todo, TodoPriority, TodoStatus } from "@/types/database";

const statuses: TodoStatus[] = ["TODO", "IN_PROGRESS", "COMPLETED"];
const priorities: TodoPriority[] = ["LOW", "MEDIUM", "HIGH"];
const statusLabel: Record<TodoStatus, string> = { TODO: "Todo", IN_PROGRESS: "In Progress", COMPLETED: "Completed" };
const priorityLabel: Record<TodoPriority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export function TodoDialog({ todo, onClose, onSave, error, restoreFocusRef }: {
  todo: Todo | null;
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
  error: string;
  restoreFocusRef: RefObject<HTMLElement | null>;
}) {
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trigger = restoreFocusRef.current;
    titleRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [onClose, restoreFocusRef]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(new FormData(event.currentTarget));
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="todo-modal" role="dialog" aria-modal="true" aria-labelledby="todo-dialog-title" tabIndex={-1}>
      <div className="modal-heading"><div><p className="eyebrow">TASK DETAILS</p><h2 id="todo-dialog-title">{todo ? "Edit task" : "Create a task"}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div>
      <form onSubmit={submit} className="form-stack">
        <label>Title<input ref={titleRef} name="title" required maxLength={160} defaultValue={todo?.title ?? ""} placeholder="What needs to get done?"/></label>
        <label>Description<textarea name="description" rows={3} maxLength={2000} defaultValue={todo?.description ?? ""} placeholder="Add a few details (optional)"/></label>
        <div className="form-row"><label>Status<select name="status" defaultValue={todo?.status ?? "TODO"}>{statuses.map(item => <option key={item} value={item}>{statusLabel[item]}</option>)}</select></label><label>Priority<select name="priority" defaultValue={todo?.priority ?? "MEDIUM"}>{priorities.map(item => <option key={item} value={item}>{priorityLabel[item]}</option>)}</select></label></div>
        <label>Due date<input name="due_date" type="date" defaultValue={todo?.due_date ?? ""}/></label>
        {error && <p className="form-feedback" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving} className="primary-button">{saving ? "Saving…" : todo ? "Save changes" : "Create task"}</button></div>
      </form>
    </section>
  </div>;
}
