import { useState } from "react";
import { motion } from "framer-motion";
import { SignIn, Warning } from "@phosphor-icons/react";

// Minimal email + password login. Posts to /api/login; on success the
// browser stores the httpOnly session cookie automatically and the parent
// shell re-checks /api/me to flip into the authed state.
export default function LoginView({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Sign in failed");
        return;
      }
      onSignedIn?.(data.user);
    } catch (err) {
      setError(err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="tac-root"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        style={{
          width: "min(420px, 100%)",
          background: "var(--tac-surface)",
          border: "1px solid var(--tac-border)",
          borderRadius: 12,
          boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "22px 24px 18px",
            borderBottom: "1px solid var(--tac-border)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <img
            src="/chiqo.png"
            alt="chiqo.ai"
            width={32}
            height={32}
            style={{
              borderRadius: 8,
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--tac-fg)",
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
              }}
            >
              chiqo.ai
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--tac-mute)",
                marginTop: 2,
              }}
            >
              by Macroview Studio
            </div>
          </div>
        </header>

        <form
          onSubmit={submit}
          style={{
            padding: "20px 24px 22px",
            display: "grid",
            gap: 14,
          }}
        >
          <div>
            <label
              htmlFor="login-email"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--tac-mute)",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              spellCheck={false}
              required
              className="tac-input"
              style={{ fontSize: 13, padding: "10px 12px" }}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--tac-mute)",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="tac-input"
              style={{ fontSize: 13, padding: "10px 12px" }}
            />
          </div>

          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                background: "rgba(240, 68, 94, 0.08)",
                border: "1px solid rgba(240, 68, 94, 0.25)",
                borderRadius: 8,
                fontSize: 12.5,
                color: "var(--tac-fg)",
              }}
              role="alert"
            >
              <Warning size={14} weight="regular" color="var(--tac-danger)" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="tac-btn tac-btn-accent"
            style={{
              padding: "10px 14px",
              fontSize: 13,
              opacity: submitting || !email || !password ? 0.6 : 1,
              cursor:
                submitting || !email || !password ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <SignIn size={14} weight="regular" />
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <div
            style={{
              fontSize: 11.5,
              color: "var(--tac-dim)",
              lineHeight: 1.55,
              marginTop: 4,
            }}
          >
            Local-only auth. Credentials live in <code>server/users.json</code>.
            Add or rotate users via{" "}
            <code>node scripts/add-user.js &lt;email&gt; &lt;password&gt;</code>.
          </div>
        </form>
      </motion.div>
    </div>
  );
}
