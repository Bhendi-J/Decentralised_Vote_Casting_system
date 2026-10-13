import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.30",
    path: fileURLToPath(new URL("./node_modules/solc/soljson.js", import.meta.url)),
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai" },
  },
  networks: {
    default: { type: "edr-simulated", chainType: "l1", chainId: 31337 },
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545", chainId: 31337 },
  },
});
