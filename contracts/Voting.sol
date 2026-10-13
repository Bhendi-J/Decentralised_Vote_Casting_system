// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice One election, a fixed candidate list, and one vote per address.
/// @dev Educational prototype: addresses do not establish real-world eligibility.
contract Voting {
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    address public immutable owner;
    string public electionName;
    bool public votingOpen = true;
    uint256 public totalVotes;
    mapping(address => bool) public hasVoted;
    Candidate[] private candidates;

    event VoteCast(address indexed voter, uint256 indexed candidateId);
    event VotingStatusChanged(bool open);

    constructor(string memory name, string[] memory candidateNames) {
        require(bytes(name).length > 0 && bytes(name).length <= 120, "Invalid election name");
        require(candidateNames.length >= 2 && candidateNames.length <= 20, "Use 2 to 20 candidates");
        owner = msg.sender;
        electionName = name;
        for (uint256 i = 0; i < candidateNames.length; i++) {
            require(bytes(candidateNames[i]).length > 0 && bytes(candidateNames[i]).length <= 64, "Invalid candidate name");
            for (uint256 j = 0; j < i; j++) {
                require(keccak256(bytes(candidateNames[i])) != keccak256(bytes(candidateNames[j])), "Duplicate candidate name");
            }
            candidates.push(Candidate(i + 1, candidateNames[i], 0));
        }
    }

    function getCandidates() external view returns (Candidate[] memory) {
        return candidates;
    }

    function vote(uint256 candidateId) external {
        require(votingOpen, "Voting is closed");
        require(!hasVoted[msg.sender], "You have already voted");
        require(candidateId > 0 && candidateId <= candidates.length, "Invalid candidate");
        hasVoted[msg.sender] = true;
        candidates[candidateId - 1].voteCount += 1;
        totalVotes += 1;
        emit VoteCast(msg.sender, candidateId);
    }

    function setVotingOpen(bool open) external {
        require(msg.sender == owner, "Only the election owner");
        votingOpen = open;
        emit VotingStatusChanged(open);
    }
}
