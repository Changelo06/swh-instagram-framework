#!/usr/bin/env node
// Tiny wrapper around `electron .` that scrubs ELECTRON_RUN_AS_NODE from
// the env before spawning. That env var is set by some nested-Electron
// contexts (e.g., parent processes that themselves embed Electron, like
// Claude Code or VS Code's terminal) and causes Electron to behave like
// vanilla Node — which makes `require("electron")` return a path string
// instead of the API surface, crashing our main process.
//
// In a normal user shell this var is unset and the wrapper is a no-op
// passthrough.

const { spawn } = require("node:child_process");
const path = require("node:path");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// require("electron") returns the absolute path to the Electron binary
// when invoked from a regular Node process.
const electronBin = require("electron");
const projectRoot = path.resolve(__dirname, "..");

const child = spawn(electronBin, [projectRoot], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => process.exit(code ?? 0));
