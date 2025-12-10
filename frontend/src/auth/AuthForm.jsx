
import React, { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export default function AuthForm({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const body = await res.json().catch(() => null);
      console.log("[AuthForm] server response:", res.status, body);

      setLoading(false);

      if (!res.ok) {
        setMsg(body?.error || "Authentication failed");
        return;
      }

      // IMPORTANT: server must return token in `body.token`
      const token = body?.token;
      if (!token) {
        setMsg("Server didn't return a token");
        return;
      }

      // call parent's handler
      onAuth(token);
    } catch (err) {
      console.error("[AuthForm] submit error", err);
      setLoading(false);
      setMsg("Network error");
    }
  }

  return (
    <div className="bg-white p-6 rounded shadow">
      <h2 className="text-2xl font-semibold mb-4">
        {mode === "login" ? "Login" : "Register"}
      </h2>

      <form onSubmit={submit} className="space-y-3">
        <input
          required
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="Username"
          className="w-full border p-2 rounded"
        />
        <input
          required
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Password"
          className="w-full border p-2 rounded"
        />

        <div className="flex items-center justify-between">
          <button
            type="submit"
            className="bg-sky-600 text-white px-4 py-2 rounded"
            disabled={loading}
          >
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Register"}
          </button>

          <button
            type="button"
            className="text-sm text-sky-600"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setMsg("");
            }}
          >
            {mode === "login" ? "Create account" : "Have an account? Login"}
          </button>
        </div>

        {msg ? <div className="text-sm text-red-500 mt-2">{msg}</div> : null}
      </form>
    </div>
  );
}
