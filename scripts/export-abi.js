import { mkdir, readFile, writeFile } from "node:fs/promises";

const artifact = JSON.parse(await readFile("artifacts/contracts/Voting.sol/Voting.json", "utf8"));
await mkdir("src/generated", { recursive: true });
await writeFile("src/generated/Voting.json", JSON.stringify({ abi: artifact.abi }, null, 2) + "\n");
console.log("Frontend ABI updated from the compiled Voting contract.");
