// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "./db.js";

dotenv.config();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const app = express();
app.use(cors(), express.json());


const run = (sql, params = []) =>
  new Promise((res, rej) =>
    db.run(sql, params, function (err) {
      if (err) return rej(err);
      res({ lastID: this.lastID, changes: this.changes });
    })
  );
const get = (sql, params = []) =>
  new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
const all = (sql, params = []) =>
  new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));

const err = (res, code = 500, message = "Database error") =>
  res.status(code).json({ error: message });

function authenticate(req, res, next) {
  const h = req.headers.authorization?.split(" ");
  if (!h || h.length !== 2 || h[0] !== "Bearer")
    return res.status(401).json({ error: "Authorization header missing or malformed" });
  try {
    req.user = jwt.verify(h[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/ping", (req, res) => res.json({ message: "pong" }));

// Register
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const { lastID } = await run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed]);
    const token = jwt.sign({ id: lastID, username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "User registered", token });
  } catch (e) {
    if (e.message?.includes("UNIQUE")) return err(res, 409, "Username already exists");
    console.error("Register DB error:", e);
    err(res);
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  try {
    const user = await get("SELECT * FROM users WHERE username = ?", [username]);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "Login successful", token });
  } catch (e) {
    console.error("Login DB error:", e);
    err(res);
  }
});

// Profile (protected)
app.get("/api/profile", authenticate, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ error: "Invalid user" });
  try {
    const user = await get("SELECT id, username, created_at FROM users WHERE id = ?", [userId]);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "OK", user });
  } catch (e) {
    console.error("/api/profile DB error:", e);
    err(res);
  }
});

// Create task
app.post("/api/tasks", authenticate, async (req, res) => {
  const userId = req.user.id;
  const { title, description = null, priority = "Medium", due_date = null } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Task title required" });
  try {
    const { lastID } = await run(
      "INSERT INTO tasks (user_id, title, description, priority, due_date) VALUES (?, ?, ?, ?, ?)",
      [userId, title, description, priority, due_date]
    );
    const task = await get("SELECT * FROM tasks WHERE id = ?", [lastID]);
    res.json({ message: "Task created", task });
  } catch (e) {
    console.error("Create task DB error:", e);
    err(res);
  }
});

// Get tasks
app.get("/api/tasks", authenticate, async (req, res) => {
  try {
    const rows = await all("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json(rows);
  } catch (e) {
    console.error("Get tasks DB error:", e);
    err(res);
  }
});

// Update task
app.put("/api/tasks/:id", authenticate, async (req, res) => {
  const userId = req.user.id;
  const taskId = req.params.id;
  const { title, completed, priority, due_date, description } = req.body ?? {};
  const fields = [];
  const params = [];
  if (title !== undefined) (fields.push("title = ?"), params.push(title));
  if (description !== undefined) (fields.push("description = ?"), params.push(description));
  if (priority !== undefined) (fields.push("priority = ?"), params.push(priority));
  if (due_date !== undefined) (fields.push("due_date = ?"), params.push(due_date));
  if (completed !== undefined) (fields.push("completed = ?"), params.push(completed ? 1 : 0));
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  try {
    const { changes } = await run(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, [
      ...params,
      taskId,
      userId,
    ]);
    if (!changes) return res.status(404).json({ error: "Task not found" });
    const task = await get("SELECT * FROM tasks WHERE id = ?", [taskId]);
    res.json({ message: "Task updated", task });
  } catch (e) {
    console.error("Update task DB error:", e);
    err(res);
  }
});

// Delete task
app.delete("/api/tasks/:id", authenticate, async (req, res) => {
  try {
    const { changes } = await run("DELETE FROM tasks WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!changes) return res.status(404).json({ error: "Task not found" });
    res.json({ message: "Task deleted", id: req.params.id });
  } catch (e) {
    console.error("Delete task DB error:", e);
    err(res);
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
