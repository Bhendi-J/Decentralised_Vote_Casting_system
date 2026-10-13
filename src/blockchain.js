import { BrowserProvider, Contract, JsonRpcProvider, isAddress, keccak256 } from "ethers";
import artifact from "./generated/Voting.json";

let readProvider;
let providerUrl;

export function getWalletProvider() {
  const injected = window.ethereum;
  return injected?.providers?.find((provider) => provider.isMetaMask) ?? injected ?? null;
}

export function explainError(error) {
  const codes = [error?.code, error?.info?.error?.code, error?.error?.code, error?.data?.originalError?.code];
  if (codes.includes(4001) || codes.includes("ACTION_REJECTED")) return "Request cancelled in your wallet. No changes were recorded.";
  if (codes.includes(-32002)) return "A request is already pending. Open MetaMask to finish it.";
  if (codes.includes("INSUFFICIENT_FUNDS")) return "This account needs local test ETH. Import a funded Hardhat test account using the README.";
  const reason = error?.reason ?? error?.revert?.args?.[0];
  if (reason) return String(reason);
  return error?.shortMessage ?? error?.message ?? "Something went wrong. Please try again.";
}

export async function loadDeployment() {
  const response = await fetch("/deployment.json", { cache: "no-store" });
  if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
    throw new Error("No contract deployment found. Run npm start, or run npm run deploy after starting the blockchain.");
  }
  const deployment = await response.json();
  if (!isAddress(deployment.address) || deployment.chainId !== 31337 || !deployment.rpcUrl || !deployment.codeHash) {
    throw new Error("Deployment configuration is invalid. Run npm run deploy again.");
  }
  return deployment;
}

export async function readElection(address = null) {
  const deployment = await loadDeployment();
  if (!readProvider || providerUrl !== deployment.rpcUrl) {
    readProvider?.destroy();
    providerUrl = deployment.rpcUrl;
    readProvider = new JsonRpcProvider(providerUrl, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
  }
  try {
    const network = await readProvider.getNetwork();
    if (Number(network.chainId) !== deployment.chainId) throw new Error("The RPC is connected to the wrong network.");
    const blockTag = await readProvider.getBlockNumber();
    const code = await readProvider.getCode(deployment.address, blockTag);
    if (code === "0x" || keccak256(code) !== deployment.codeHash) {
      throw new Error("The deployed contract is missing or has changed. Run npm run deploy again and refresh this page.");
    }
    const contract = new Contract(deployment.address, artifact.abi, readProvider);
    const overrides = { blockTag };
    const [name, owner, open, total, list, voted] = await Promise.all([
      contract.electionName(overrides), contract.owner(overrides), contract.votingOpen(overrides), contract.totalVotes(overrides),
      contract.getCandidates(overrides), address ? contract.hasVoted(address, overrides) : false,
    ]);
    const candidates = list.map((candidate) => ({ id: Number(candidate.id), name: candidate.name, votes: Number(candidate.voteCount) }));
    if (candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== Number(total)) {
      throw new Error("The vote totals could not be verified. Please refresh this page.");
    }
    return { deployment, name, owner, open, total: Number(total), candidates, voted, voterAddress: address };
  } catch (error) {
    if (["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT", "UNKNOWN_ERROR"].includes(error.code) || error instanceof TypeError) {
      throw new Error("Cannot reach the local blockchain. Keep npm start running, then refresh this page.");
    }
    throw error;
  }
}

export async function walletState(provider, requestAccess = false) {
  const accounts = await provider.request({ method: requestAccess ? "eth_requestAccounts" : "eth_accounts" });
  const chainId = await provider.request({ method: "eth_chainId" });
  return { address: accounts[0] ?? null, chainId: Number(BigInt(chainId)) };
}

export async function switchNetwork(provider) {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7a69" }] });
  } catch (error) {
    const code = error.code ?? error?.data?.originalError?.code;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: "0x7a69", chainName: "Hardhat Local", rpcUrls: ["http://127.0.0.1:8545"], nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 } }],
    });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7a69" }] });
  }
}

export async function sendAction(provider, address, action, value, onSubmitted) {
  const wallet = await walletState(provider);
  if (!wallet.address || wallet.address.toLowerCase() !== address.toLowerCase()) throw new Error("Your wallet account changed. Please try again with the selected account.");
  if (wallet.chainId !== 31337) throw new Error("Switch your wallet to Hardhat Local before continuing.");
  const fresh = await readElection(address);
  if (action === "vote") {
    if (!fresh.open) throw new Error("Voting is closed");
    if (fresh.voted) throw new Error("You have already voted");
    if (!fresh.candidates.some((candidate) => candidate.id === value)) throw new Error("Invalid candidate");
  } else if (action !== "setVotingOpen" || fresh.owner.toLowerCase() !== address.toLowerCase()) {
    throw new Error("Only the election owner");
  }
  const browser = new BrowserProvider(provider, undefined, { cacheTimeout: -1 });
  try {
    const signer = await browser.getSigner(address);
    const contract = new Contract(fresh.deployment.address, artifact.abi, signer);
    const transaction = await contract[action](value);
    onSubmitted(transaction.hash);
    let receipt;
    try {
      receipt = await transaction.wait(1);
    } catch (error) {
      // MetaMask's speed-up preserves the action but replaces its transaction hash.
      if (error.code === "TRANSACTION_REPLACED" && !error.cancelled && error.receipt?.status === 1) {
        receipt = error.receipt;
      } else if (error.code === "TRANSACTION_REPLACED" && error.cancelled) {
        throw new Error("The transaction was cancelled or replaced in your wallet. Check the refreshed results before trying again.");
      } else {
        throw error;
      }
    }
    if (!receipt || receipt.status !== 1) throw new Error("The transaction failed. No change was recorded.");
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, address };
  } finally {
    browser.destroy();
  }
}
