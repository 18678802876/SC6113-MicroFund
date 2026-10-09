const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ganache = require("ganache");
const { ethers } = require("ethers");

const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "MicroFund.json"), "utf8"));
const oneShare = 10n ** 18n;
const price = ethers.parseEther("0.01");

async function setup() {
  const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
  const owner = await provider.getSigner(0);
  const investor = await provider.getSigner(1);
  const other = await provider.getSigner(2);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, owner);
  const fund = await factory.deploy(price);
  await fund.waitForDeployment();
  return { provider, owner, investor, other, fund };
}

test("buying twice at different prices gives predictable shares and emits history", async () => {
  const { investor, fund } = await setup();
  await (await fund.connect(investor).buy({ value: ethers.parseEther("0.02") })).wait();
  assert.equal(await fund.sharesOf(await investor.getAddress()), 2n * oneShare);
  await (await fund.setPrice(ethers.parseEther("0.02"))).wait();
  await (await fund.connect(investor).buy({ value: ethers.parseEther("0.02") })).wait();
  assert.equal(await fund.sharesOf(await investor.getAddress()), 3n * oneShare);
  assert.equal(await fund.poolBalance(), ethers.parseEther("0.04"));
  const events = await fund.queryFilter(fund.filters.SharesPurchased(await investor.getAddress()));
  assert.equal(events.length, 2);
  assert.equal(events[0].args.shares, 2n * oneShare);
  assert.equal(events[1].args.shares, oneShare);
});

test("higher price requires real pool liquidity before redeeming", async () => {
  const { investor, fund } = await setup();
  await (await fund.connect(investor).buy({ value: ethers.parseEther("0.02") })).wait();
  await (await fund.setPrice(ethers.parseEther("0.02"))).wait();
  await assert.rejects(fund.connect(investor).redeem(2n * oneShare));
  assert.equal(await fund.sharesOf(await investor.getAddress()), 2n * oneShare);
  await (await fund.fundPool({ value: ethers.parseEther("0.02") })).wait();
  assert.equal(await fund.poolBalance(), ethers.parseEther("0.04"));
  await fund.connect(investor).redeem.staticCall(2n * oneShare);
  await (await fund.connect(investor).redeem(2n * oneShare, { gasLimit: 300000 })).wait();
  assert.equal(await fund.sharesOf(await investor.getAddress()), 0n);
  assert.equal(await fund.poolBalance(), 0n);
  const events = await fund.queryFilter(fund.filters.SharesRedeemed(await investor.getAddress()));
  assert.equal(events.length, 1);
  assert.equal(events[0].args.paidWei, ethers.parseEther("0.04"));
});

test("only owner can update price and invalid operations fail", async () => {
  const { investor, other, fund } = await setup();
  await assert.rejects(fund.connect(other).setPrice(ethers.parseEther("0.02")));
  await assert.rejects(fund.setPrice(0));
  await assert.rejects(fund.connect(investor).buy({ value: 0 }));
  await assert.rejects(fund.connect(investor).redeem(oneShare));
  await assert.rejects(fund.fundPool({ value: 0 }));
});
