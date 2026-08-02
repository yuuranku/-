import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Cloudflare Builds runs on Linux. Refreshing dependencies there prevents npm
// from reusing a Windows-generated optional Rollup native package selection.
if (process.platform === "linux") {
  console.log("Refreshing Linux optional dependencies for Cloudflare build...");
  rmSync("node_modules", { recursive: true, force: true });
  run("npm", ["install", "--include=optional", "--no-save", "--package-lock=false"]);
}

run(process.platform === "win32" ? "npm.cmd" : "npm", [
  "run",
  "build",
  "--workspace=baiyuan-antarctic-globe",
]);
