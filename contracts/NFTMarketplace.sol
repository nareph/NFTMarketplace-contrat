//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
//import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFTMarketplace is ReentrancyGuard {
    address payable public owner;
    //The fee charged by the marketplace to be allowed to list an NFT
    uint256 listPrice = 0.01 ether;
    uint16 platformFee = 1000; // max fee or discount is 10%
    
    bytes4 private constant _INTERFACE_ID_ERC2981 = 0x2a55205a;

    struct ListedNFT {
        address nftContract;
        uint256 tokenId;
        address payable owner;
        address payable seller;
        uint256 price;
        bool currentlyListed;
    }

    event NFTListedSuccess (
        address indexed nftContract,
        uint256 indexed tokenId,
        address owner,
        address seller,
        uint256 price,
        bool currentlyListed
    );

    mapping(uint256 => ListedNFT) private idToListedNFT;

    constructor() {
        owner = payable(msg.sender);
    }

    function updateListPrice(uint256 _listPrice) public payable {
        require(owner == msg.sender, "Only owner can update listing price");
        listPrice = _listPrice;
    }

    function getListPrice() public view returns (uint256) {
        return listPrice;
    }

    function getListedNFTForId(uint256 tokenId) public view returns (ListedNFT memory) {
        return idToListedNFT[tokenId];
    }

    /* Places nfts for sale on the marketplace */
    function createListedNFT(address nftContract, uint256 tokenId, uint256 price) public payable nonReentrant {
        require(price > 0, "Price must be at least 1 wei");
        require(msg.value == listPrice, "Price must be equal to listing price");

        idToListedNFT[tokenId] = ListedNFT(
            nftContract,
            tokenId,
            payable(address(this)),
            payable(msg.sender),
            price,
            true
        );

        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        emit NFTListedSuccess(
            nftContract,
            tokenId,
            address(this),
            msg.sender,
            price,
            true
        );
    }

    function executeSale(address nftContract, uint256 tokenId) public payable nonReentrant {
        uint price = idToListedNFT[tokenId].price;
        address seller = idToListedNFT[tokenId].seller;
        require(msg.value == price, "Please submit the asking price in order to complete the purchase");

        idToListedNFT[tokenId].currentlyListed = false;
        idToListedNFT[tokenId].seller = payable(msg.sender);

        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);

        // Compute royalties
        (address payable royaltyRecipient, uint256 royaltyAmount) = _calculateRoyalties(nftContract, tokenId, price);

        // Transfer royalties
        if(royaltyAmount != 0){
            royaltyRecipient.transfer(royaltyAmount);
        }

        //Transfer the proceeds from the sale to the seller of the NFT
        payable(seller).transfer(price - royaltyAmount);

        emit NFTListedSuccess(
            nftContract,
            tokenId,
            address(this),
            msg.sender,
            price,
            false
        );
    }

    /**
      * Royalty support functions
      */
    function _calculateRoyalties(address nftContract, uint256 tokenId, uint256 saleAmount)
    internal
    returns (address payable royaltyRecipient, uint256 royaltyAmount)
    {
        if(_checkRoyalties(nftContract)){
            (address recipient, uint256 amount) =
            IERC2981(nftContract).royaltyInfo(tokenId, saleAmount);
            return (payable(recipient), amount);
        }
        else {
            return (payable(0), 0);
        }
    }

    function _checkRoyalties(address _contract) internal view returns (bool) {
        (bool success) = IERC2981(_contract).supportsInterface(_INTERFACE_ID_ERC2981);
        return success;
    }

}
