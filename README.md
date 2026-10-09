# MicroFund：小额基金定投模拟 DApp

本项目用于 SC6113 课程演示。用户用 Sepolia 测试 ETH 分次买入模拟基金份额，按当前模拟价格赎回，并查看链上交易事件。份额**不代表真实基金或证券**，价格由合约管理员手动设置。Flask 提供网页与合约配置；资金和份额由智能合约管理。

## 业务规则

- 每份价格以 wei 表示，份额支持 18 位小数。
- 买入份额 = 投入的测试 ETH ÷ 当前价格。
- 赎回金额 = 赎回份额 × 当前价格；资金池不足时交易失败。
- 管理员可以修改模拟价格，也可以向资金池补入测试 ETH。任何账户也可以补入资金。
- “当前估值”只是按当前价格计算的数字，只有资金池足额时才能真正赎回。没有真实资产收益来源，也没有保证收益。
- 每次手动买入是一笔定投记录。本项目不自动定时扣款。

## 项目结构

```text
contracts/MicroFund.sol      Solidity 合约源码
static/MicroFund.abi.json    编译后生成的 ABI
static/app.js                MetaMask、合约读写及历史记录
static/vendor/ethers.min.js 前端使用的 ethers.js 6.15.0
static/styles.css            网页样式
templates/index.html        Flask 页面
app.py                      Flask 后端
tests/contract.test.cjs     本地链上合约测试
```

## 1. 在 GitHub Codespaces 中准备项目

在 Codespaces 终端，进入此目录后执行：

```bash
npm install
npm run compile
python -m pip install -r requirements.txt
```

`npm run compile` 会生成 `build/MicroFund.json` 和 `static/MicroFund.abi.json`。提交作业时需包含 ABI 文件。`node_modules` 可以不提交。

## 2. 在 Sepolia 部署合约

1. 在 [Remix IDE](https://remix.ethereum.org/) 打开 `contracts/MicroFund.sol`。
2. 用 Solidity 0.8.24 或兼容的 0.8.x 编译器编译。
3. MetaMask 切换到 Sepolia，并准备少量 Sepolia 测试 ETH 支付交易费。
4. Remix 的 Deploy & Run Transactions 选择 **Injected Provider - MetaMask**。
5. 构造函数 `initialPriceWeiPerShare` 填入 `10000000000000000`，即每份 0.01 测试 ETH。
6. 部署并记录 **合约地址**和该交易的**区块号**。不要把钱包私钥写入代码或仓库。

前端只会连接配置的 Sepolia 合约。Remix 用什么账户部署，该账户就是合约管理员。

## 3. 在 Codespaces 启动网页

在项目目录的终端设置环境变量并启动 Flask（将示例值替换为真实值）：

```bash
export CONTRACT_ADDRESS=0x你的合约地址
export DEPLOYMENT_BLOCK=你的部署区块号
python app.py
```

打开 Codespaces 的 **Ports** 面板，访问转发的 5000 端口。网页中连接 MetaMask，确认钱包网络为 Sepolia。`DEPLOYMENT_BLOCK` 用于从合约部署时开始读取完整交易历史；未填写时仅查询最近 5000 个区块。

## 4. 按已知数字验证功能

1. 在价格 0.01 测试 ETH/份时，投入 0.02 测试 ETH，应该得到 2 份。
2. 管理员把价格调为 0.02 测试 ETH/份。
3. 再投入 0.02 测试 ETH，应该再得到 1 份。此时共投入 0.04，持有 3 份，估值 0.06 测试 ETH。
4. 此时资金池只有 0.04，直接赎回全部 3 份应该失败，不能凭空产生 0.02 测试 ETH。
5. 管理员向资金池补入 0.02 测试 ETH 后，再赎回 3 份，应该收到 0.06 测试 ETH（钱包实际余额还会受交易费影响）。
6. 在记录区点击“查看交易”，通过 Sepolia 区块浏览器核对哈希、状态和事件。
7. 再测试零金额、错误网络、非管理员改价、超额赎回、拒绝钱包签名。

自动化测试可在 Codespaces 运行：

```bash
npm test
```

## 5. 部署 Flask 网页到 Render

将项目放入自己的 GitHub 仓库，再在 Render 创建 Web Service 并连接该仓库。若这个项目位于仓库子目录，将 **Root Directory** 设为 `micro-investment-dapp`。配置：

```text
Build Command: pip install -r requirements.txt
Start Command: gunicorn app:app
Environment: CONTRACT_ADDRESS=<Sepolia 合约地址>
Environment: DEPLOYMENT_BLOCK=<部署区块号>
```

部署前将编译产生的 `static/MicroFund.abi.json` 一起提交到 GitHub。Render 不需要运行 `npm install`。获得的 Render 网址可用作作业要求的在线链接。

## 注意

管理员控制模拟价格，是本项目的中心化部分。交易金额、份额和价格更新保存在 Sepolia 合约中，可公开核对。网页附带 ethers.js 库，运行时仍需要浏览器能连接 MetaMask 和 Sepolia。Render 上的 Flask 只提供网页，不持有钱包私钥，也不代替用户签署交易。
