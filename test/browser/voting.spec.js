import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { ContractFactory, JsonRpcProvider, keccak256 } from "ethers";

const names = ["Jiya Narwani", "Jatin Nimje", "Anisa Nathani", "Prathamesh Pandey"];
const rpcUrl = "http://127.0.0.1:8545";
let provider, contract, accounts;

test.beforeAll(async () => { provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 }); accounts = await provider.send("eth_accounts", []); });
test.afterAll(() => provider?.destroy());
test.beforeEach(async ({ page }) => {
  const artifact = JSON.parse(await readFile("artifacts/contracts/Voting.sol/Voting.json", "utf8"));
  contract = await new ContractFactory(artifact.abi, artifact.bytecode, await provider.getSigner(0)).deploy("Student Council Election", names);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  await writeFile("public/deployment.json", JSON.stringify({ address, chainId: 31337, rpcUrl, codeHash: keccak256(await provider.getCode(address)) }));
  await page.addInitScript(({ accounts, rpcUrl }) => {
    let authorized = false;
    let account = accounts[1];
    let chainId = "0x7a69";
    let rejectedMethod = null;
    let unknownNetwork = false;
    const listeners = new Map();
    const emit = (event, value) => { for (const callback of listeners.get(event) ?? []) callback(value); };
    window.ethereum = {
      isMetaMask: true,
      on(event, callback) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(callback); },
      removeListener(event, callback) { listeners.get(event)?.delete(callback); },
      async request({ method, params = [] }) {
        if (method === rejectedMethod) { rejectedMethod = null; throw Object.assign(new Error("User rejected request"), { code: 4001 }); }
        if (method === "eth_chainId") return chainId;
        if (method === "eth_accounts") return authorized ? [account] : [];
        if (method === "eth_requestAccounts") { authorized = true; return [account]; }
        if (method === "wallet_switchEthereumChain" && unknownNetwork) throw Object.assign(new Error("Unknown network"), { code: 4902 });
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") { unknownNetwork = false; chainId = "0x7a69"; emit("chainChanged", chainId); return null; }
        const response = await fetch(rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const data = await response.json();
        if (data.error) throw Object.assign(new Error(data.error.message), data.error);
        return data.result;
      },
    };
    window.__testWallet = {
      reject(method) { rejectedMethod = method; },
      unknownNetwork() { unknownNetwork = true; chainId = "0x1"; emit("chainChanged", chainId); },
      setAccount(index) { account = accounts[index]; authorized = true; emit("accountsChanged", [account]); },
      setChain(id) { chainId = id; emit("chainChanged", chainId); },
      disconnect() { authorized = false; emit("accountsChanged", []); },
    };
  }, { accounts, rpcUrl });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await expect(page.getByText("Voting open", { exact: true })).toBeVisible();
});

async function connect(page) {
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toHaveCount(0);
}
async function vote(page, name = names[1]) {
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await page.getByRole("radio", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Cast my vote", exact: true }).click();
}

test("shows real election data and browse-only candidates without a wallet connection", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Student Council Election" })).toBeVisible();
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  for (const name of names) await expect(page.getByRole("radio", { name: new RegExp(name) })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cast my vote" })).toBeDisabled();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.getByText("No votes yet", { exact: true })).toBeVisible();
});

test("casts a real blockchain vote, shows confirmation, prevents another vote, and retains status after reload", async ({ page }) => {
  await connect(page);
  await vote(page);
  await expect(page.getByText("Your vote is confirmed on the blockchain.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Already voted", exact: true })).toBeDisabled();
  expect(await contract.totalVotes()).toBe(1n);
  expect(await contract.hasVoted(accounts[1])).toBe(true);
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.getByRole("meter", { name: "Jatin Nimje vote share" })).toHaveAttribute("aria-valuenow", "100");
  await page.reload();
  await connect(page);
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await expect(page.getByRole("button", { name: "Already voted", exact: true })).toBeDisabled();
});

test("handles a rejected wallet connection", async ({ page }) => {
  await page.evaluate(() => window.__testWallet.reject("eth_requestAccounts"));
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Request cancelled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
});

test("handles a rejected voting transaction without changing contract state", async ({ page }) => {
  await connect(page);
  await page.evaluate(() => window.__testWallet.reject("eth_sendTransaction"));
  await vote(page);
  await expect(page.getByRole("alert").filter({ hasText: "Request cancelled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cast my vote", exact: true })).toBeEnabled();
  expect(await contract.totalVotes()).toBe(0n);
  expect(await contract.hasVoted(accounts[1])).toBe(false);
});

test("blocks the wrong network and switches back to the local network", async ({ page }) => {
  await connect(page);
  await page.evaluate(() => window.__testWallet.setChain("0x1"));
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Jatin Nimje/ })).toBeDisabled();
  await page.getByRole("alert").getByRole("button", { name: "Switch network", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Jatin Nimje/ })).toBeEnabled();
  expect(await contract.totalVotes()).toBe(0n);
});

test("updates duplicate-vote status when the connected account changes", async ({ page }) => {
  await connect(page);
  await vote(page);
  await expect(page.getByRole("button", { name: "Already voted" })).toBeDisabled();
  await page.evaluate(() => window.__testWallet.setAccount(2));
  await expect(page.getByRole("radio", { name: /Anisa Nathani/ })).toBeEnabled();
  await page.getByRole("radio", { name: /Anisa Nathani/ }).click();
  await page.getByRole("button", { name: "Cast my vote" }).click();
  await expect(page.getByRole("button", { name: "Already voted" })).toBeDisabled();
  expect(await contract.totalVotes()).toBe(2n);
  await page.evaluate(() => window.__testWallet.setAccount(1));
  await expect(page.getByRole("button", { name: "Already voted" })).toBeDisabled();
});

test("shows owner controls only to the deployer and closes and reopens voting", async ({ page }) => {
  await connect(page);
  await expect(page.getByRole("region", { name: "Election administration" })).toHaveCount(0);
  await page.evaluate(() => window.__testWallet.setAccount(0));
  await page.getByRole("button", { name: "Close voting", exact: true }).click();
  await expect(page.getByText("Voting is now closed.", { exact: true })).toBeVisible();
  expect(await contract.votingOpen()).toBe(false);
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Jatin Nimje/ })).toBeDisabled();
  await page.getByRole("button", { name: "Open voting", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Jatin Nimje/ })).toBeEnabled();
  expect(await contract.votingOpen()).toBe(true);
});

test("refreshes results when another address votes outside the frontend", async ({ page }) => {
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await (await contract.connect(await provider.getSigner(3)).vote(4)).wait();
  await expect(page.getByRole("meter", { name: "Prathamesh Pandey vote share" })).toHaveAttribute("aria-valuenow", "100");
});

test("clears voting access when the wallet disconnects", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await page.evaluate(() => window.__testWallet.disconnect());
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Jatin Nimje/ })).toBeDisabled();
});

test("reports missing deployment and recovers after retry", async ({ page }) => {
  await page.route("**/deployment.json", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Missing" }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "No contract deployment found" })).toBeVisible();
  await page.unroute("**/deployment.json");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Voting open", { exact: true })).toBeVisible();
});

test("detects a stale or different deployed contract", async ({ page }) => {
  await page.route("**/deployment.json", (route) => route.fulfill({ json: { address: accounts[5], chainId: 31337, rpcUrl, codeHash: "0x00" } }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "contract is missing or has changed" })).toBeVisible();
});

test("works on a mobile viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await connect(page);
  await vote(page, names[0]);
  await expect(page.getByText("Your vote is confirmed on the blockchain.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("renders the desktop interface without JavaScript errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Student Council Election" })).toBeVisible();
  await page.screenshot({ path: "test-results/home.png", fullPage: true });
  await connect(page);
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Jatin Nimje/ })).toBeEnabled();
  await page.screenshot({ path: "test-results/candidates.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("explains how to connect when MetaMask is not installed", async ({ page }) => {
  await page.evaluate(() => { delete window.ethereum; });
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "MetaMask was not found" })).toBeVisible();
  expect(await contract.totalVotes()).toBe(0n);
});

test("cancelling the choice confirmation submits no transaction", async ({ page }) => {
  await connect(page);
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => dialog.dismiss());
  await vote(page);
  await expect(page.getByRole("button", { name: "Cast my vote" })).toBeEnabled();
  expect(await contract.totalVotes()).toBe(0n);
  expect(await contract.hasVoted(accounts[1])).toBe(false);
});

test("adds an unknown local network before switching to it", async ({ page }) => {
  await connect(page);
  await page.evaluate(() => window.__testWallet.unknownNetwork());
  await page.getByRole("alert").getByRole("button", { name: "Switch network", exact: true }).click();
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Jatin Nimje/ })).toBeEnabled();
});

test("handles rejection of a network switch without permitting voting", async ({ page }) => {
  await connect(page);
  await page.evaluate(() => { window.__testWallet.setChain("0x1"); window.__testWallet.reject("wallet_switchEthereumChain"); });
  await page.getByRole("alert").getByRole("button", { name: "Switch network", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Request cancelled" })).toBeVisible();
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Jatin Nimje/ })).toBeDisabled();
});

test("supports candidate selection with the keyboard", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "Candidates", exact: true }).click();
  const first = page.getByRole("radio", { name: /Jiya Narwani/ });
  await expect(first).toBeEnabled();
  await first.focus();
  await first.press("ArrowRight");
  const second = page.getByRole("radio", { name: /Jatin Nimje/ });
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-checked", "true");
  await second.press("End");
  await expect(page.getByRole("radio", { name: /Prathamesh Pandey/ })).toHaveAttribute("aria-checked", "true");
});
