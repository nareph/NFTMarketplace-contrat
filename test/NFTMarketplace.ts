import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

const zero_address = "0x0000000000000000000000000000000000000000";

describe("NFTMarketplace", function () {

  async function deployNFTMarketplaceFixture() {
    const [owner, otherAccount, lastAccount] = await hre.ethers.getSigners();

    const Test721 = await hre.ethers.getContractFactory("Test721");
    const NFTMarketplace = await hre.ethers.getContractFactory("NFTMarketplace");
    const test721 = await Test721.deploy();
    const nftMarketplace = await NFTMarketplace.deploy();

    return { nftMarketplace, test721, owner, otherAccount, lastAccount };
  }

  async function deployAndListNFTFixture() {
    const { nftMarketplace, test721, owner, otherAccount, lastAccount } = await loadFixture(deployNFTMarketplaceFixture);

    const tokenId = 10
    const nftContract = test721.target
    const marketplaceAddress = nftMarketplace.target
    const listPrice = await nftMarketplace.getListPrice()
    const price = 300
    //const currentlyListed = true

    await test721.mint(otherAccount, tokenId)
    await test721.connect(otherAccount).approve(nftMarketplace.target, tokenId)
    const listNFTResult = await nftMarketplace.connect(otherAccount).createListedNFT(test721.target, tokenId, price, { value: listPrice })


    return { nftMarketplace, test721, listNFTResult, tokenId, listPrice, price, owner, otherAccount, lastAccount };
  }

  describe("Deployment", function () {

    it("Should set the right owner", async function () {
      const { nftMarketplace, owner } = await loadFixture(deployNFTMarketplaceFixture);

      expect(await nftMarketplace.owner()).to.equal(owner.address);
    });
  });

  describe('UpdateListPrice', function () {
    it('Should be reverted because the caller is not owner', async function () {
      const { nftMarketplace, otherAccount } = await loadFixture(deployNFTMarketplaceFixture);
      const expectedValue = 5
      await expect(
        nftMarketplace.connect(otherAccount).updateListPrice(expectedValue),
      ).to.be.revertedWith('Only owner can update listing price')
    })

    it('Should set updateListPrice by owner', async function () {
      const expectedValue = 5
      const { nftMarketplace, owner } = await loadFixture(deployNFTMarketplaceFixture);

      await nftMarketplace.connect(owner).updateListPrice(expectedValue)

      expect(await nftMarketplace.getListPrice()).to.equal(expectedValue)
    })
  })

  describe("List On NFTMarketplace", function () {
    describe("Validations", function () {
      it("Should set the right Price parameter", async function () {
        const { nftMarketplace, test721 } = await loadFixture(deployNFTMarketplaceFixture);

        await expect(nftMarketplace.createListedNFT(test721.target, 0, 0)).to.be.revertedWith(
          "Price must be at least 1 wei"
        );
      });

      it('Should be reverted because the caller do not sent correct fund', async function () {
        const { nftMarketplace, test721 } = await loadFixture(deployNFTMarketplaceFixture);

        await expect(nftMarketplace.createListedNFT(test721.target, 0, 1, { value: 1 })).to.be.revertedWith(
          "Price must be equal to listing price"
        );
      });

    });

    describe("List NFT", function () {
      it('Should be listed nft with good parameters and marketplace receive listPrice', async function () {
        const { nftMarketplace, test721, listNFTResult, tokenId, listPrice, price, otherAccount } = await loadFixture(deployAndListNFTFixture);

        expect(listNFTResult
        ).to.changeEtherBalances([nftMarketplace, otherAccount], [listPrice, -listPrice]);

        expect(await test721.ownerOf(tokenId)).to.equal(nftMarketplace.target)

        const listedNFT = await nftMarketplace.getListedNFTForId(test721.target, tokenId);

        expect(listedNFT.nftContract).to.equal(test721.target)
        expect(listedNFT.tokenId).to.equal(tokenId)
        expect(listedNFT.owner).to.equal(nftMarketplace.target)
        expect(listedNFT.seller).to.equal(otherAccount.address)
        expect(listedNFT.price).to.equal(price)
        expect(listedNFT.currentlyListed).to.equal(true)
      });
    });

    describe("Events", function () {
      it("Should emit NFTListedSuccess events", async function () {
        const { nftMarketplace, test721, listNFTResult, tokenId, price, otherAccount } = await loadFixture(deployAndListNFTFixture);

        expect(listNFTResult)
          .to.emit(nftMarketplace, "NFTListedSuccess")
          .withArgs(test721.target, tokenId, nftMarketplace.target, otherAccount.address, price);
      });
    });
  });

  describe("De-List On NFTMarketplace", function () {
    describe("Validations", function () {
      it("Should be reverted because the NFT is not listed ", async function () {
        const { nftMarketplace, test721, tokenId } = await loadFixture(deployAndListNFTFixture);

        await expect(nftMarketplace.deListNFT(test721.target, 11)).to.be.revertedWith(
          "nft is not listed"
        );
      });

      it("Should be reverted because the caller is not owner of the NFT", async function () {
        const { nftMarketplace, test721, tokenId } = await loadFixture(deployAndListNFTFixture);

        await expect(nftMarketplace.deListNFT(test721.target, tokenId)).to.be.revertedWith(
          "Only Owner of NFT can de-list"
        );
      });
    });

    describe("De-List NFT", function () {
      it('Should be de-listed nft on marketplace', async function () {
        const { nftMarketplace, test721, listNFTResult, tokenId, listPrice, price, otherAccount } = await loadFixture(deployAndListNFTFixture);

        await nftMarketplace.connect(otherAccount).deListNFT(test721.target, tokenId);

        expect(await test721.ownerOf(tokenId)).to.equal(otherAccount.address)

        const deListedNFT = await nftMarketplace.getListedNFTForId(test721.target, tokenId);

        expect(deListedNFT.nftContract).to.equal(test721.target)
        expect(deListedNFT.tokenId).to.equal(tokenId)
        expect(deListedNFT.owner).to.equal(otherAccount.address)
        expect(deListedNFT.seller).to.equal(zero_address)// address(0)
        expect(deListedNFT.price).to.equal(price)
        expect(deListedNFT.currentlyListed).to.equal(false)
      });
    });

    describe("Events", function () {
      it("Should emit NFTDeListSuccess events", async function () {
        const { nftMarketplace, test721, tokenId, price, otherAccount } = await loadFixture(deployAndListNFTFixture);

        expect(await nftMarketplace.connect(otherAccount).deListNFT(test721.target, tokenId))
          .to.emit(nftMarketplace, "NFTDeListSuccess")
          .withArgs(test721.target, tokenId, otherAccount.address);
      });
    });
  });

  describe("Update Price of NFT On NFTMarketplace", function () {
    describe("Validations", function () {
      it("Should be reverted because the NFT is not listed ", async function () {
        const { nftMarketplace, test721, tokenId } = await loadFixture(deployAndListNFTFixture);

        await expect(nftMarketplace.updateListNFTPrice(test721.target, 11, 100)).to.be.revertedWith(
          "nft is not listed"
        );
      });

      it("Should be reverted because the caller is not owner of the NFT", async function () {
        const { nftMarketplace, test721, tokenId } = await loadFixture(deployAndListNFTFixture);

        await expect(nftMarketplace.updateListNFTPrice(test721.target, tokenId, 100)).to.be.revertedWith(
          "Only Owner of NFT can update its price"
        );
      });
    });

    describe("Update NFT Price", function () {
      it('Should be updated the price of listed nft', async function () {
        const { nftMarketplace, test721, listNFTResult, tokenId, listPrice, price, otherAccount } = await loadFixture(deployAndListNFTFixture);

        const newPrice = 400;

        await nftMarketplace.connect(otherAccount).updateListNFTPrice(test721.target, tokenId, newPrice);

        expect(await test721.ownerOf(tokenId)).to.equal(nftMarketplace.target)

        const updatedNFT = await nftMarketplace.getListedNFTForId(test721.target, tokenId)

        expect(updatedNFT.nftContract).to.equal(test721.target)
        expect(updatedNFT.tokenId).to.equal(tokenId)
        expect(updatedNFT.owner).to.equal(nftMarketplace.target)
        expect(updatedNFT.seller).to.equal(otherAccount.address)
        expect(updatedNFT.price).to.equal(newPrice)
        expect(updatedNFT.currentlyListed).to.equal(true)
      });
    });

    describe("Events", function () {
      it("Should emit UpdateListNFTPrice events", async function () {
        const { nftMarketplace, test721, tokenId, otherAccount } = await loadFixture(deployAndListNFTFixture);

        const newPrice = 400;

        expect(await nftMarketplace.connect(otherAccount).updateListNFTPrice(test721.target, tokenId, newPrice))
          .to.emit(nftMarketplace, "UpdateListNFTPrice")
          .withArgs(test721.target, tokenId, newPrice);
      });
    });
  });

  describe("Buy On NFTMarketplace", function () {
    describe("Validations", function () {
      it('Should be reverted because the caller do not send correct fund', async function () {
        const { nftMarketplace, test721, price, tokenId } = await loadFixture(deployAndListNFTFixture);
        const badPrice = price + 1;
        await expect(nftMarketplace.executeSale(test721.target, tokenId, { value: badPrice })).to.be.revertedWith(
          "Please submit the asking price in order to complete the purchase"
        );
      });
    });

    describe("Buy NFT", function () {
      it('Should be purchase nft and royaltyRecipient will receive RoyaltyAmount and the seller (price - royaltyAmount). ', async function () {
        const
          { nftMarketplace, test721, listNFTResult, tokenId, listPrice, price, owner, otherAccount, lastAccount } =
            await loadFixture(deployAndListNFTFixture);
        const royaltyInfo = await test721.royaltyInfo(tokenId, price)
        const royaltyAmount = royaltyInfo[1];
        const amountWithoutRoyalty = price - Number(royaltyAmount)

        await expect(nftMarketplace.connect(lastAccount).executeSale(test721.target, tokenId, { value: price }))
          .to.changeEtherBalances([royaltyInfo[0], otherAccount, lastAccount], [royaltyAmount, amountWithoutRoyalty, -price]);

        expect(await test721.ownerOf(tokenId)).to.equal(lastAccount.address)

        const listedNFT = await nftMarketplace.getListedNFTForId(test721.target, tokenId)

        expect(listedNFT.nftContract).to.equal(test721.target)
        expect(listedNFT.tokenId).to.equal(tokenId)
        expect(listedNFT.owner).to.equal(lastAccount.address)
        expect(listedNFT.seller).to.equal(zero_address)
        expect(listedNFT.price).to.equal(price)
        expect(listedNFT.currentlyListed).to.equal(false)

      });

    });

    describe("Events", function () {
      it("Should emit NFTSale events", async function () {
        const { nftMarketplace, test721, price, tokenId, owner } = await loadFixture(deployAndListNFTFixture);

        await expect(nftMarketplace.executeSale(test721.target, tokenId, { value: price }))
          .to.emit(nftMarketplace, "NFTSale")
          .withArgs(test721.target, tokenId, owner.address, price);

      });

    });
  });

  describe("Withdraw marketplace fee", function () {
    describe("Validations", function () {
      it('Should be reverted because the caller is not owner', async function () {
        const { nftMarketplace, otherAccount } = await loadFixture(deployNFTMarketplaceFixture);

        await expect(nftMarketplace.connect(otherAccount).withdraw()).to.be.revertedWith(
          "Only owner can withdraw"
        );
      });

    });

    describe("Withdraw", function () {
      it('Should withdraw by owner', async function () {
        const { nftMarketplace, owner } = await loadFixture(deployNFTMarketplaceFixture);

        const contractBalance = await hre.ethers.provider.getBalance(nftMarketplace.target);

        expect(nftMarketplace.connect(owner).withdraw()
        ).to.changeEtherBalances([nftMarketplace, owner], [-contractBalance, contractBalance]);

      });

    });
  });

});