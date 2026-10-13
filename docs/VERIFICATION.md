# Implementation cross-check

Verified on **13 October 2026** using Node **22.17.0**, Solidity **0.8.30**, Hardhat **3.19.0**, and installed Google Chrome.

The supplied Pages report was read as project requirements. Its prose and screenshots were used to identify the stack, workflow, and four candidate names. The original report was not changed.

## Report workflow

| Report step | Implementation | Verification |
| --- | --- | --- |
| React + Vite frontend | Home, Candidates, and Results views in `src/App.jsx` | Desktop and mobile browser checks; successful production build |
| Wallet connection | `eth_requestAccounts` and `eth_accounts` via the injected EIP-1193 provider | Connect, rejected connection, missing MetaMask, account change, disconnect |
| Expected network | Chain 31337 validation; switch or add Hardhat Local | Wrong-network voting blocked; switch, add-network fallback, and rejected switch |
| Election and candidate display | Read Solidity state through ethers and the local RPC | Four names match the report; live contract data shown without requiring wallet access |
| Candidate selection | One selected candidate; explicit confirmation before submitting | Mouse, keyboard, mobile, and cancelled confirmation checked |
| Transaction signing | ethers `BrowserProvider` and wallet signer | Real transactions submitted through the test provider; rejected transaction records no vote |
| Voting open check | Solidity `require(votingOpen)` | Closed votes revert and leave the voter's status unchanged |
| Valid candidate check | Solidity bounds check against the fixed candidate list | IDs 0, 5, and maximum uint256 revert; a valid vote still succeeds afterward |
| One vote per wallet | `mapping(address => bool) hasVoted` | Same/different-candidate duplicate attempts revert; independent addresses can vote |
| Confirmation | Wait for one successful receipt before showing success | UI receipt, actual voter state, and actual totals checked after submission |
| Updated results | Same-block contract reads; automatic four-second refresh | Percentages and totals reflect transactions; external votes appear automatically |
| Hardhat deployment and testing | Local compiler, deployment script, generated frontend ABI/configuration | Compile, 15 contract tests, real local deployment, and matching runtime code hash |

## Additional implementation checks

- Only the deployer can open or close voting. Reopening preserves all vote counts and voting history.
- Election and candidate names have bounds; duplicate candidate names are rejected.
- Voting cannot accept ETH as payment. Local test ETH is used only for transaction gas.
- The sum of candidate counts equals the contract's total, including a twelve-address voting test.
- Missing/stale deployment data is reported and voting is disabled until the contract can be verified.
- Voting remains disabled while a newly selected account's voter status is being loaded.
- Frontend contract ABI is exported from the compiled contract. No manually maintained ABI or copied contract address is required.
- Local test accounts documented in the README were checked against their keys and actual funded balances.
- Startup rejects an occupied port without replacing or modifying the existing election.
- Frontend and chain are bound to the loopback interface.
- Source changes and deployment data remain in this workspace. No public deployment was created.

## Executed checks

| Check | Result |
| --- | --- |
| `npm test` | **15 passed, 0 failed** |
| `npm run test:browser` | **18 passed, 0 failed** |
| `npm run build` | **Passed**, including the final source state |
| Dependency audit after patched dependency installation | **0 vulnerabilities reported** |
| `npm start` | **Passed**: chain starts, contract deploys, frontend serves HTTP 200 |
| Fresh deployed contract | **Passed**: chain 31337, matching runtime code hash, four candidates, voting open, zero votes |
| README accounts | **Passed**: all three keys derive the documented addresses; all have local test ETH |
| Starting a second instance | **Passed**: exits cleanly with the occupied-port explanation; existing election unchanged |
| Ctrl+C shutdown | **Passed**: both owned servers stop and ports 8545 and 5173 are released |

## Browser verification scope

Browser tests use a **test-only EIP-1193 wallet provider** to submit actual transactions to the local Hardhat blockchain. The application's production source has no test-wallet mode and uses the browser's real injected wallet. The tests verify application and contract integration, including rejection and account/network events. They do **not** automate MetaMask's extension installation, onboarding, permission dialogs, or transaction confirmation UI; those require the manual steps in the README.

The interface was visually inspected at desktop and 375-pixel mobile widths. No page JavaScript errors were observed in the checked desktop navigation flow, and the mobile voting flow had no horizontal overflow. Verified captures: [home](screenshots/home.png), [candidates](screenshots/candidates.png), and [mobile](screenshots/mobile.png).

The contract and tests are an educational implementation, not a formal security audit. Local Hardhat state resets when the blockchain is restarted. Ballot privacy and real-world voter eligibility remain outside this prototype's scope, as described in the supplied report.
