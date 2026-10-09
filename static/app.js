import { ethers } from "./vendor/ethers.min.js";
import { applyLanguage, language, setLanguage, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const state = { provider: null, signer: null, contract: null, account: null, priceWei: 0n, config: null, statusInfo: null };
let abi;
applyLanguage();

function renderStatus() {
  if (!state.statusInfo) return;
  const { key, values, kind } = state.statusInfo;
  $("status").textContent = key === "error"
    ? friendly(values.error)
    : t(key, { ...values, action: values.actionKey ? t(values.actionKey) : values.action });
  $("status").className = `status ${kind}`;
}

function status(key, values = {}, kind = "") {
  state.statusInfo = { key, values, kind };
  renderStatus();
}

function statusError(error) {
  status("error", { error }, "error");
}
status("loading");

function eth(value) {
  return Number(ethers.formatEther(value)).toLocaleString(language() === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 8 });
}

function shares(value) {
  return Number(ethers.formatUnits(value, 18)).toLocaleString(language() === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 6 });
}

function parsePositive(id) {
  const value = $(id).value.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(t("invalidNumber"));
  const wei = ethers.parseEther(value);
  if (wei <= 0n) throw new Error(t("positiveAmount"));
  return wei;
}

function friendly(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return t("walletCancelled");
  const reason = [error?.reason, error?.shortMessage, error?.message, error?.info?.error?.message]
    .filter(Boolean).join(" · ") || String(error);
  const known = ["Only owner", "Amount must be positive", "Amount too small", "Insufficient shares", "Pool lacks funds", "Payout too small", "Payout failed"];
  const found = known.find((item) => reason.includes(item));
  const translations = {
    "Only owner": "onlyOwner",
    "Amount must be positive": "positiveAmount",
    "Amount too small": "tooSmall",
    "Insufficient shares": "insufficientShares",
    "Pool lacks funds": "insufficientPool",
    "Payout too small": "payoutTooSmall",
    "Payout failed": "payoutFailed",
  };
  return found ? t(translations[found]) : reason.slice(0, 200);
}

function preview() {
  try {
    const amount = parsePositive("buy-amount");
    $("buy-preview").textContent = state.priceWei > 0n
      ? t("estimatedShares", { shares: shares(amount * 10n ** 18n / state.priceWei) })
      : t("estimatedSharesConnect");
  } catch { $("buy-preview").textContent = t("estimatedSharesDefault"); }
  try {
    const units = parsePositive("redeem-shares");
    $("redeem-preview").textContent = state.priceWei > 0n
      ? t("estimatedPayout", { amount: eth(units * state.priceWei / 10n ** 18n) })
      : t("estimatedPayoutConnect");
  } catch { $("redeem-preview").textContent = t("estimatedPayoutDefault"); }
}

async function requireSepolia() {
  const network = await state.provider.getNetwork();
  if (network.chainId !== 11155111n) throw new Error(t("wrongNetwork"));
}

async function connect() {
  if (!window.ethereum) throw new Error(t("noMetaMask"));
  if (!state.config.contractAddress) throw new Error(t("noContract"));
  await window.ethereum.request({ method: "eth_requestAccounts" });
  state.provider = new ethers.BrowserProvider(window.ethereum);
  await requireSepolia();
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  const code = await state.provider.getCode(state.config.contractAddress);
  if (code === "0x") throw new Error(t("contractMissing"));
  state.contract = new ethers.Contract(state.config.contractAddress, abi, state.signer);
  $("account").textContent = state.account;
  $("connect").textContent = `${state.account.slice(0, 6)}…${state.account.slice(-4)}`;
  await refresh();
  status("walletConnected", {}, "success");
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
  container.textContent = t("loadingHistory");
  try {
    const current = await state.provider.getBlockNumber();
    const fromBlock = eventStartBlock(current);
    const [buys, sells] = await Promise.all([
      state.contract.queryFilter(state.contract.filters.SharesPurchased(state.account), fromBlock, current),
      state.contract.queryFilter(state.contract.filters.SharesRedeemed(state.account), fromBlock, current),
    ]);
    const events = [...buys.map((e) => ({ e, actionKey: "bought", amount: e.args.paidWei, units: e.args.shares })),
      ...sells.map((e) => ({ e, actionKey: "redeemed", amount: e.args.paidWei, units: e.args.shares }))]
      .sort((a, b) => b.e.blockNumber - a.e.blockNumber || b.e.index - a.e.index);
    container.replaceChildren();
    if (!events.length) { container.textContent = t("noHistory"); return; }
    for (const item of events) {
      const row = document.createElement("div");
      row.className = "history-item";
      const info = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = t("historyLine", { action: t(item.actionKey), shares: shares(item.units) });
      const detail = document.createElement("span");
      detail.textContent = t("historyDetail", { amount: eth(item.amount), block: item.e.blockNumber });
      info.append(label, detail);
      const link = document.createElement("a");
      link.href = `https://sepolia.etherscan.io/tx/${item.e.transactionHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = t("viewTransaction");
      row.append(info, link);
      container.append(row);
    }
  } catch (error) {
    container.textContent = t("historyError", { error: friendly(error) });
  }
}

async function loadPriceHistory() {
  const container = $("price-history");
  container.textContent = t("loadingPriceHistory");
  try {
    const current = await state.provider.getBlockNumber();
    const events = await state.contract.queryFilter(state.contract.filters.PriceChanged(), eventStartBlock(current), current);
    container.replaceChildren();
    if (!events.length) { container.textContent = t("noPriceHistory"); return; }
    for (const event of events.slice(-5).reverse()) {
      const row = document.createElement("div");
      row.className = "history-item";
      const info = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = t("priceLine", { old: eth(event.args.oldPriceWei), current: eth(event.args.newPriceWei) });
      const detail = document.createElement("span");
      detail.textContent = t("block", { block: event.blockNumber });
      info.append(label, detail);
      const link = document.createElement("a");
      link.href = `https://sepolia.etherscan.io/tx/${event.transactionHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = t("viewTransaction");
      row.append(info, link);
      container.append(row);
    }
  } catch (error) { container.textContent = t("priceHistoryError", { error: friendly(error) }); }
}

async function sendTransaction(promiseFactory, label) {
  if (!state.contract) throw new Error(t("connectFirst"));
  await requireSepolia();
  status("confirmWallet", { actionKey: label });
  const tx = await promiseFactory();
  status("submitted", { hash: tx.hash });
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(t("transactionFailed"));
  await refresh();
  status("transactionSuccess", { actionKey: label, hash: tx.hash }, "success");
}

function bind(formId, action) {
  $(formId).addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try { await action(); }
    catch (error) { statusError(error); }
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
  await sendTransaction(() => state.contract.setPrice(price), "priceUpdate");
});
bind("fund-form", async () => {
  const amount = parsePositive("fund-amount");
  await sendTransaction(() => state.contract.fundPool({ value: amount }), "poolFunding");
});
$("buy-amount").addEventListener("input", preview);
$("redeem-shares").addEventListener("input", preview);
$("connect").addEventListener("click", () => connect().catch(statusError));
$("refresh").addEventListener("click", () => refresh().catch(statusError));
$("language-toggle").addEventListener("click", () => {
  setLanguage(language() === "en" ? "zh" : "en");
  renderStatus();
  if (!state.account) $("account").textContent = t("notConnected");
  else $("connect").textContent = `${state.account.slice(0, 6)}…${state.account.slice(-4)}`;
  if (!state.config?.contractAddress) $("contract-address").textContent = t("notConfigured");
  preview();
  if (state.contract) refresh().catch(statusError);
  else {
    $("history").textContent = t("connectHistory");
    $("price-history").textContent = t("connectPriceHistory");
  }
});
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}

$("account").textContent = t("notConnected");
$("contract-address").textContent = t("notConfigured");
$("history").textContent = t("connectHistory");
$("price-history").textContent = t("connectPriceHistory");
preview();

try {
  const [configResponse, abiResponse] = await Promise.all([fetch("/api/config"), fetch("/static/MicroFund.abi.json")]);
  if (!configResponse.ok || !abiResponse.ok) throw new Error(t("configFailed"));
  state.config = await configResponse.json();
  abi = await abiResponse.json();
  $("contract-address").textContent = state.config.contractAddress || t("notConfigured");
  status(state.config.contractAddress ? "ready" : "configure", {}, state.config.contractAddress ? "" : "error");
} catch (error) { statusError(error); }
