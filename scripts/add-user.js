// Add a user (or rotate a password) for chiqo.ai.
//
// Usage:
//   node scripts/add-user.js <email> <password> [label]
//
// Reads / writes server/users.json. Safe to re-run for the same email — it
// overwrites the password hash and label.

import crypto from "node:crypto";
import { hashPassword, loadUsers, saveUsers } from "../server/auth.js";

const [, , email, password, label] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/add-user.js <email> <password> [label]");
  process.exit(1);
}

const store = loadUsers();
const users = store.users || [];
const lc = email.trim().toLowerCase();
const existing = users.findIndex((u) => u.email?.toLowerCase() === lc);
const now = new Date().toISOString();

const next = {
  id: existing >= 0 ? users[existing].id : `u_${crypto.randomUUID().slice(0, 8)}`,
  email: email.trim(),
  passwordHash: hashPassword(password),
  label: label || (existing >= 0 ? users[existing].label : null),
  apiKey: existing >= 0 ? users[existing].apiKey || null : null,
  createdAt: existing >= 0 ? users[existing].createdAt || now : now,
  updatedAt: now,
};

if (existing >= 0) {
  users[existing] = next;
  console.log(`Updated user ${next.email}`);
} else {
  users.push(next);
  console.log(`Created user ${next.email} (id ${next.id})`);
}

saveUsers({ users });
