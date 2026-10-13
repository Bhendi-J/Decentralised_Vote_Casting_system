import { useCallback, useEffect, useRef, useState } from "react";
import { explainError, getWalletProvider, readElection, sendAction, switchNetwork, walletState } from "./blockchain.js";

const shorten = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function CheckIcon({ className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function App() {
  const [tab, setTab] = useState("Home");
  const [wallet, setWallet] = useState({ address: null, chainId: null });
  const [election, setElection] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const walletRef = useRef(wallet);
  const busyRef = useRef(false);
  const refreshVersion = useRef(0);
  const mounted = useRef(false);
  const walletVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setRefreshing(true);
    try {
      const current = await readElection(walletRef.current.address);
      if (mounted.current && version === refreshVersion.current) { setElection(current); setLoadError(""); }
    } catch (error) {
      if (mounted.current && version === refreshVersion.current) setLoadError(explainError(error));
    } finally {
      if (mounted.current && version === refreshVersion.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const provider = getWalletProvider();
    const syncWallet = async () => {
      const version = ++walletVersion.current;
      try {
        const next = provider ? await walletState(provider) : { address: null, chainId: null };
        if (!mounted.current || version !== walletVersion.current) return;
        walletRef.current = next;
        setWallet(next);
        setSelected(null);
        await refresh();
      } catch {
        if (!mounted.current || version !== walletVersion.current) return;
        walletRef.current = { address: null, chainId: null };
        setWallet(walletRef.current);
        await refresh();
      }
    };
    const disconnect = () => {
      ++walletVersion.current;
      walletRef.current = { address: null, chainId: null };
      setWallet(walletRef.current);
      setSelected(null);
      void refresh();
    };
    provider?.on?.("accountsChanged", syncWallet);
    provider?.on?.("chainChanged", syncWallet);
    provider?.on?.("disconnect", disconnect);
    void syncWallet();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => {
      mounted.current = false;
      ++refreshVersion.current;
      ++walletVersion.current;
      clearInterval(timer);
      provider?.removeListener?.("accountsChanged", syncWallet);
      provider?.removeListener?.("chainChanged", syncWallet);
      provider?.removeListener?.("disconnect", disconnect);
    };
  }, [refresh]);

  async function walletAction(switchOnly = false) {
    if (busyRef.current) return;
    const provider = getWalletProvider();
    if (!provider) { setNotice({ type: "error", text: "MetaMask was not found. Install the browser extension, then reload this page." }); return; }
    busyRef.current = true;
    setBusy(switchOnly ? "switch" : "connect");
    setNotice(null);
    try {
      if (switchOnly) await switchNetwork(provider);
      const next = await walletState(provider, !switchOnly);
      walletRef.current = next;
      setWallet(next);
      setSelected(null);
      await refresh();
    } catch (error) { setNotice({ type: "error", text: explainError(error) }); }
    finally { busyRef.current = false; setBusy(""); }
  }

  async function transact(action, value) {
    if (busyRef.current || !wallet.address || loadError) return;
    if (action === "vote") {
      const candidate = election.candidates.find((item) => item.id === value);
      if (!candidate || !window.confirm(`Cast your one vote for ${candidate.name}? This vote cannot be changed.`)) return;
    }
    busyRef.current = true;
    setBusy(action === "vote" ? "vote" : "admin");
    setNotice({ type: "info", text: "Approve the transaction in MetaMask." });
    try {
      const confirmed = await sendAction(getWalletProvider(), wallet.address, action, value, () => {
        setNotice({ type: "info", text: "Transaction submitted. Waiting for blockchain confirmation…" });
      });
      setReceipt(confirmed);
      setSelected(null);
      setNotice({ type: "success", text: action === "vote" ? "Your vote is confirmed on the blockchain." : `Voting is now ${value ? "open" : "closed"}.` });
      await refresh();
    } catch (error) {
      setNotice({ type: "error", text: explainError(error) });
      await refresh();
    } finally { busyRef.current = false; setBusy(""); }
  }

  const wrongNetwork = Boolean(wallet.address && wallet.chainId !== 31337);
  const voterChecked = Boolean(wallet.address && election?.voterAddress?.toLowerCase() === wallet.address.toLowerCase());
  const hasVoted = Boolean(voterChecked && election?.voted);
  const canVote = Boolean(voterChecked && !wrongNetwork && election?.open && !hasVoted && !loadError && !busy);
  const isOwner = wallet.address && election?.owner.toLowerCase() === wallet.address.toLowerCase();
  const highest = Math.max(0, ...(election?.candidates.map((candidate) => candidate.votes) ?? []));
  const leaders = election?.candidates.filter((candidate) => candidate.votes === highest) ?? [];
  const resultLabel = !election?.total ? "No votes yet" : leaders.length > 1 ? "Tied" : election.open ? "Currently leading" : "Winner";

  return <>
    <header className="header">
      <div className="header-inner">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setTab("Home"); }}><span className="brand-mark"><CheckIcon /></span>VoteChain</a>
        <nav aria-label="Main navigation">{["Home", "Candidates", "Results"].map((item) => <button key={item} className={`nav-button ${tab === item ? "active" : ""}`} aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <button className={`wallet-button ${wallet.address ? "connected" : ""}`} disabled={Boolean(busy)} onClick={() => walletAction(wrongNetwork)} title={wallet.address ?? "Connect MetaMask"}>
          <span className="wallet-symbol" aria-hidden="true">◇</span>{busy === "connect" ? "Connecting…" : busy === "switch" ? "Switching…" : wrongNetwork ? "Switch network" : wallet.address ? shorten(wallet.address) : "Connect wallet"}
        </button>
      </div>
    </header>

    <main>
      <div className="network-line"><span><i className={`dot ${election && !loadError ? "online" : ""}`} />Hardhat local network <span className="chain-id">· Chain 31337</span></span><span className="prototype-badge">MINI PROJECT</span></div>
      {notice && <div className={`notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}><span>{notice.text}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>}
      {loadError && <div className="notice error" role="alert"><span>{loadError}</span><button onClick={() => refresh()} disabled={refreshing}>{refreshing ? "Checking…" : "Retry"}</button></div>}
      {wrongNetwork && <div className="notice warning" role="alert"><span>Your wallet is on another network. Switch to Hardhat Local to vote.</span><button disabled={Boolean(busy)} onClick={() => walletAction(true)}>Switch network</button></div>}

      {tab === "Home" && <section className="home" aria-labelledby="home-title">
        <div className="hero-copy"><span className="eyebrow">A SIMPLE BLOCKCHAIN VOTING SYSTEM</span><h1 id="home-title">Your voice.<br /><span>Recorded on-chain.</span></h1><p>Choose your candidate and cast your vote. The smart contract counts every vote and keeps the election rules transparent.</p><div className="hero-actions"><button className="button primary" onClick={() => setTab("Candidates")}>View candidates <span aria-hidden="true">→</span></button><button className="button text-button" onClick={() => setTab("Results")}>See results</button></div><div className="hero-note"><CheckIcon />One wallet. One vote. A verifiable record.</div></div>
        <div className="election-card"><div className="card-top"><span className="eyebrow">CURRENT ELECTION</span><span className={`status-pill ${election?.open && !loadError ? "open" : ""}`}>{loadError ? "Offline" : !election ? "Loading…" : election.open ? "Voting open" : "Voting closed"}</span></div><div className="ballot-art" aria-hidden="true"><div className="ballot-paper"><CheckIcon /><span /><span /></div><div className="ballot-box"><span className="slot" /><CheckIcon /></div></div><h2>{election?.name ?? "Student Council Election"}</h2><p>Make your choice. Every vote counts.</p><div className="card-stats"><div><strong>{election?.candidates.length ?? "—"}</strong><span>Candidates</span></div><div><strong>{election?.total ?? "—"}</strong><span>Votes recorded</span></div></div></div>
      </section>}

      {tab === "Home" && <section className="steps" aria-label="How to vote">{[["01", "Connect your wallet", "Use MetaMask with a funded local test account."], ["02", "Choose a candidate", "Select one candidate and confirm your choice."], ["03", "Confirm your vote", "Approve in MetaMask and wait for confirmation."]].map(([number, title, text]) => <article key={number}><span className="step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</section>}

      {tab !== "Home" && <section aria-labelledby="page-title">
        <div className="page-heading"><div><span className="eyebrow">{election?.name ?? "STUDENT COUNCIL ELECTION"}</span><h1 id="page-title">{tab === "Candidates" ? "Choose your candidate" : "Election results"}</h1><p>{tab === "Candidates" ? "Select one candidate. Your confirmed vote cannot be changed." : "Vote totals read directly from the smart contract."}</p></div><button className="button secondary refresh-button" disabled={refreshing} onClick={() => refresh()}>{refreshing ? "Refreshing…" : "↻ Refresh"}</button></div>
        {!election && !loadError && <p role="status">Loading election from the blockchain…</p>}
        {election && <>
          <div className="election-summary"><span className={`status-pill ${election.open ? "open" : ""}`}>{election.open ? "Voting open" : "Voting closed"}</span><span><strong>{election.total}</strong> votes recorded</span><span><strong>{election.candidates.length}</strong> candidates</span></div>
          {tab === "Candidates" && <>
            {!wallet.address && <div className="inline-hint">Connect your wallet to cast a vote. You can browse candidates and results without connecting.</div>}
            {hasVoted && <div className="notice success" role="status"><span><strong>Vote recorded.</strong> This wallet has already voted in this election.</span><CheckIcon /></div>}
            {!election.open && <div className="inline-hint">This election is closed. You can still view the results.</div>}
            <div className="candidate-grid" role="radiogroup" aria-label="Select a candidate">{election.candidates.map((candidate, index) => <button type="button" role="radio" aria-checked={selected === candidate.id} tabIndex={selected === candidate.id || (selected === null && index === 0) ? 0 : -1} key={candidate.id} className={`candidate-card color-${index % 4} ${selected === candidate.id ? "selected" : ""}`} disabled={!canVote} onClick={() => setSelected(candidate.id)} onKeyDown={(event) => {
              const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const count = election.candidates.length;
              const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + count) % count;
              setSelected(election.candidates[next].id);
              event.currentTarget.parentElement.querySelectorAll('[role="radio"]')[next].focus();
            }}><span className="candidate-number">CANDIDATE {String(candidate.id).padStart(2, "0")}</span><span className="avatar" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="17" r="9" fill="currentColor"/><path d="M9 42v-5c0-8 7-13 15-13s15 5 15 13v5Z" fill="currentColor"/></svg></span><strong>{candidate.name}</strong><span className="select-label">{selected === candidate.id ? <><CheckIcon /> Selected</> : "Select candidate"}</span></button>)}</div>
            <div className="vote-panel"><div><strong>{selected ? `Your choice: ${election.candidates.find((candidate) => candidate.id === selected)?.name}` : hasVoted ? "Your vote has been recorded." : "Ready to make your choice?"}</strong><p>{hasVoted ? "One confirmed vote per wallet address." : "Your wallet will ask you to approve the voting transaction."}</p></div><button className="button primary" disabled={!canVote || selected === null} onClick={() => transact("vote", selected)}>{busy === "vote" ? "Confirming vote…" : hasVoted ? "Already voted" : "Cast my vote"}</button></div>
          </>}
          {tab === "Results" && <div className="results-panel"><div className="results-top"><h2>{election.open ? "Live vote count" : "Final vote count"}</h2><span>{election.open ? "Refreshes every 4 seconds" : "Recorded on-chain"}</span></div>{election.candidates.map((candidate, index) => {
            const percent = election.total ? Math.round(candidate.votes / election.total * 100) : 0;
            return <div className={`result-row color-${index % 4}`} key={candidate.id}><div className="result-label"><strong>{candidate.name}</strong><span>{candidate.votes} {candidate.votes === 1 ? "vote" : "votes"} <b>{percent}%</b></span></div><div className="bar-track" role="meter" aria-label={`${candidate.name} vote share`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div className="bar-fill" style={{ width: `${percent}%` }} /></div></div>;
          })}<div className="result-foot"><span>{resultLabel}</span><strong>{election.total ? leaders.map((candidate) => candidate.name).join(" · ") : "Be the first to cast a vote."}</strong></div></div>}
        </>}
      </section>}

      {receipt && <section className="receipt" aria-label="Transaction receipt"><CheckIcon /><div><strong>Transaction confirmed · Block {receipt.blockNumber}</strong><span title={receipt.hash}>{receipt.hash}</span></div></section>}

      {isOwner && <section className="admin-panel" aria-label="Election administration"><div><strong>Election owner controls</strong><p>Only the account that deployed this contract can change voting status.</p></div><button className="button secondary" disabled={Boolean(busy) || wrongNetwork || Boolean(loadError)} onClick={() => transact("setVotingOpen", !election.open)}>{busy === "admin" ? "Updating…" : election.open ? "Close voting" : "Open voting"}</button></section>}

      <footer><span>VoteChain <span className="footer-divider">/</span> Blockchain voting mini project</span><span>Local test network · Educational prototype</span>{election && <div className="contract-line">Contract <code title={election.deployment.address}>{election.deployment.address}</code></div>}</footer>
    </main>
  </>;
}
