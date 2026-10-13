import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

async function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(true); });
  });
}

function run(script, quiet = false) {
  const child = spawn(process.execPath, ["node_modules/hardhat/dist/src/cli.js", ...script], {
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  children.add(child);
  let errors = "";
  if (quiet) {
    child.stdout.on("data", () => {});
    child.stderr.on("data", (data) => { errors = (errors + data.toString()).slice(-4000); });
  }
  child.on("error", (error) => { console.error(error.message); stop(1); });
  child.on("exit", (code) => {
    children.delete(child);
    if (quiet && !stopping) {
      console.error(errors || "Local blockchain stopped unexpectedly.");
      stop(code || 1);
    }
  });
  return child;
}

try {
  for (const port of [8545, 5173]) {
    if (await portInUse(port)) throw new Error(`Port ${port} is in use. Stop that server first, or follow the manual startup steps in README.md.`);
  }
  console.log("Starting the local Hardhat blockchain…");
  run(["node", "--hostname", "127.0.0.1"], true);
  let ready = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:8545", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(1000),
      });
      if ((await response.json()).result === "0x7a69") { ready = true; break; }
    } catch { /* Wait for the owned node to start listening. */ }
    await delay(500);
  }
  if (stopping) process.exit(0);
  if (!ready) throw new Error("The local blockchain did not become ready within 30 seconds.");
  const deploy = run(["run", "scripts/deploy.js", "--network", "localhost"]);
  const deployCode = await new Promise((resolve) => deploy.once("exit", resolve));
  if (stopping) process.exit(0);
  if (deployCode !== 0) throw new Error("Contract deployment failed; the website was not started.");
  const frontend = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], { stdio: "inherit" });
  children.add(frontend);
  frontend.on("error", (error) => { console.error(error.message); stop(1); });
  frontend.on("exit", (code) => { children.delete(frontend); stop(code || 0); });
  console.log("Open http://127.0.0.1:5173. Press Ctrl+C to stop both servers.");
} catch (error) {
  console.error(error.message);
  stop(1);
}
