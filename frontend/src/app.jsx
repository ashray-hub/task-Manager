//app.jsx
import React, { useEffect, useState } from "react";
import AuthForm from "./auth/AuthForm.jsx";
import Dashboard from "./dashboard/Dashboard.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // ----------------------------
  // Save token after login/register
  // ----------------------------
  function handleLogin(tokenFromServer) {
    console.log("[App] Received token:", tokenFromServer);

    setToken(tokenFromServer);
    localStorage.setItem("token", tokenFromServer);
  }

  // ----------------------------
  // Logout handler
  // ----------------------------
  function handleLogout() {
    setToken("");
    localStorage.removeItem("token");
    setUser(null);
  }

  // ----------------------------
  // Validate token + load profile
  // ----------------------------
  useEffect(() => {
    console.log("[App] useEffect triggered. Token:", token);

    if (!token) {
      setUser(null);
      return;
    }

    setLoadingProfile(true);

    fetch(`${API}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);

        console.log("[App] /profile status:", res.status);
        console.log("[App] /profile body:", body);

        if (!res.ok) throw new Error("Invalid token");

        // backend returns: { message, user }
        if (body.user) {
          setUser(body.user);
        } else {
          setUser(body);
        }
      })
      .catch((err) => {
        console.warn("[App] Token invalid, logging out:", err);

        // Clear token only when token is bad
        setToken("");
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => setLoadingProfile(false));
  }, [token]);

  // ----------------------------
  // Render Logic
  // ----------------------------
  if (loadingProfile) {
    return (
      <div className="p-8 text-center text-gray-600">
        Checking login…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-3xl mx-auto">
        {/* If no token → show Login/Register */}
        {!token ? (
          <AuthForm onAuth={handleLogin} />
        ) : (
          // Token exists → show Dashboard
          <Dashboard token={token} onLogout={handleLogout} user={user} />
        )}
      </div>
    </div>
  );
}
