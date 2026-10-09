import { ethers } from "./vendor/ethers.min.js";

const $ = (id) => document.getElementById(id);
const state = { provider: null, signer: null, contract: null, account: null, priceWei: 0n, config: null };
let abi;

function status(message, kind = "") {
  $("status").textContent = message;
  $("status").className = `status ${kind}`;
}

function eth(value) {
  return Number(ethers.formatEther(value)).toLocaleString("zh-CN", { maximumFractionDigits: 8 });
}

function shares(value) {
  return Number(ethers.formatUnits(value, 18)).toLocaleString("zh-CN", { maximumFractionDigits: 6 });
}

function parsePositive(id) {
  const value = $(id).value.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("请输入有效的正数。请使用小数点，不要输入负数。");
  const wei = ethers.parseEther(value);
  if (wei <= 0n) throw new Error("金额必须大于零。");
  return wei;
}

function friendly(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "已在钱包中取消交易。";
  const reason = [error?.reason, error?.shortMessage, error?.message, error?.info?.error?.message]
    .filter(Boolean).join(" · ") || String(error);
  const known = ["Only owner", "Amount must be positive", "Amount too small", "Insufficient shares", "Pool lacks funds", "Payout too small", "Payout failed"];
  const found = known.find((item) => reason.includes(item));
  const translations = {
    "Only owner": "只有管理员可以执行此操作。",
    "Amount must be positive": "投入金额必须大于零。",
    "Amount too small": "投入金额太小，无法获得份额。",
    "Insufficient shares": "持有份额不足。",
    "Pool lacks funds": "资金池余额不足，暂时无法按当前价格赎回。",
    "Payout too small": "赎回金额太小。",
    "Payout failed": "向钱包付款失败。",
  };
  return found ? translations[found] : reason.slice(0, 200);
}

function preview() {
  try {
    const amount = parsePositive("buy-amount");
    $("buy-preview").textContent = state.priceWei > 0n
      ? `预计获得：${shares(amount * 10n ** 18n / state.priceWei)} 份`
      : "预计获得：连接钱包后显示";
  } catch { $("buy-preview").textContent = "预计获得：— 份"; }
  try {
    const units = parsePositive("redeem-shares");
    $("redeem-preview").textContent = state.priceWei > 0n
      ? `预计收到：${eth(units * state.priceWei / 10n ** 18n)} 测试 ETH`
      : "预计收到：连接钱包后显示";
  } catch { $("redeem-preview").textContent = "预计收到：— 测试 ETH"; }
}

async function requireSepolia() {
  const network = await state.provider.getNetwork();
  if (network.chainId !== 11155111n) throw new Error("请先在 MetaMask 中切换到 Sepolia 测试网。");
}

async function connect() {
  if (!window.ethereum) throw new Error("未检测到 MetaMask。请在安装了钱包扩展的浏览器中打开。");
  if (!state.config.contractAddress) throw new Error("尚未配置合约地址。请先部署合约并设置 CONTRACT_ADDRESS。");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  state.provider = new ethers.BrowserProvider(window.ethereum);
  await requireSepolia();
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  const code = await state.provider.getCode(state.config.contractAddress);
  if (code === "0x") throw new Error("Sepolia 上找不到该合约地址，请检查 CONTRACT_ADDRESS。");
  state.contract = new ethers.Contract(state.config.contractAddress, abi, state.signer);
  $("account").textContent = state.account;
  $("connect").textContent = `${state.account.slice(0, 6)}…${state.account.slice(-4)}`;
  await refresh();
  status("钱包已连接到 Sepolia。", "success");
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
  container.textContent = "正在读取链上事件…";
  try {
    const current = await state.provider.getBlockNumber();
    const fromBlock = eventStartBlock(current);
    const [buys, sells] = await Promise.all([
      state.contract.queryFilter(state.contract.filters.SharesPurchased(state.account), fromBlock, current),
      state.contract.queryFilter(state.contract.filters.SharesRedeemed(state.account), fromBlock, current),
    ]);
    const events = [...buys.map((e) => ({ e, action: "买入", amount: e.args.paidWei, units: e.args.shares })),
      ...sells.map((e) => ({ e, action: "赎回", amount: e.args.paidWei, units: e.args.shares }))]
      .sort((a, b) => b.e.blockNumber - a.e.blockNumber || b.e.index - a.e.index);
    container.replaceChildren();
    if (!events.length) { container.textContent = "暂无记录。"; return; }
    for (const item of events) {
      const row = document.createElement("div");
      row.className = "history-item";
      const info = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = `${item.action} ${shares(item.units)} 份`;
      const detail = document.createElement("span");
      detail.textContent = `${eth(item.amount)} 测试 ETH · 区块 ${item.e.blockNumber}`;
      info.append(label, detail);
      const link = document.createElement("a");
      link.href = `https://sepolia.etherscan.io/tx/${item.e.transactionHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "查看交易";
      row.append(info, link);
      container.append(row);
    }
  } catch (error) {
    container.textContent = `历史记录读取失败：${friendly(error)}。可用交易哈希在 Sepolia 区块浏览器核对。`;
  }
}

async function loadPriceHistory() {
  const container = $("price-history");
  container.textContent = "正在读取价格记录…";
  try {
    const current = await state.provider.getBlockNumber();
    const events = await state.contract.queryFilter(state.contract.filters.PriceChanged(), eventStartBlock(current), current);
    container.replaceChildren();
    if (!events.length) { container.textContent = "此查询范围内暂无价格记录。"; return; }
    for (const event of events.slice(-5).reverse()) {
      const row = document.createElement("div");
      row.className = "history-item";
      const info = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = `${eth(event.args.oldPriceWei)} → ${eth(event.args.newPriceWei)} 测试 ETH / 份`;
      const detail = document.createElement("span");
      detail.textContent = `区块 ${event.blockNumber}`;
      info.append(label, detail);
      const link = document.createElement("a");
      link.href = `https://sepolia.etherscan.io/tx/${event.transactionHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "查看交易";
      row.append(info, link);
      container.append(row);
    }
  } catch (error) { container.textContent = `价格记录读取失败：${friendly(error)}`; }
}

async function sendTransaction(promiseFactory, label) {
  if (!state.contract) throw new Error("请先连接钱包。");
  await requireSepolia();
  status(`请在 MetaMask 中确认${label}…`);
  const tx = await promiseFactory();
  status(`交易已提交，等待 Sepolia 确认：${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("交易执行失败。");
  await refresh();
  status(`${label}成功。交易哈希：${tx.hash}`, "success");
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
  await sendTransaction(() => state.contract.buy({ value: amount }), "买入");
});
bind("redeem-form", async () => {
  const units = parsePositive("redeem-shares");
  await sendTransaction(() => state.contract.redeem(units), "赎回");
});
bind("price-form", async () => {
  const price = parsePositive("new-price");
  await sendTransaction(() => state.contract.setPrice(price), "更新价格");
});
bind("fund-form", async () => {
  const amount = parsePositive("fund-amount");
  await sendTransaction(() => state.contract.fundPool({ value: amount }), "补充资金池");
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
  if (!configResponse.ok || !abiResponse.ok) throw new Error("无法读取应用配置或 ABI 文件。");
  state.config = await configResponse.json();
  abi = await abiResponse.json();
  $("contract-address").textContent = state.config.contractAddress || "未配置";
  status(state.config.contractAddress ? "准备就绪，请连接 MetaMask。" : "尚未配置合约地址；请先按 README 部署合约。",
    state.config.contractAddress ? "" : "error");
} catch (error) { status(friendly(error), "error"); }
