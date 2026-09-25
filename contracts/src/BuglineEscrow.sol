// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title BuglineEscrow
/// @notice Holds each campaign's USDC budget. Money leaves only as a bug payout to a tester
///         or, after the grace period, as a refund of the remainder to the campaign owner.
///         The platform takes no fee and cannot withdraw to itself.
contract BuglineEscrow {
    uint64 public constant GRACE_PERIOD = 14 days;

    struct Campaign {
        address owner;
        uint64 endsAt;
        bool withdrawn;
        uint128 maxPayout;
        uint128 balance;
    }

    IERC20 public immutable usdc;
    address public arbiter;

    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => bool) public bugPaid;

    uint256 private locked = 1;

    event CampaignFunded(bytes32 indexed campaignId, address indexed owner, uint256 amount, uint256 maxPayout, uint64 endsAt);
    event CampaignToppedUp(bytes32 indexed campaignId, uint256 amount);
    event BugPaid(bytes32 indexed campaignId, bytes32 indexed bugId, address indexed tester, uint256 amount, address payer);
    event RemainingWithdrawn(bytes32 indexed campaignId, address indexed owner, uint256 amount);
    event ArbiterChanged(address indexed previousArbiter, address indexed newArbiter);

    error CampaignExists();
    error CampaignNotFound();
    error InvalidAmount();
    error InvalidEndTime();
    error NotOwner();
    error NotOwnerOrArbiter();
    error NotArbiter();
    error AlreadyPaid();
    error InvalidTester();
    error PayoutTooLarge();
    error InsufficientBalance();
    error StillLocked();
    error AlreadyWithdrawn();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(IERC20 usdc_, address arbiter_) {
        usdc = usdc_;
        arbiter = arbiter_;
        emit ArbiterChanged(address(0), arbiter_);
    }

    function fund(bytes32 campaignId, uint128 amount, uint128 maxPayout, uint64 endsAt) external nonReentrant {
        if (campaigns[campaignId].owner != address(0)) revert CampaignExists();
        if (amount == 0 || maxPayout == 0) revert InvalidAmount();
        if (endsAt <= block.timestamp) revert InvalidEndTime();

        campaigns[campaignId] = Campaign({ owner: msg.sender, endsAt: endsAt, withdrawn: false, maxPayout: maxPayout, balance: amount });
        _pull(msg.sender, amount);
        emit CampaignFunded(campaignId, msg.sender, amount, maxPayout, endsAt);
    }

    function topUp(bytes32 campaignId, uint128 amount) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.owner == address(0)) revert CampaignNotFound();
        if (campaign.owner != msg.sender) revert NotOwner();
        if (campaign.withdrawn) revert AlreadyWithdrawn();
        if (amount == 0) revert InvalidAmount();

        campaign.balance += amount;
        _pull(msg.sender, amount);
        emit CampaignToppedUp(campaignId, amount);
    }

    function payBug(bytes32 campaignId, bytes32 bugId, address tester, uint128 amount) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.owner == address(0)) revert CampaignNotFound();
        if (msg.sender != campaign.owner && msg.sender != arbiter) revert NotOwnerOrArbiter();
        if (bugPaid[bugId]) revert AlreadyPaid();
        if (tester == address(0) || tester == campaign.owner) revert InvalidTester();
        if (amount == 0) revert InvalidAmount();
        if (amount > campaign.maxPayout) revert PayoutTooLarge();
        if (amount > campaign.balance) revert InsufficientBalance();

        bugPaid[bugId] = true;
        campaign.balance -= amount;
        if (!usdc.transfer(tester, amount)) revert TransferFailed();
        emit BugPaid(campaignId, bugId, tester, amount, msg.sender);
    }

    function withdrawRemaining(bytes32 campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.owner == address(0)) revert CampaignNotFound();
        if (campaign.owner != msg.sender) revert NotOwner();
        if (campaign.withdrawn) revert AlreadyWithdrawn();
        if (block.timestamp < uint256(campaign.endsAt) + GRACE_PERIOD) revert StillLocked();

        uint128 amount = campaign.balance;
        campaign.balance = 0;
        campaign.withdrawn = true;
        if (amount > 0 && !usdc.transfer(msg.sender, amount)) revert TransferFailed();
        emit RemainingWithdrawn(campaignId, msg.sender, amount);
    }

    function setArbiter(address newArbiter) external {
        if (msg.sender != arbiter) revert NotArbiter();
        emit ArbiterChanged(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    function _pull(address from, uint256 amount) private {
        if (!usdc.transferFrom(from, address(this), amount)) revert TransferFailed();
    }
}
