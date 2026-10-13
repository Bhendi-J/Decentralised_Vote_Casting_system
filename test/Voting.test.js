import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { network } from "hardhat";

describe("Voting smart contract", () => {
  let connection, ethers, owner, voter, other, contract;
  const names = ["Jiya Narwani", "Jatin Nimje", "Anisa Nathani", "Prathamesh Pandey"];

  before(async () => {
    connection = await network.create("default");
    ethers = connection.ethers;
    [owner, voter, other] = await ethers.getSigners();
  });
  after(async () => { await connection?.close(); });
  beforeEach(async () => {
    contract = await ethers.deployContract("Voting", ["Student Council Election", names]);
    await contract.waitForDeployment();
  });

  it("initializes the election, fixed candidate IDs, owner and empty totals", async () => {
    assert.equal(await contract.owner(), owner.address);
    assert.equal(await contract.electionName(), "Student Council Election");
    assert.equal(await contract.votingOpen(), true);
    assert.equal(await contract.totalVotes(), 0n);
    assert.equal(await contract.hasVoted(voter.address), false);
    const candidates = await contract.getCandidates();
    assert.deepEqual(candidates.map((item) => item.name), names);
    assert.deepEqual(candidates.map((item) => item.id), [1n, 2n, 3n, 4n]);
    assert.ok(candidates.every((item) => item.voteCount === 0n));
  });

  it("records a vote, updates voter status and emits its confirmation event", async () => {
    const tx = await contract.connect(voter).vote(2);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);
    assert.equal(await contract.hasVoted(voter.address), true);
    assert.equal(await contract.totalVotes(), 1n);
    assert.equal((await contract.getCandidates())[1].voteCount, 1n);
    const event = receipt.logs.map((log) => contract.interface.parseLog(log)).find((log) => log?.name === "VoteCast");
    assert.equal(event.args.voter, voter.address);
    assert.equal(event.args.candidateId, 2n);
  });

  it("rejects a second vote for both the same and a different candidate", async () => {
    await (await contract.connect(voter).vote(2)).wait();
    await assert.rejects(contract.connect(voter).vote(2), /You have already voted/);
    await assert.rejects(contract.connect(voter).vote(3), /You have already voted/);
    assert.equal(await contract.totalVotes(), 1n);
    assert.equal((await contract.getCandidates())[2].voteCount, 0n);
  });

  it("lets different wallet addresses vote independently", async () => {
    await (await contract.connect(voter).vote(1)).wait();
    await (await contract.connect(other).vote(1)).wait();
    assert.equal((await contract.getCandidates())[0].voteCount, 2n);
    assert.equal(await contract.totalVotes(), 2n);
  });

  for (const invalid of [0n, 5n, 2n ** 256n - 1n]) {
    it(`rejects invalid candidate ID ${invalid} without consuming the vote`, async () => {
      await assert.rejects(contract.connect(voter).vote(invalid), /Invalid candidate/);
      assert.equal(await contract.hasVoted(voter.address), false);
      assert.equal(await contract.totalVotes(), 0n);
      await (await contract.connect(voter).vote(1)).wait();
      assert.equal(await contract.totalVotes(), 1n);
    });
  }

  it("lets the owner close voting, preserving all existing totals", async () => {
    await (await contract.connect(voter).vote(1)).wait();
    const receipt = await (await contract.setVotingOpen(false)).wait();
    assert.equal(await contract.votingOpen(), false);
    const event = contract.interface.parseLog(receipt.logs[0]);
    assert.equal(event.name, "VotingStatusChanged");
    assert.equal(event.args.open, false);
    await assert.rejects(contract.connect(other).vote(3), /Voting is closed/);
    assert.equal(await contract.hasVoted(other.address), false);
    assert.equal(await contract.totalVotes(), 1n);
  });

  it("rejects owner actions from other accounts", async () => {
    await assert.rejects(contract.connect(voter).setVotingOpen(false), /Only the election owner/);
    assert.equal(await contract.votingOpen(), true);
    await (await contract.setVotingOpen(false)).wait();
    await assert.rejects(contract.connect(voter).setVotingOpen(true), /Only the election owner/);
    assert.equal(await contract.votingOpen(), false);
  });

  it("reopens voting without resetting voter history or vote totals", async () => {
    await (await contract.connect(voter).vote(4)).wait();
    await (await contract.setVotingOpen(false)).wait();
    await (await contract.setVotingOpen(true)).wait();
    await assert.rejects(contract.connect(voter).vote(1), /You have already voted/);
    await (await contract.connect(other).vote(4)).wait();
    assert.equal(await contract.totalVotes(), 2n);
    assert.equal((await contract.getCandidates())[3].voteCount, 2n);
  });

  it("keeps the total equal to all candidate vote counts", async () => {
    const signers = (await ethers.getSigners()).slice(0, 12);
    for (let i = 0; i < signers.length; i++) await (await contract.connect(signers[i]).vote((i % 4) + 1)).wait();
    const candidates = await contract.getCandidates();
    assert.equal(candidates.reduce((sum, item) => sum + item.voteCount, 0n), await contract.totalVotes());
    assert.ok(candidates.every((item) => item.voteCount === 3n));
  });

  it("rejects empty and excessively long election names", async () => {
    for (const name of ["", "a".repeat(121)]) await assert.rejects(ethers.deployContract("Voting", [name, names]), /Invalid election name/);
  });

  it("rejects fewer than two or more than twenty candidates", async () => {
    for (const list of [[], ["Alice"], Array.from({ length: 21 }, (_, i) => `Candidate ${i}`)]) {
      await assert.rejects(ethers.deployContract("Voting", ["Election", list]), /Use 2 to 20 candidates/);
    }
  });

  it("rejects empty, excessively long and duplicate candidate names", async () => {
    for (const name of ["", "a".repeat(65)]) await assert.rejects(ethers.deployContract("Voting", ["Election", ["Alice", name]]), /Invalid candidate name/);
    await assert.rejects(ethers.deployContract("Voting", ["Election", ["Alice", "Alice"]]), /Duplicate candidate name/);
  });

  it("cannot accept an ETH payment with a vote", async () => {
    await assert.rejects(contract.connect(voter).vote(1, { value: 1n }));
    assert.equal(await contract.hasVoted(voter.address), false);
    assert.equal(await contract.totalVotes(), 0n);
  });
});
