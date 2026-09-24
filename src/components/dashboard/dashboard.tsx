"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Circle, ClipboardList, Clock3, LayoutDashboard, Plus, UserRound } from "lucide-react";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { TodoBoard } from "@/components/todos/todo-board";
import { TodoDialog } from "@/components/todos/todo-dialog";
import { createClient } from "@/lib/supabase/client";
import type { Todo, TodoPriority, TodoStatus } from "@/types/database";

type ProfileInfo = { full_name: string | null; email: string | null; avatar_url: string | null } | null;
const statuses: TodoStatus[] = ["TODO", "IN_PROGRESS", "COMPLETED"];
const priorities: TodoPriority[] = ["LOW", "MEDIUM", "HIGH"];
const statusLabel: Record<TodoStatus, string> = { TODO: "Todo", IN_PROGRESS: "In Progress", COMPLETED: "Completed" };
const priorityLabel: Record<TodoPriority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export function Dashboard({ initialProfile, initialTodos, initialTodosError, email }: { initialProfile: ProfileInfo; initialTodos: Todo[]; initialTodosError: string | null; email: string }) {
  const [todos, setTodos] = useState(initialTodos);
  const [todosError, setTodosError] = useState(initialTodosError);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [editing, setEditing] = useState<Todo | "new" | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const filtered = useMemo(() => todos.filter(todo => (statusFilter === "ALL" || todo.status === statusFilter) && (priorityFilter === "ALL" || todo.priority === priorityFilter)), [todos, statusFilter, priorityFilter]);
  const counts = statuses.map(status => ({ status, count: todos.filter(todo => todo.status === status).length }));
  const supabase = createClient();
  useEffect(() => {
    setTodos(initialTodos);
    setTodosError(initialTodosError);
  }, [initialTodos, initialTodosError]);

  const closeTodoDialog = useCallback(() => setEditing(null), []);

  function openTodoDialog(value: Todo | "new", trigger?: HTMLElement | null) {
    dialogTrigger.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setError("");
    setEditing(value);
  }

  async function saveTodo(form: FormData) {
    setError("");
    const title = String(form.get("title") ?? "").trim();
    if (!title) { setError("Add a title before saving."); return; }
    const payload = { title, description: String(form.get("description") ?? "").trim() || null, status: String(form.get("status")) as TodoStatus, priority: String(form.get("priority")) as TodoPriority, due_date: String(form.get("due_date") ?? "") || null };
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setError("Your session has expired. Please sign in again."); return; }
    if (editing === "new") {
      const position = Math.max(0, ...todos.filter(todo => todo.status === payload.status).map(todo => todo.position)) + 1024;
      const { data, error: saveError } = await supabase.from("todos").insert({ ...payload, user_id: authData.user.id, position }).select().single();
      if (saveError) { setError(saveError.message); return; }
      setTodos(current => [data as Todo, ...current]);
    } else if (editing) {
      const position = payload.status === editing.status ? editing.position : Math.max(0, ...todos.filter(todo => todo.status === payload.status).map(todo => todo.position)) + 1024;
      const { data, error: saveError } = await supabase.from("todos").update({ ...payload, position }).eq("id", editing.id).select().single();
      if (saveError) { setError(saveError.message); return; }
      setTodos(current => current.map(todo => todo.id === editing.id ? data as Todo : todo));
    }
    setEditing(null);
  }

  async function moveTodos(updates: { todo: Todo; status: TodoStatus; position: number }[]) {
    if (!updates.length) return;
    setError("");
    const previous = updates.map(update => update.todo);
    const nextById = new Map(updates.map(({ todo, status, position }) => [todo.id, { ...todo, status, position, updated_at: new Date().toISOString() }]));
    setTodos(current => current.map(todo => nextById.get(todo.id) ?? todo));
    const results = await Promise.all(updates.map(({ todo, status, position }) => supabase.from("todos").update({ status, position }).eq("id", todo.id).select().single()));
    const failedIndex = results.findIndex(result => result.error);
    if (failedIndex >= 0) {
      setTodos(current => current.map(todo => previous.find(item => item.id === todo.id) ?? todo));
      setError(`Couldn’t save the new task order. ${results[failedIndex].error?.message ?? "Please try again."}`);
      router.refresh();
      return;
    }
    const saved = new Map(results.map(result => [(result.data as Todo).id, result.data as Todo]));
    setTodos(current => current.map(todo => saved.get(todo.id) ?? todo));
  }

  async function removeTodo(todo: Todo) {
    if (!window.confirm(`Delete “${todo.title}”? This cannot be undone.`)) return;
    const { error: deleteError } = await supabase.from("todos").delete().eq("id", todo.id);
    if (deleteError) { setError(deleteError.message); return; }
    setTodos(current => current.filter(item => item.id !== todo.id));
  }

  const name = initialProfile?.full_name?.trim() || email.split("@")[0] || "there";
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><span className="brand-mark"><Check size={19} /></span> taskify</Link>
      <p className="nav-caption">WORKSPACE</p>
      <nav className="side-nav" aria-label="Main navigation"><Link href="/dashboard" className="nav-link active"><LayoutDashboard size={18}/> Dashboard</Link><Link href="/profile" className="nav-link"><UserRound size={18}/> Profile</Link></nav>
      <div className="sidebar-bottom"><div className="mini-user">{initialProfile?.avatar_url ? <Image src={initialProfile.avatar_url} alt="" width={36} height={36} unoptimized/> : <span>{name.slice(0,1).toUpperCase()}</span>}<div><strong>{name}</strong><small>{email}</small></div></div><LogoutButton /></div>
    </aside>
    <main className="dashboard-main">
      <header className="topbar"><span>Workspace / Dashboard</span><Link href="/profile" className="avatar-link" aria-label="Open profile">{initialProfile?.avatar_url ? <Image src={initialProfile.avatar_url} alt="" width={36} height={36} unoptimized/> : name.slice(0,1).toUpperCase()}</Link></header>
      <div className="page-content">
        <div className="welcome-row"><div><p className="eyebrow">YOUR OVERVIEW</p><h1>Good to see you, {name} <span aria-hidden="true">✦</span></h1><p className="muted">Here’s what’s happening with your tasks today.</p></div><button className="primary-button" onClick={event => openTodoDialog("new", event.currentTarget)}><Plus size={18}/> Add task</button></div>
        <section className="stats-grid" aria-label="Task statistics"><Stat icon={<ClipboardList size={18}/>} label="Total tasks" count={todos.length} tone="blue"/><Stat icon={<Circle size={18}/>} label="To do" count={counts[0].count} tone="slate"/><Stat icon={<Clock3 size={18}/>} label="In progress" count={counts[1].count} tone="amber"/><Stat icon={<Check size={18}/>} label="Completed" count={counts[2].count} tone="green"/></section>
        <section className="tasks-section"><div className="section-heading"><div><h2>Your tasks</h2><p className="muted">Drag tasks between columns to update their status.</p></div><div className="filters"><label className="sr-only" htmlFor="filter-status">Filter by status</label><select id="filter-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map(item => <option key={item} value={item}>{statusLabel[item]}</option>)}</select><label className="sr-only" htmlFor="filter-priority">Filter by priority</label><select id="filter-priority" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option value="ALL">All priorities</option>{priorities.map(item => <option key={item} value={item}>{priorityLabel[item]} priority</option>)}</select></div></div>
          {error && <p className="notice error-notice" role="alert">{error}</p>}
          {todosError ? <div className="todo-load-error" role="alert"><strong>We couldn’t load your tasks.</strong><p>{todosError}</p><button type="button" className="secondary-button" onClick={() => router.refresh()}>Try again</button></div> : todos.length ? <TodoBoard todos={filtered} onMove={moveTodos} onEdit={todo => openTodoDialog(todo)} onDelete={removeTodo}/> : <div className="empty-state"><span className="empty-icon"><ClipboardList size={24}/></span><h3>A clear list is a good place to start</h3><p>Add your first task and make today count.</p><button className="primary-button" onClick={event => openTodoDialog("new", event.currentTarget)}><Plus size={17}/> Create a task</button></div>}
        </section>
      </div>
    </main>
    {editing && <TodoDialog todo={editing === "new" ? null : editing} onClose={closeTodoDialog} onSave={saveTodo} error={error} restoreFocusRef={dialogTrigger}/>}
  </div>;
}

function Stat({ icon, label, count, tone }: { icon: React.ReactNode; label: string; count: number; tone: string }) { return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{count}</strong></div></article>; }
