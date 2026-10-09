# MicroFund: Micro-Investment Simulator DApp

MicroFund is a teaching project for SC6113. Users buy simulated fund shares with Sepolia test ETH over multiple transactions, redeem shares at the current simulated price, and inspect on-chain events. Shares do **not** represent a real fund or security. The contract owner sets the price manually. Flask serves the website and contract configuration; the smart contract holds the test ETH and share balances.

## Rules

- The price is denominated in wei per share. Shares have 18 decimal places.
- Shares received = test ETH paid / current price.
- Redemption payout = shares redeemed x current price. The transaction fails if the pool cannot cover the payout.
- Only the owner can update the simulated price. Any account can add test ETH to the pool.
- The displayed valuation is an estimate. It can be paid out only when the pool has enough test ETH. There is no real investment income or guaranteed return.
- Each manual purchase is a separate investment record. The app does not schedule automatic payments.

## Project files

```text
contracts/MicroFund.sol      Solidity contract source
static/MicroFund.abi.json    Compiled contract ABI
static/app.js                MetaMask interactions and event history
static/vendor/ethers.min.js ethers.js 6.15.0 browser library
static/styles.css            Page styles
templates/index.html        Flask page
app.py                      Flask server
tests/contract.test.cjs     Local-chain contract tests
```

## 1. Prepare the project in GitHub Codespaces

Run these commands in the project directory:

```bash
npm install
npm run compile
npm test
python -m pip install -r requirements.txt
```

`npm run compile` generates `build/MicroFund.json` and `static/MicroFund.abi.json`. Include the ABI in your assignment submission. Do not commit `node_modules`.

## 2. Deploy the contract to Sepolia

1. Open `contracts/MicroFund.sol` in [Remix IDE](https://remix.ethereum.org/).
2. Compile with Solidity 0.8.24 or a compatible newer 0.8.x compiler.
3. Switch MetaMask to Sepolia and obtain a small amount of Sepolia test ETH for gas.
4. In Deploy & Run Transactions, choose the browser wallet / injected provider connected to MetaMask. Confirm that the selected network is Sepolia.
5. Enter `10000000000000000` for `initialPriceWeiPerShare`. This sets the initial price to 0.01 test ETH per share.
6. Deploy, then record the contract address and the deployment transaction's block number. Never put your wallet's private key in the repository.

The account that deploys the contract becomes its owner and can change its simulated price.

## 3. Start the website in Codespaces

Set the actual contract address and deployment block in the terminal:

```bash
export CONTRACT_ADDRESS=0xYOUR_CONTRACT_ADDRESS
export DEPLOYMENT_BLOCK=YOUR_DEPLOYMENT_BLOCK
python app.py
```

Open port 5000 from the Codespaces Ports panel. Connect MetaMask on Sepolia. `DEPLOYMENT_BLOCK` lets the app load the complete event history; if omitted, the app checks only the latest 5,000 blocks.

## 4. Verify with known values

1. At 0.01 test ETH per share, buy with 0.02 test ETH. The account should receive 2 shares.
2. The owner changes the price to 0.02 test ETH per share.
3. Buy again with 0.02 test ETH. The account should receive 1 more share. Total: 0.04 test ETH invested, 3 shares held, current valuation 0.06 test ETH.
4. The pool holds only 0.04 test ETH, so redeeming all 3 shares should fail.
5. The owner adds 0.02 test ETH to the pool. Redeeming all 3 shares should now pay 0.06 test ETH. The wallet's net balance also reflects gas fees.
6. Use the transaction links to confirm transaction hashes, status, and events on Sepolia Etherscan.
7. Also test zero amounts, the wrong network, a non-owner price update, excess redemption, and a rejected MetaMask confirmation.

## 5. Deploy the website to Render

Connect your GitHub repository to a Render Web Service. This repository has the app at its root, so leave **Root Directory** empty. Use:

```text
Build Command: pip install -r requirements.txt
Start Command: gunicorn app:app
Environment variable: CONTRACT_ADDRESS=<Sepolia contract address>
Environment variable: DEPLOYMENT_BLOCK=<deployment block number>
```

The ABI is already committed at `static/MicroFund.abi.json`, so Render does not need to run npm. The resulting Render URL is the assignment's live app link.

## Limitations

The administrator controls the simulated price, so price setting is centralized. Sepolia records purchases, redemptions, balances, and price changes for public verification. The Flask server does not hold private keys or sign for users. The demo uses test ETH only and does not invest in real assets. A positive displayed valuation cannot be redeemed unless the pool is funded. Funds remaining after all shares have been redeemed cannot currently be withdrawn; this is a limitation of the teaching contract.
