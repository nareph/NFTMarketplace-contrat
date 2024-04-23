// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
//import "@openzeppelin/contracts/access/Ownable.sol";

contract Test721 is ERC721, ERC2981 {
    constructor() ERC721("Test721", "T721") {
	_setDefaultRoyalty(msg.sender, 200);		    
    }

    function mint(address to, uint256 id) public {
        
        _mint(to, id);
    }
    
    function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, ERC2981)
    returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
