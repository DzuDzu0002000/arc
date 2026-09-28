// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ArcHuntEscrow, IERC20 } from "../src/ArcHuntEscrow.sol";

contract MockUsdc {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ArcHuntEscrowTest is Test {
    MockUsdc usdc;
    ArcHuntEscrow escrow;
    address owner = address(0xA11CE);
    address tester = address(0xB0B);
    address arbiter = address(0xA2B);
    bytes32 campaignId = keccak256("campaign-1");
    uint64 endsAt;

    function setUp() public {
        usdc = new MockUsdc();
        escrow = new ArcHuntEscrow(IERC20(address(usdc)), arbiter);
        endsAt = uint64(block.timestamp + 7 days);
        usdc.mint(owner, 1_000e6);
        vm.startPrank(owner);
        usdc.approve(address(escrow), 500e6);
        escrow.fund(campaignId, 500e6, 100e6, endsAt);
        vm.stopPrank();
    }

    function test_ownerPaysBugOnce() public {
        vm.prank(owner);
        escrow.payBug(campaignId, keccak256("bug-1"), tester, 50e6);
        assertEq(usdc.balanceOf(tester), 50e6);

        vm.prank(owner);
        vm.expectRevert(ArcHuntEscrow.AlreadyPaid.selector);
        escrow.payBug(campaignId, keccak256("bug-1"), tester, 50e6);
    }

    function test_arbiterCanPayWithinCap() public {
        vm.prank(arbiter);
        escrow.payBug(campaignId, keccak256("bug-2"), tester, 100e6);
        assertEq(usdc.balanceOf(tester), 100e6);

        vm.prank(arbiter);
        vm.expectRevert(ArcHuntEscrow.PayoutTooLarge.selector);
        escrow.payBug(campaignId, keccak256("bug-3"), tester, 101e6);
    }

    function test_strangerCannotPay() public {
        vm.prank(tester);
        vm.expectRevert(ArcHuntEscrow.NotOwnerOrArbiter.selector);
        escrow.payBug(campaignId, keccak256("bug-4"), tester, 10e6);
    }

    function test_ownerCannotPayThemself() public {
        vm.prank(owner);
        vm.expectRevert(ArcHuntEscrow.InvalidTester.selector);
        escrow.payBug(campaignId, keccak256("bug-5"), owner, 10e6);
    }

    function test_withdrawOnlyAfterGrace() public {
        vm.prank(owner);
        vm.expectRevert(ArcHuntEscrow.StillLocked.selector);
        escrow.withdrawRemaining(campaignId);

        vm.warp(uint256(endsAt) + 14 days);
        vm.prank(owner);
        escrow.withdrawRemaining(campaignId);
        assertEq(usdc.balanceOf(owner), 1_000e6);

        vm.prank(arbiter);
        vm.expectRevert(ArcHuntEscrow.InsufficientBalance.selector);
        escrow.payBug(campaignId, keccak256("bug-6"), tester, 1e6);
    }
}
