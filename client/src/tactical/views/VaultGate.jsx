// VaultGate — the only screen the user sees until they have an unlocked
// chiqo.ai vault. Three states:
//
//   1. checking       — chiqo.vault.status() hasn't resolved yet
//   2. onboard        — no vault exists; create one (3-step flow)
//   3. unlock         — vault exists; ask for the master password
//
// Owns its own state. When the user successfully unlocks (or creates +
// unlocks), this component calls `onUnlocked()` and the parent shell
// proceeds to render the actual app.
//
// Design invariants per the strategic doc:
//   - The master password is never persisted anywhere (only in the
//     React form field state, transiently).
//   - We never display saved passwords. The "show/hide" toggle reveals
//     what the user is currently typing — fine — but does not reach
//     into any stored value.
//   - If the user forgets the password, the only recovery is `wipe` —
//     surfaced as a low-key link, gated behind typing "WIPE" literally.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeSlash,
  LockKey,
  ShieldCheck,
  Warning,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Trash,
} from "@phosphor-icons/react";
import {
  hasBridge,
  vaultStatus,
  vaultCreate,
  vaultUnlock,
  vaultWipe,
} from "../../lib/chiqo.js";

// --- Password strength scorer (simple, no external dep) --------------------

// 0..4 — same buckets as zxcvbn but computed locally. Pure length +
// character-class heuristic. Not a security-grade analyzer; just enough
// to nudge the user away from "password123".
function scorePassword(pw) {
  if (!pw) return 0;
  const len = pw.length;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  if (len < 8) return Math.max(0, classes - 2);
  if (len < 12) return Math.min(2, classes - 1);
  if (len < 16) return Math.min(3, classes);
  return Math.min(4, classes);
}

const STRENGTH_LABELS = ["Too short", "Weak", "Ok", "Strong", "Excellent"];
const STRENGTH_COLORS = [
  "var(--tac-danger)",
  "var(--tac-danger)",
  "var(--tac-warning)",
  "var(--tac-accent)",
  "var(--tac-accent)",
];

// Translate IPC error codes to UX strings. Keeps the components free of
// `e.code === "..."` switches.
function describeError(err) {
  if (!err) return null;
  const code = err.code;
  if (code === "BAD_PASSWORD") return "Incorrect password.";
  if (code === "ALREADY_EXISTS")
    return "A vault already exists on this machine.";
  if (code === "NO_VAULT")
    return "No vault on this machine yet — let's create one.";
  if (code === "BAD_INPUT") return "That input isn't accepted.";
  if (code === "NO_BRIDGE") return err.message;
  return err.message || "Something went wrong.";
}

// --- Top-level gate --------------------------------------------------------

export default function VaultGate({ onUnlocked }) {
  const [phase, setPhase] = useState("checking"); // checking | onboard | unlock
  const [status, setStatus] = useState(null);
  const [bridgeMissing, setBridgeMissing] = useState(false);

  const refresh = async () => {
    if (!hasBridge()) {
      setBridgeMissing(true);
      setPhase("checking");
      return;
    }
    setBridgeMissing(false);
    try {
      const s = await vaultStatus();
      setStatus(s);
      if (!s.exists) setPhase("onboard");
      else if (s.locked) setPhase("unlock");
      else {
        // Already unlocked — straight to the app.
        onUnlocked?.(s);
      }
    } catch (e) {
      // status() shouldn't really fail, but if it does, fall back to
      // showing the unlock screen with the error.
      setStatus({ exists: false, locked: true });
      setPhase("onboard");
    }
  };

  useEffect(() => {
    refresh();
    // We deliberately don't poll — vault state only changes via user
    // action through this component, so refresh() being called
    // after onboard/unlock is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page>
      {bridgeMissing && <BridgeMissing />}
      {!bridgeMissing && phase === "checking" && <Checking />}
      {!bridgeMissing && phase === "onboard" && (
        <VaultOnboard onCreated={onUnlocked} />
      )}
      {!bridgeMissing && phase === "unlock" && (
        <VaultUnlock
          status={status}
          onUnlocked={onUnlocked}
          onWiped={refresh}
        />
      )}
    </Page>
  );
}

// --- Page chrome -----------------------------------------------------------

function Page({ children }) {
  return (
    <div
      className="tac-root"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(ellipse at top, rgba(33,208,122,0.06), transparent 60%), var(--tac-bg)",
      }}
    >
      <div style={{ width: "min(440px, 100%)" }}>
        <Brand />
        {children}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginBottom: 24,
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
            fontSize: 11.5,
            color: "var(--tac-mute)",
            marginTop: 1,
          }}
        >
          by Macroview Studio
        </div>
      </div>
    </div>
  );
}

function Card({ children }) {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      style={{
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 12,
        boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.6)",
        overflow: "hidden",
      }}
    >
      {children}
    </motion.div>
  );
}

function Checking() {
  return (
    <Card>
      <div
        style={{
          padding: 32,
          display: "grid",
          placeItems: "center",
          color: "var(--tac-mute)",
          fontSize: 13,
        }}
      >
        Checking vault status…
      </div>
    </Card>
  );
}

function BridgeMissing() {
  return (
    <Card>
      <div style={{ padding: "28px 26px", display: "grid", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--tac-warning)",
          }}
        >
          <Warning size={16} weight="regular" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Open the desktop app
          </span>
        </div>
        <div style={{ fontSize: 13, color: "var(--tac-mute)", lineHeight: 1.6 }}>
          chiqo.ai's vault only works inside the desktop launcher (it needs
          access to your local key storage). Close this browser tab and
          double-click <code>chiqo.ai.exe</code> instead.
        </div>
      </div>
    </Card>
  );
}

// --- Onboard (3-step) ------------------------------------------------------

function VaultOnboard({ onCreated }) {
  const [step, setStep] = useState(1);

  // All form state hoisted here so steps can read prior answers.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hint, setHint] = useState("");
  const [name, setName] = useState("My chiqo vault");
  const [acknowledged, setAcknowledged] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const strength = useMemo(() => scorePassword(password), [password]);

  const canAdvanceFromStep1 =
    password.length >= 8 && password === confirm && strength >= 2;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const s = await vaultCreate(password, { name, hint });
      onCreated?.(s);
    } catch (e) {
      setError(e);
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <Header
        title={`Create your vault`}
        subtitle={`Step ${step} of 3 · ${
          step === 1
            ? "Set a master password"
            : step === 2
            ? "Add a hint (optional)"
            : "Confirm what this means"
        }`}
      />

      <AnimatePresence mode="wait" initial={false}>
        {step === 1 && (
          <StepSlide key="s1">
            <Step1Password
              password={password}
              setPassword={setPassword}
              confirm={confirm}
              setConfirm={setConfirm}
              strength={strength}
            />
          </StepSlide>
        )}
        {step === 2 && (
          <StepSlide key="s2">
            <Step2HintName
              hint={hint}
              setHint={setHint}
              name={name}
              setName={setName}
            />
          </StepSlide>
        )}
        {step === 3 && (
          <StepSlide key="s3">
            <Step3Acknowledge
              acknowledged={acknowledged}
              setAcknowledged={setAcknowledged}
            />
          </StepSlide>
        )}
      </AnimatePresence>

      {error && <InlineError error={error} />}

      <Footer>
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          disabled={step === 1 || submitting}
          className="tac-btn"
          style={{
            padding: "8px 14px",
            fontSize: 13,
            opacity: step === 1 || submitting ? 0.5 : 1,
            cursor: step === 1 || submitting ? "not-allowed" : "pointer",
          }}
        >
          <ArrowLeft size={13} weight="regular" />
          Back
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={
              submitting ||
              (step === 1 && !canAdvanceFromStep1)
            }
            className="tac-btn tac-btn-accent"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              opacity:
                submitting || (step === 1 && !canAdvanceFromStep1)
                  ? 0.5
                  : 1,
              cursor:
                submitting || (step === 1 && !canAdvanceFromStep1)
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            Continue
            <ArrowRight size={13} weight="regular" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!acknowledged || submitting}
            className="tac-btn tac-btn-accent"
            style={{
              padding: "8px 18px",
              fontSize: 13,
              opacity: !acknowledged || submitting ? 0.5 : 1,
              cursor: !acknowledged || submitting ? "not-allowed" : "pointer",
            }}
          >
            <ShieldCheck size={14} weight="regular" />
            {submitting ? "Creating…" : "Create vault"}
          </button>
        )}
      </Footer>
    </Card>
  );
}

function Step1Password({
  password,
  setPassword,
  confirm,
  setConfirm,
  strength,
}) {
  const [show, setShow] = useState(false);
  return (
    <Body>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--tac-mute)",
          lineHeight: 1.6,
        }}
      >
        This password encrypts your vault. <strong style={{ color: "var(--tac-fg)" }}>If you
        forget it, your data is unrecoverable</strong> — there is no
        password reset. Store it in a password manager.
      </p>

      <Field label="Master password">
        <div style={{ position: "relative" }}>
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            spellCheck={false}
            autoComplete="new-password"
            className="tac-input"
            style={{ fontSize: 13, padding: "10px 36px 10px 12px" }}
          />
          <EyeButton show={show} onClick={() => setShow((v) => !v)} />
        </div>
        <StrengthMeter score={strength} hasInput={password.length > 0} />
      </Field>

      <Field label="Confirm">
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          spellCheck={false}
          autoComplete="new-password"
          className="tac-input"
          style={{ fontSize: 13, padding: "10px 12px" }}
        />
        {confirm && password !== confirm && (
          <div style={{ fontSize: 12, color: "var(--tac-danger)", marginTop: 4 }}>
            Passwords don't match.
          </div>
        )}
        {confirm && password === confirm && password.length >= 8 && (
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-accent)",
              marginTop: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <CheckCircle size={12} weight="regular" />
            Match
          </div>
        )}
      </Field>
    </Body>
  );
}

function Step2HintName({ hint, setHint, name, setName }) {
  return (
    <Body>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--tac-mute)",
          lineHeight: 1.6,
        }}
      >
        A short hint can jog your memory on the unlock screen. It's stored in
        plain text next to your vault — don't put anything sensitive in it.
      </p>

      <Field label="Vault name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={60}
          className="tac-input"
          style={{ fontSize: 13, padding: "10px 12px" }}
        />
      </Field>

      <Field label="Password hint (optional)">
        <input
          type="text"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          maxLength={120}
          placeholder="e.g., the dog's middle name + birth year"
          className="tac-input"
          style={{ fontSize: 13, padding: "10px 12px" }}
        />
      </Field>
    </Body>
  );
}

function Step3Acknowledge({ acknowledged, setAcknowledged }) {
  return (
    <Body>
      <div
        style={{
          padding: "14px 16px",
          background: "rgba(245, 184, 46, 0.08)",
          border: "1px solid rgba(245, 184, 46, 0.25)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--tac-fg)",
          lineHeight: 1.6,
          display: "grid",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--tac-warning)",
            fontWeight: 600,
          }}
        >
          <Warning size={14} weight="regular" />
          Before you continue
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            display: "grid",
            gap: 4,
            color: "var(--tac-fg)",
          }}
        >
          <li>If you forget this password, your data is unrecoverable.</li>
          <li>Store it in a password manager you trust.</li>
          <li>
            The only recovery is <strong>Wipe vault</strong>, which deletes
            every saved analysis, script, transcript, and run.
          </li>
        </ul>
      </div>

      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          cursor: "pointer",
          fontSize: 13,
          color: "var(--tac-fg)",
          lineHeight: 1.55,
          marginTop: 4,
        }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          autoFocus
          style={{
            width: 16,
            height: 16,
            marginTop: 2,
            accentColor: "var(--tac-accent)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <span>
          I understand that losing this password means losing all of my chiqo
          data, and I've stored it somewhere I can recover it.
        </span>
      </label>
    </Body>
  );
}

// --- Unlock ----------------------------------------------------------------

function VaultUnlock({ status, onUnlocked, onWiped }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showWipe, setShowWipe] = useState(false);

  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const s = await vaultUnlock(password);
      onUnlocked?.(s);
    } catch (err) {
      setError(err);
      setSubmitting(false);
      // Clear the password field on wrong-password so the user starts fresh.
      if (err.code === "BAD_PASSWORD") {
        setPassword("");
        inputRef.current?.focus();
      }
    }
  };

  return (
    <Card>
      <Header
        title={status?.name || "Unlock your vault"}
        subtitle="Enter your master password"
        icon={LockKey}
      />

      <form onSubmit={submit}>
        <Body>
          <Field label="Master password">
            <div style={{ position: "relative" }}>
              <input
                ref={inputRef}
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                spellCheck={false}
                autoComplete="current-password"
                className="tac-input"
                style={{ fontSize: 13, padding: "10px 36px 10px 12px" }}
              />
              <EyeButton show={show} onClick={() => setShow((v) => !v)} />
            </div>
            {status?.hint && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tac-mute)",
                  marginTop: 6,
                  fontStyle: "italic",
                }}
              >
                Hint: {status.hint}
              </div>
            )}
          </Field>

          {error && <InlineError error={error} />}
        </Body>

        <Footer>
          <button
            type="button"
            onClick={() => setShowWipe(true)}
            className="tac-btn"
            style={{
              padding: "8px 14px",
              fontSize: 12,
              color: "var(--tac-mute)",
            }}
            title="If you've forgotten your password, the only path forward is to wipe and start over."
          >
            <Trash size={12} weight="regular" />
            Wipe & start over
          </button>
          <button
            type="submit"
            disabled={!password || submitting}
            className="tac-btn tac-btn-accent"
            style={{
              padding: "8px 18px",
              fontSize: 13,
              opacity: !password || submitting ? 0.5 : 1,
              cursor: !password || submitting ? "not-allowed" : "pointer",
            }}
          >
            <LockKey size={14} weight="regular" />
            {submitting ? "Unlocking…" : "Unlock"}
          </button>
        </Footer>
      </form>

      {showWipe && <WipeModal onClose={() => setShowWipe(false)} onWiped={onWiped} />}
    </Card>
  );
}

// --- Wipe modal ------------------------------------------------------------

function WipeModal({ onClose, onWiped }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (text !== "WIPE" || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await vaultWipe("WIPE");
      onClose();
      onWiped?.();
    } catch (e) {
      setError(e);
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 10, 10, 0.78)",
          zIndex: 60,
        }}
      />
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        role="dialog"
        aria-label="Confirm wipe"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 61,
          display: "grid",
          placeItems: "center",
          padding: 24,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            width: "min(440px, 100%)",
            background: "var(--tac-surface)",
            border: "1px solid var(--tac-border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div
            style={{
              padding: "18px 22px",
              borderBottom: "1px solid var(--tac-border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: "rgba(240, 68, 94, 0.12)",
                color: "var(--tac-danger)",
                flexShrink: 0,
              }}
            >
              <Trash size={16} weight="regular" />
            </span>
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--tac-fg)",
                  lineHeight: 1.25,
                }}
              >
                Wipe vault
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tac-mute)",
                  marginTop: 2,
                }}
              >
                This deletes everything inside chiqo.ai
              </div>
            </div>
          </div>

          <div style={{ padding: "18px 22px", display: "grid", gap: 12 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--tac-fg)",
                lineHeight: 1.6,
              }}
            >
              Every saved analysis, script, transcript, and run will be
              permanently deleted. There is no undo.
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--tac-mute)",
                lineHeight: 1.55,
              }}
            >
              Type <strong style={{ color: "var(--tac-fg)" }}>WIPE</strong> to
              confirm:
            </p>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              spellCheck={false}
              className="tac-input"
              style={{
                fontSize: 13,
                padding: "10px 12px",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: "0.08em",
              }}
            />
            {error && <InlineError error={error} />}
          </div>

          <div
            style={{
              padding: "14px 22px",
              borderTop: "1px solid var(--tac-border)",
              background: "var(--tac-surface2)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="tac-btn"
              style={{ padding: "8px 14px", fontSize: 13 }}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={text !== "WIPE" || submitting}
              className="tac-btn tac-btn-danger"
              style={{
                padding: "8px 16px",
                fontSize: 13,
                opacity: text !== "WIPE" || submitting ? 0.5 : 1,
                cursor:
                  text !== "WIPE" || submitting ? "not-allowed" : "pointer",
              }}
            >
              <Trash size={12} weight="regular" />
              {submitting ? "Wiping…" : "Wipe everything"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// --- Shared bits -----------------------------------------------------------

function Header({ title, subtitle, icon: Icon }) {
  return (
    <div
      style={{
        padding: "20px 22px 16px",
        borderBottom: "1px solid var(--tac-border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      {Icon && (
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "var(--tac-accent-soft)",
            color: "var(--tac-accent)",
            flexShrink: 0,
          }}
        >
          <Icon size={16} weight="regular" />
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--tac-fg)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-mute)",
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function Body({ children }) {
  return (
    <div style={{ padding: "18px 22px", display: "grid", gap: 14 }}>
      {children}
    </div>
  );
}

function Footer({ children }) {
  return (
    <div
      style={{
        padding: "14px 22px",
        borderTop: "1px solid var(--tac-border)",
        background: "var(--tac-surface2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

function StepSlide({ children }) {
  return (
    <motion.div
      initial={{ x: 12, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -12, opacity: 0 }}
      transition={{ duration: 0.14 }}
    >
      {children}
    </motion.div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--tac-mute)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function EyeButton({ show, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={show ? "Hide password" : "Show password"}
      style={{
        position: "absolute",
        right: 8,
        top: "50%",
        transform: "translateY(-50%)",
        background: "transparent",
        border: "none",
        color: "var(--tac-mute)",
        cursor: "pointer",
        padding: 4,
        display: "grid",
        placeItems: "center",
      }}
    >
      {show ? (
        <EyeSlash size={14} weight="regular" />
      ) : (
        <Eye size={14} weight="regular" />
      )}
    </button>
  );
}

function StrengthMeter({ score, hasInput }) {
  if (!hasInput) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          display: "flex",
          gap: 4,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              background:
                i <= score
                  ? STRENGTH_COLORS[score]
                  : "var(--tac-surface2)",
              borderRadius: 2,
              transition: "background 120ms",
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: STRENGTH_COLORS[score],
          marginTop: 4,
        }}
      >
        {STRENGTH_LABELS[score]}
      </div>
    </div>
  );
}

function InlineError({ error }) {
  const msg = describeError(error);
  if (!msg) return null;
  return (
    <div
      role="alert"
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
    >
      <Warning size={14} weight="regular" color="var(--tac-danger)" />
      {msg}
    </div>
  );
}
