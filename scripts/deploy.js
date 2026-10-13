import { mkdir, writeFile } from "node:fs/promises";
import { network } from "hardhat";

const connection = await network.create();
try {
  const { ethers } = connection;
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 31337n) throw new Error("Deployment is restricted to the local Hardhat network (31337).");
  const names = ["Jiya Narwani", "Jatin Nimje", "Anisa Nathani", "Prathamesh Pandey"];
  const contract = await ethers.deployContract("Voting", ["Student Council Election", names]);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployment = {
    address,
    chainId: Number(chain.chainId),
    rpcUrl: "http://127.0.0.1:8545",
    codeHash: ethers.keccak256(await ethers.provider.getCode(address)),
    transactionHash: contract.deploymentTransaction().hash,
  };
  await mkdir("public", { recursive: true });
  await writeFile("public/deployment.json", JSON.stringify(deployment, null, 2) + "\n");
  console.log(`Voting deployed at ${address}`);
  console.log("Frontend deployment configuration updated automatically.");
} finally {
  await connection.close();
}
