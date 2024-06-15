//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title NFT Marketplace
 * @author Nareph
 * @notice
 */
contract NFTMarketplace is ReentrancyGuard {
    address payable public owner;
    //The fee charged by the marketplace to be allowed to list an NFT
    uint256 listPrice = 0.001 ether;

    bytes4 private constant _INTERFACE_ID_ERC2981 = 0x2a55205a;

    struct ListedNFT {
        address nftContract;
        uint256 tokenId;
        address payable owner;
        address payable seller;
        uint256 price;
        bool currentlyListed;
    }

    event NFTListedSuccess(
        address indexed nftContract,
        uint256 indexed tokenId,
        address owner,
        address seller,
        uint256 price,
        bool currentlyListed
    );

    event NFTDeListSuccess(
        address indexed nftContract,
        uint256 indexed tokenId,
        address owner
    );

    event UpdateListNFTPrice(
        address indexed nftContract,
        uint256 indexed tokenId,
        uint256 newPrice
    );

    event NFTSale(
        address indexed nftContract,
        uint256 indexed tokenId,
        address buyer,
        uint256 price
    );

    mapping(string => ListedNFT) private idToListedNFT;

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

    function getListedNFTForId(
        address nftContract,
        uint256 tokenId
    ) public view returns (ListedNFT memory) {
        string memory id = string.concat(
            Strings.toHexString(nftContract),
            Strings.toString(tokenId)
        );
        return idToListedNFT[id];
    }

    /* Places nfts for sale on the marketplace */
    function createListedNFT(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) public payable nonReentrant {
        require(price > 0, "Price must be at least 1 wei");
        require(msg.value == listPrice, "Price must be equal to listing price");

        string memory id = string.concat(
            Strings.toHexString(nftContract),
            Strings.toString(tokenId)
        );

        idToListedNFT[id] = ListedNFT(
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

    /* remove nft for sale on the marketplace */
    function deListNFT(
        address nftContract,
        uint256 tokenId
    ) public nonReentrant {
        string memory id = string.concat(
            Strings.toHexString(nftContract),
            Strings.toString(tokenId)
        );
        require(idToListedNFT[id].currentlyListed == true, "nft is not listed");

        require(
            msg.sender == idToListedNFT[id].seller,
            "Only Owner of NFT can de-list"
        );

        idToListedNFT[id].currentlyListed = false;
        idToListedNFT[id].owner = payable(msg.sender);
        idToListedNFT[id].seller = payable(address(0));

        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);

        emit NFTDeListSuccess(nftContract, tokenId, msg.sender);
    }

    /* update nft price*/
    function updateListNFTPrice(
        address nftContract,
        uint256 tokenId,
        uint256 newPrice
    ) public nonReentrant {
        string memory id = string.concat(
            Strings.toHexString(nftContract),
            Strings.toString(tokenId)
        );

        require(idToListedNFT[id].currentlyListed == true, "nft is not listed");

        require(
            msg.sender == idToListedNFT[id].seller,
            "Only Owner of NFT can update its price"
        );

        idToListedNFT[id].price = newPrice;

        emit UpdateListNFTPrice(nftContract, tokenId, newPrice);
    }

    function executeSale(
        address nftContract,
        uint256 tokenId
    ) public payable nonReentrant {
        string memory id = string.concat(
            Strings.toHexString(nftContract),
            Strings.toString(tokenId)
        );

        uint price = idToListedNFT[id].price;
        address seller = idToListedNFT[id].seller;
        require(
            msg.value == price,
            "Please submit the asking price in order to complete the purchase"
        );

        idToListedNFT[id].currentlyListed = false;
        idToListedNFT[id].owner = payable(msg.sender);
        idToListedNFT[id].seller = payable(address(0));

        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);

        // Compute royalties
        (
            address payable royaltyRecipient,
            uint256 royaltyAmount
        ) = _calculateRoyalties(nftContract, tokenId, price);

        // Transfer royalties
        if (royaltyAmount != 0) {
            royaltyRecipient.transfer(royaltyAmount);
        }

        //Transfer the proceeds from the sale to the seller of the NFT
        payable(seller).transfer(price - royaltyAmount);

        emit NFTSale(nftContract, tokenId, address(msg.sender), price);
    }

    /**
     * @notice Allow withdrawing funds
     */
    function withdraw() external {
        require(owner == msg.sender, "Only owner can withdraw");
        uint256 balance = address(this).balance;
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "Transfer failed!");
    }

    /**
     * Royalty support functions
     */
    function _calculateRoyalties(
        address nftContract,
        uint256 tokenId,
        uint256 saleAmount
    )
        internal
        view
        returns (address payable royaltyRecipient, uint256 royaltyAmount)
    {
        if (_checkRoyalties(nftContract)) {
            (address recipient, uint256 amount) = IERC2981(nftContract)
                .royaltyInfo(tokenId, saleAmount);
            return (payable(recipient), amount);
        } else {
            return (payable(0), 0);
        }
    }

    function _checkRoyalties(address _contract) internal view returns (bool) {
        bool success = IERC2981(_contract).supportsInterface(
            _INTERFACE_ID_ERC2981
        );
        return success;
    }
}
