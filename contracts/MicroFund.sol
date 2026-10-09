// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A Sepolia teaching simulation. The owner sets a simulated price.
///         Shares do not represent ownership of a real fund or security.
contract MicroFund {
    uint256 public constant SHARE_SCALE = 1e18;

    address public immutable owner;
    uint256 public priceWeiPerShare;
    uint256 public totalShares;
    uint256 public totalInvestedWei;
    mapping(address => uint256) public sharesOf;
    mapping(address => uint256) public investedWeiOf;

    bool private entered;

    event PriceChanged(uint256 oldPriceWei, uint256 newPriceWei);
    event SharesPurchased(address indexed investor, uint256 paidWei, uint256 shares);
    event SharesRedeemed(address indexed investor, uint256 shares, uint256 paidWei);
    event PoolFunded(address indexed sender, uint256 amountWei);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier nonReentrant() {
        require(!entered, "Reentrant call");
        entered = true;
        _;
        entered = false;
    }

    constructor(uint256 initialPriceWeiPerShare) {
        require(initialPriceWeiPerShare > 0, "Price must be positive");
        owner = msg.sender;
        priceWeiPerShare = initialPriceWeiPerShare;
        emit PriceChanged(0, initialPriceWeiPerShare);
    }

    function setPrice(uint256 newPriceWeiPerShare) external onlyOwner {
        require(newPriceWeiPerShare > 0, "Price must be positive");
        uint256 oldPrice = priceWeiPerShare;
        priceWeiPerShare = newPriceWeiPerShare;
        emit PriceChanged(oldPrice, newPriceWeiPerShare);
    }

    /// @dev One share is represented by 1e18 share units. Fractions are allowed.
    function buy() external payable nonReentrant {
        require(msg.value > 0, "Amount must be positive");
        uint256 shareUnits = (msg.value * SHARE_SCALE) / priceWeiPerShare;
        require(shareUnits > 0, "Amount too small");

        sharesOf[msg.sender] += shareUnits;
        investedWeiOf[msg.sender] += msg.value;
        totalShares += shareUnits;
        totalInvestedWei += msg.value;
        emit SharesPurchased(msg.sender, msg.value, shareUnits);
    }

    function redeem(uint256 shareUnits) external nonReentrant {
        require(shareUnits > 0, "Shares must be positive");
        require(sharesOf[msg.sender] >= shareUnits, "Insufficient shares");
        uint256 payoutWei = (shareUnits * priceWeiPerShare) / SHARE_SCALE;
        require(payoutWei > 0, "Payout too small");
        require(address(this).balance >= payoutWei, "Pool lacks funds");

        sharesOf[msg.sender] -= shareUnits;
        totalShares -= shareUnits;
        (bool sent, ) = payable(msg.sender).call{value: payoutWei}("");
        require(sent, "Payout failed");
        emit SharesRedeemed(msg.sender, shareUnits, payoutWei);
    }

    function fundPool() external payable {
        require(msg.value > 0, "Amount must be positive");
        emit PoolFunded(msg.sender, msg.value);
    }

    function poolBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        emit PoolFunded(msg.sender, msg.value);
    }
}
