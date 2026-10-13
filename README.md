# VoteChain — Blockchain Voting Mini Project

A basic implementation of the supplied mini project report. It uses **React + Vite**, **ethers.js**, **MetaMask**, **Solidity**, and a **local Hardhat blockchain**. There is one election and four candidates matching the report's sample screen.

## Run the project

Use **Node.js 22 LTS, version 22.13 or later**, and npm. If you use nvm, run `nvm use` in this folder. On this Mac, Node 22 is already available through Homebrew:

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm install
npm start
```

Open **http://127.0.0.1:5173**. Keep the terminal running. `npm start` compiles the contract, starts the local blockchain, deploys a fresh election, and starts the website. Press **Ctrl+C** to stop both servers.

If dependencies are already installed, just run `npm start`. Ports **8545** and **5173** must be available; the startup script checks them and stops with an explanation if either is occupied.

**Restarting the local blockchain resets all votes.** This is normal for the in-memory Hardhat development network. Do not restart it in the middle of a demonstration. Redeploying creates a new election at a new contract address.

## Set up MetaMask

1. Install the [official MetaMask browser extension](https://metamask.io/download/) and open the site in that browser.
2. Add the following network in MetaMask, or connect your wallet and click **Switch network** in the app:

   | Setting | Value |
   | --- | --- |
   | Network name | Hardhat Local |
   | RPC URL | `http://127.0.0.1:8545` |
   | Chain ID | `31337` |
   | Currency symbol | `ETH` |

3. Import a funded **local test account** into MetaMask using a private key below. These are Hardhat's publicly known development keys. They contain only local test ETH. **Never send real funds to them or use them on a public network.**

   **Election owner (Hardhat account 0):**

   ```text
   Address:     0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
   Private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

   **Voter 1 (Hardhat account 1):**

   ```text
   Address:     0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   Private key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
   ```

   **Voter 2 (Hardhat account 2):**

   ```text
   Address:     0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
   Private key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
   ```

4. Select Voter 1 and click **Connect wallet**. Choose **Candidates**, select a candidate, and click **Cast my vote**. Confirm your choice and approve the transaction in MetaMask.
5. Wait for the confirmation message, then open **Results**. The application reads the contract's totals every four seconds. The same wallet cannot vote again.
6. Switch to Voter 2 to demonstrate another vote. Switch to the owner account to see **Close voting** / **Open voting** controls.

Only one wallet address is exposed by the browser connection at a time. If MetaMask switches to an account that is not connected to the site, connect that account through MetaMask's site permissions.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start a fresh local election and website together |
| `npm run compile` | Compile Solidity and export the actual ABI to React |
| `npm test` | Compile and run the isolated smart contract tests |
| `npm run test:browser` | Start an isolated local app and run browser integration tests |
| `npm run check` | Run smart contract tests and build the frontend |
| `npm run build` | Build the frontend into `dist/` |
| `npm run preview` | Preview the built frontend on port 4173 |

Browser tests need Chrome or Playwright Chromium. On this Mac they automatically use the installed Google Chrome. On other systems, run `npx playwright install chromium` once. Alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to your Chromium executable. Stop an existing `npm start` before browser tests: tests own their blockchain, deploy new contracts, and replace the local deployment configuration.

Building the website does not package a running blockchain. The local RPC must stay running, and `dist/deployment.json` must correspond to that blockchain. Build after deploying when previewing a build.

## Manual startup

For separate terminals, first run `npm run compile`, then:

```sh
# Terminal 1: keep the blockchain running
npm run chain
```

```sh
# Terminal 2: deploy once, then keep the frontend running
npm run deploy
npm run dev
```

The deploy script automatically writes `public/deployment.json`; there is no contract address to copy or private key to put into the frontend. Deployment uses an unlocked local Hardhat account and is restricted to chain 31337. The compiler comes from the installed `solc` package, so compilation does not need a separate compiler download.

## Project structure

```text
contracts/Voting.sol        Election data and voting rules
hardhat.config.js          Solidity compiler and local network configuration
scripts/deploy.js          Contract deployment and frontend configuration
scripts/export-abi.js      Frontend ABI generated from the compiler output
scripts/start.js           One-command local startup and cleanup
src/App.jsx                Home, candidates, results and owner controls
src/blockchain.js          Contract reads, wallet connection and transactions
src/styles.css             Responsive interface styling
test/Voting.test.js        Smart contract validation
test/browser/              Browser tests using a test-only wallet provider
docs/report-extract.txt    Text extracted from the supplied Pages report
docs/VERIFICATION.md       Implementation cross-check and verification evidence
```

## How it works

The frontend reads election state directly from the local RPC. For writes it asks MetaMask to sign a transaction. The contract checks voting status, candidate validity, and whether `msg.sender` has already voted. A successful transaction updates the candidate's count, the total, and the address's voting status together. The UI waits for a successful receipt before showing confirmation, then reads the updated state. All fields in an election refresh use the same block.

The candidate list is fixed at deployment. The deployer can pause or reopen voting, but cannot edit candidates, remove votes, or clear voter history. To start a separate election, deploy a new contract.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| MetaMask not found | Install the extension and reload the app in that browser |
| Wrong network | Click **Switch network** and approve the request in MetaMask |
| No deployment / contract missing | Start the blockchain, run `npm run deploy`, and refresh |
| Cannot reach local blockchain | Keep `npm start` or `npm run chain` running |
| Not enough ETH | Use one of the funded local accounts above |
| Request already pending | Open MetaMask and finish or cancel its existing request |
| Nonce too high after restarting the chain | In MetaMask, clear the local account's activity/nonce data; the new Hardhat chain starts from scratch |
| Port already occupied | Stop the old project terminal with Ctrl+C, or use manual startup with its existing local chain |

## Scope

This is the educational prototype described in the report. One address per vote does not prove voter identity or eligibility; a person can control multiple wallets. Transaction data and voter choices are inspectable on the network. Real elections require identity, ballot privacy, operational security, and independent review beyond this project.

Development dependencies are pinned in `package-lock.json`. The `tmp` override selects a patched release used by the local Solidity tooling.

Reference documentation: [Hardhat configuration](https://hardhat.org/docs/reference/configuration), [ethers providers](https://docs.ethers.org/v6/api/providers/), and [MetaMask network management](https://docs.metamask.io/metamask-connect/evm/guides/manage-networks/).
