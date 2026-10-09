const fs = require("node:fs");
const path = require("node:path");
const solc = require("solc");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "contracts", "MicroFund.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "MicroFund.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((item) => item.severity === "error");
if (errors.length) {
  throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
}
const artifact = output.contracts["MicroFund.sol"].MicroFund;
const outDir = path.join(root, "build");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "MicroFund.json"), JSON.stringify(artifact, null, 2));
fs.writeFileSync(path.join(root, "static", "MicroFund.abi.json"), JSON.stringify(artifact.abi, null, 2));
console.log("Compiled MicroFund.sol and wrote ABI and deploy artifact.");
