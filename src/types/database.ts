export type TodoStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";

export type TodoPriority = "LOW" | "MEDIUM" | "HIGH";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}
