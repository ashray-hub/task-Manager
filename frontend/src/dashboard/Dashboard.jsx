import React, { useEffect, useMemo, useState } from "react";



export default function Dashboard({ token, user, onLogout }) {
  const API = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000/api";

  // data + UI
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("All");
  const [completed, setCompleted] = useState("All");
  const [sortBy, setSortBy] = useState("created_at:desc");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState({ id: null, value: "" });
  const [busy, setBusy] = useState(false);

  // simple fetch helper
  const api = (path, opts = {}) =>
    fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

  // load tasks
  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("/tasks");
      if (!res.ok) throw await readErr(res);
      const data = await res.json().catch(() => []);
      const raw = Array.isArray(data) ? data : data?.tasks ?? [];
      const normalized = raw
        .filter(Boolean)
        .map((t) => ({
          id: t.id ?? null,
          title: t.title ?? "(no title)",
          description: t.description ?? "",
          priority: t.priority ?? "Medium",
          due_date: t.due_date ?? null,
          completed: !!t.completed,
          created_at: t.created_at ?? null,
        }));
      setTasks(normalized);
      setSelected(new Set());
      setPage(1);
    } catch (e) {
      console.error("loadTasks", e);
      setError(e.message || "Failed to load tasks");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadTasks();
    // eslint-disable-next-line
  }, [token]);

  // utilities
  async function readErr(res) {
    const body = await res.json().catch(() => null);
    return new Error(body?.error || `HTTP ${res.status}`);
  }

  // derived list (filter + sort)
  const filteredSorted = useMemo(() => {
    let list = [...tasks];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => (t.title || "").toLowerCase().includes(q));
    if (priority !== "All") list = list.filter((t) => (t.priority || "Medium") === priority);
    if (completed === "Completed") list = list.filter((t) => t.completed);
    if (completed === "Incomplete") list = list.filter((t) => !t.completed);

    const [field, dir] = (sortBy || "created_at:desc").split(":");
    list.sort((a, b) => {
      const va = a[field] ?? "";
      const vb = b[field] ?? "";

      // date compare if possible
      const da = Date.parse(va);
      const db = Date.parse(vb);
      if (!isNaN(da) && !isNaN(db)) return dir === "asc" ? da - db : db - da;

      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      if (sa < sb) return dir === "asc" ? -1 : 1;
      if (sa > sb) return dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [tasks, query, priority, completed, sortBy]);

  // pagination
  const total = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, page, pageSize]);

  // selection
  const toggleSelect = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAllVisible = () => {
    setSelected((s) => {
      const ids = paginated.map((t) => t.id);
      const next = new Set(s);
      const all = ids.every((id) => next.has(id));
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  // actions: toggle complete, delete, bulk delete, edit/save
  const toggleCompleted = async (task) => {
    // optimistic update
    setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, completed: !x.completed } : x)));
    try {
      const res = await api(`/tasks/${task.id}`, { method: "PUT", body: { completed: !task.completed } });
      if (!res.ok) throw await readErr(res);
      const body = await res.json().catch(() => null);
      const returned = body?.task ?? body;
      if (returned) setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, ...returned } : x)));
    } catch (e) {
      console.error("toggleCompleted", e);
      setError(e.message || "Failed to update");
      await loadTasks();
    }
  };

  const deleteTask = async (task) => {
    if (!confirm("Delete this task?")) return;
    setBusy(true);
    try {
      const res = await api(`/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) throw await readErr(res);
      setTasks((t) => t.filter((x) => x.id !== task.id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(task.id);
        return n;
      });
    } catch (e) {
      console.error("deleteTask", e);
      setError(e.message || "Failed to delete");
      await loadTasks();
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected tasks?`)) return;
    setBusy(true);
    try {
      const ids = Array.from(selected);
      for (const id of ids) {
        const res = await api(`/tasks/${id}`, { method: "DELETE" });
        if (!res.ok) throw await readErr(res);
      }
      setTasks((t) => t.filter((x) => !selected.has(x.id)));
      setSelected(new Set());
    } catch (e) {
      console.error("bulkDelete", e);
      setError(e.message || "Bulk delete failed");
      await loadTasks();
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (task) => setEditing({ id: task.id, value: task.title || "" });
  const cancelEdit = () => setEditing({ id: null, value: "" });

  const saveEdit = async (task) => {
    const v = (editing.value || "").trim();
    if (!v) return alert("Title cannot be empty");
    setBusy(true);
    try {
      const res = await api(`/tasks/${task.id}`, { method: "PUT", body: { title: v } });
      if (!res.ok) throw await readErr(res);
      const body = await res.json().catch(() => null);
      const returned = body?.task ?? body;
      setTasks((t) => t.map((x) => (x.id === task.id ? (returned ? returned : { ...x, title: v }) : x)));
      cancelEdit();
    } catch (e) {
      console.error("saveEdit", e);
      setError(e.message || "Failed to save");
      await loadTasks();
    } finally {
      setBusy(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <div className="p-6 bg-white rounded shadow max-w-4xl mx-auto">
      <header className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-3xl font-bold">Task Manager</h1>
          <div className="text-gray-600">Signed in as: <strong>{user?.username}</strong></div>
        </div>
        <div className="flex gap-2">
          <button onClick={onLogout} className="bg-red-500 text-white px-3 py-1 rounded">Sign out</button>
        </div>
      </header>

      {/* Controls */}
      <section className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input placeholder="Search tasks..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} className="border p-2 rounded md:col-span-2" />
        <div className="flex gap-2 items-center">
          <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="border p-2 rounded">
            <option>All</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
          <select value={completed} onChange={(e) => { setCompleted(e.target.value); setPage(1); }} className="border p-2 rounded">
            <option>All</option><option>Completed</option><option>Incomplete</option>
          </select>
        </div>
      </section>

      <section className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm">Sort:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border p-2 rounded">
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="due_date:asc">Due date ↑</option>
            <option value="due_date:desc">Due date ↓</option>
          </select> 
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm">Page size:</label>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="border p-2 rounded">
            <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
          </select>
          <button onClick={loadTasks} className="bg-slate-200 px-3 py-1 rounded">Refresh</button>
        </div>
      </section>

      {/* Bulk actions */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <label className="text-sm">
            <input type="checkbox" onChange={toggleSelectAllVisible} checked={paginated.every((t) => selected.has(t.id)) && paginated.length > 0} />{" "}
            Select visible
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={selected.size === 0 || busy} onClick={bulkDelete} className="bg-red-600 text-white px-3 py-1 rounded">
            Delete selected ({selected.size})
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 p-3 bg-yellow-100 text-yellow-900 rounded">
          <div className="flex justify-between items-center">
            <div>{error}</div>
            <div><button onClick={clearError} className="underline text-sm">Dismiss</button></div>
          </div>
        </div>
      )}

      {/* Add row */}
      <div className="mb-3"><AddTaskRow api={api} onAdded={(task) => setTasks((p) => [...p, task])} /></div>

      {/* List */}
      <div>
        {loading ? (
          <div className="text-gray-600">Loading…</div>
        ) : paginated.length === 0 ? (
          <div className="text-gray-500">No tasks found.</div>
        ) : (
          <ul className="space-y-2">
            {paginated.map((task) => (
              <li key={task.id} className="p-2 border rounded flex items-center gap-3">
                <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggleSelect(task.id)} />
                <input type="checkbox" checked={!!task.completed} onChange={() => toggleCompleted(task)} />
                <div className="flex-1">
                  {editing.id === task.id ? (
                    <input value={editing.value} onChange={(e) => setEditing((s) => ({ ...s, value: e.target.value }))} className="w-full border p-1 rounded" />
                  ) : (
                    <div className={task.completed ? "line-through text-gray-500" : ""}>
                      <div className="font-medium">{task.title}</div>
                      <div className="text-xs text-gray-500">Priority: {task.priority} • Due: {task.due_date || "—"}</div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {editing.id === task.id ? (
                    <>
                      <button onClick={() => saveEdit(task)} className="bg-green-500 text-white px-2 py-1 rounded">Save</button>
                      <button onClick={cancelEdit} className="bg-gray-200 px-2 py-1 rounded">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(task)} className="bg-yellow-400 px-2 py-1 rounded">Edit</button>
                      <button onClick={() => deleteTask(task)} className="bg-red-500 text-white px-2 py-1 rounded">Delete</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div>Page {page} of {totalPages} • {total} tasks</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded">Prev</button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 border rounded">Next</button>
        </div>
      </div>
    </div>
  );
}

/* AddTaskRow (compact) */
function AddTaskRow({ api, onAdded }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e?.preventDefault?.();
    const title = (value || "").trim();
    if (!title) return;
    setBusy(true);
    try {
      const res = await api("/tasks", { method: "POST", body: { title } });
      if (!res.ok) throw await (async () => { const b = await res.json().catch(() => null); throw new Error(b?.error || `HTTP ${res.status}`); })();
      const body = await res.json().catch(() => null);
      const task = body?.task ?? body;
      onAdded && onAdded(task);
      setValue("");
    } catch (e) {
      console.error("AddTaskRow", e);
      alert(e.message || "Failed to add task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={add} className="flex gap-2">
      <input placeholder="New task title" value={value} onChange={(e) => setValue(e.target.value)} className="border p-2 rounded flex-1" />
      <button type="submit" disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded">{busy ? "Adding..." : "Add"}</button>
    </form>
  );
}
