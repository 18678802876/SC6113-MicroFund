import { ethers } from "./vendor/ethers.min.js";

const $ = (id) => document.getElementById(id);
const state = { provider: null, signer: null, contract: null, account: null, priceWei: 0n, config: null };
let abi;

function status(message, kind = "") {
  $("status").textContent = message;
  $("status").className = `status ${kind}`;
}

function eth(value) {
  return Number(ethers.formatEther(value)).toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function shares(value) {
  return Number(ethers.formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function parsePositive(id) {
  const value = $(id).value.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a positive number using a decimal point.");
  const wei = ethers.parseEther(value);
  if (wei <= 0n) throw new Error("The amount must be greater than zero.");
  return wei;
}

function friendly(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "Transaction cancelled in the wallet.";
  const reason = [error?.reason, error?.shortMessage, error?.message, error?.info?.error?.message]
    .filter(Boolean).join(" · ") || String(error);
  const known = ["Only owner", "Amount must be positive", "Amount too small", "Insufficient shares", "Pool lacks funds", "Payout too small", "Payout failed"];
  const found = known.find((item) => reason.includes(item));
  const translations = {
    "Only owner": "Only the administrator can perform this action.",
    "Amount must be positive": "The amount must be greater than zero.",
    "Amount too small": "The investment is too small to receive shares.",
    "Insufficient shares": "You do not hold enough shares.",
    "Pool lacks funds": "The pool does not have enough test ETH for this redemption.",
    "Payout too small": "The redemption amount is too small.",
    "Payout failed": "The payout to your wallet failed.",
  };
  return found ? translations[found] : reason.slice(0, 200);
}

function preview() {
  try {
    const amount = parsePositive("buy-amount");
    $("buy-preview").textContent = state.priceWei > 0n
      ? `Estimated shares: ${shares(amount * 10n ** 18n / state.priceWei)}`
      : "Estimated shares: connect your wallet first";
  } catch { $("buy-preview").textContent = "Estimated shares: —"; }
  try {
    const units = parsePositive("redeem-shares");
    $("redeem-preview").textContent = state.priceWei > 0n
      ? `Estimated payout: ${eth(units * state.priceWei / 10n ** 18n)} test ETH`
      : "Estimated payout: connect your wallet first";
  } catch { $("redeem-preview").textContent = "Estimated payout: — test ETH"; }
}

async function requireSepolia() {
  const network = await state.provider.getNetwork();
  if (network.chainId !== 11155111n) throw new Error("Switch MetaMask to the Sepolia test network first.");
}

async function connect() {
  if (!window.ethereum) throw new Error("MetaMask was not detected. Open this page in a browser with the wallet extension.");
  if (!state.config.contractAddress) throw new Error("No contract address is configured. Deploy the contract and set CONTRACT_ADDRESS first.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  state.provider = new ethers.BrowserProvider(window.ethereum);
  await requireSepolia();
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  const code = await state.provider.getCode(state.config.contractAddress);
  if (code === "0x") throw new Error("No contract was found at this address on Sepolia. Check CONTRACT_ADDRESS.");
  state.contract = new ethers.Contract(state.config.contractAddress, abi, state.signer);
  $("account").textContent = state.account;
  $("connect").textContent = `${state.account.slice(0, 6)}…${state.account.slice(-4)}`;
  await refresh();
  status("Wallet connected to Sepolia.", "success");
}

async function refresh() {
  if (!state.contract) return;
  await requireSepolia();
  const [price, held, pool, owner] = await Promise.all([
    state.contract.priceWeiPerShare(),
    state.contract.sharesOf(state.account),
    state.contract.poolBalance(),
    state.contract.owner(),
  ]);
  state.priceWei = price;
  $("price").textContent = eth(price);
  $("shares").textContent = shares(held);
  $("valuation").textContent = eth(held * price / 10n ** 18n);
  $("pool").textContent = eth(pool);
  $("admin").hidden = owner.toLowerCase() !== state.account.toLowerCase();
  preview();
  await Promise.all([loadHistory(), loadPriceHistory()]);
}

function eventStartBlock(current) {
  const supplied = Number(state.config.deploymentBlock);
  return Number.isInteger(supplied) && supplied > 0 ? supplied : Math.max(0, current - 5000);
}

async function loadHistory() {
  const container = $("history");
  container.textContent = "Loading on-chain events…";
  try {
    const current = await state.provider.getBlockNumber();
    const fromBlock = eventStartBlock(current);
    const [buys, sells] = await Promise.all([
      state.contract.queryFilter(state.contract.filters.SharesPurchased(state.account), fromBlock, current),
      state.contract.queryFilter(state.contract.filters.SharesRedeemed(state.account), fromBlock, current),
    ]);
    const events = [...buys.map((e) => ({ e, action: "Bought", amount: e.args.paidWei, units: e.args.shares })),
      ...sells.map((e) => ({ e, action: "Redeemed", amount: e.args.paidWei, units: e.args.shares }))]
      .sort((a, b) => b.e.blockNumber - a.e.blockNumber || b.e.index - a.e.index);
    container.replaceChildren();
    if (!events.length) { container.textContent = "No transactions found."; return; }
    for (const item of events) {
      const row = document.createElement("div");
      row.className = "history-item";
      const info = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = `${item.action} ${shares(item.units)} shares`;
      const detail = document.createElement("span");
      detail.textContent = `${eth(item.amount)} test ETH · Block ${item.e.blockNumber}`;
      info.append(label, detail);
      const link = document.createElement("a");
      link.href = `https://sepolia.etherscan.io/tx/${item.e.transactionHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View transaction";
      row.append(info, link);
      container.append(row);
    }
  } catch (error) {
    container.textContent = `Could not load transaction history: ${friendly(error)}. Check transaction hashes on Sepolia Etherscan.`;
  }
}

async function loadPriceHistory() {
  const container = $("price-history");
  container.textContent = "Loading price changes…";
  try {
    const current = await state.provider.getBlockNumber();
    const events = await state.contract.queryFilter(state.contract.filters.PriceChanged(), eventStartBlock(current), current);
    container.replaceChildren();
    if (!events.length) { container.textContent = "No price changes found in this block range."; return; }
    for (const event of events.slice(-5).reverse()) {
      const row = document.createElement("div");
      row.className = "history-item";
      const info = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = `${eth(event.args.oldPriceWei)} → ${eth(event.args.newPriceWei)} test ETH / share`;
      const detail = document.createElement("span");
      detail.textContent = `Block ${event.blockNumber}`;
      info.append(label, detail);
      const link = document.createElement("a");
      link.href = `https://sepolia.etherscan.io/tx/${event.transactionHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View transaction";
      row.append(info, link);
      container.append(row);
    }
  } catch (error) { container.textContent = `Could not load price history: ${friendly(error)}`; }
}

async function sendTransaction(promiseFactory, label) {
  if (!state.contract) throw new Error("Connect your wallet first.");
  await requireSepolia();
  status(`Confirm ${label} in MetaMask…`);
  const tx = await promiseFactory();
  status(`Transaction submitted. Waiting for Sepolia confirmation: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("The transaction failed.");
  await refresh();
  status(`${label} successful. Transaction hash: ${tx.hash}`, "success");
}

function bind(formId, action) {
  $(formId).addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try { await action(); }
    catch (error) { status(friendly(error), "error"); }
    finally { button.disabled = false; }
  });
}

bind("buy-form", async () => {
  const amount = parsePositive("buy-amount");
  await sendTransaction(() => state.contract.buy({ value: amount }), "purchase");
});
bind("redeem-form", async () => {
  const units = parsePositive("redeem-shares");
  await sendTransaction(() => state.contract.redeem(units), "redemption");
});
bind("price-form", async () => {
  const price = parsePositive("new-price");
  await sendTransaction(() => state.contract.setPrice(price), "price update");
});
bind("fund-form", async () => {
  const amount = parsePositive("fund-amount");
  await sendTransaction(() => state.contract.fundPool({ value: amount }), "pool funding");
});
$("buy-amount").addEventListener("input", preview);
$("redeem-shares").addEventListener("input", preview);
$("connect").addEventListener("click", () => connect().catch((error) => status(friendly(error), "error")));
$("refresh").addEventListener("click", () => refresh().catch((error) => status(friendly(error), "error")));
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}

try {
  const [configResponse, abiResponse] = await Promise.all([fetch("/api/config"), fetch("/static/MicroFund.abi.json")]);
  if (!configResponse.ok || !abiResponse.ok) throw new Error("Could not load the application configuration or ABI.");
  state.config = await configResponse.json();
  abi = await abiResponse.json();
  $("contract-address").textContent = state.config.contractAddress || "Not configured";
  status(state.config.contractAddress ? "Ready. Connect MetaMask to continue." : "No contract address configured. Deploy the contract as described in the README.",
    state.config.contractAddress ? "" : "error");
} catch (error) { status(friendly(error), "error"); }
