import { Address, log } from "@graphprotocol/graph-ts"
import { AtomicMatch_Call } from "../generated/OpenSea/OpenSea"
import { ERC721, Transfer} from "../generated/templates/ERC721/ERC721"
import { Token, Contract, TransferEvent } from "../generated/schema"
import { ERC721 as ERC721Registry } from "../generated/templates"
const WHITE_LIST_CONTRACTS_ADDRS:Array<string> = ["0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85"]
const WHITE_LIST_CONTRACTS_NAMES:Array<string> = ["Ethereum Name Service"]

let non_721_tokens:Array<string> = []

function createContractIfNotExisted(addr:string): void{
  if(non_721_tokens.includes(addr)){
    return
  }
  let contract = Contract.load(addr)
  if(!contract){
    let contractName: string | null = null
    let position = WHITE_LIST_CONTRACTS_ADDRS.indexOf(addr)
    if(position >= 0){
      contractName = WHITE_LIST_CONTRACTS_NAMES[position]
    }
    if(contractName == null){
      let nftContract = ERC721.bind(Address.fromString(addr))
      log.debug("contract created "+addr,[])
      if(nftContract.try_symbol().reverted){
        log.debug("try_symbol reverted "+addr,[])
        non_721_tokens.push(addr)
        return
      }
      let callResult = nftContract.try_name()
      if(callResult.reverted){
        log.debug("try_name reverted "+addr,[])
        non_721_tokens.push(addr)
        return
      }
      contractName = callResult.value
    }
    contract = new Contract(addr)
    contract.name = (contractName || '') as string
    contract.address = Address.fromString(addr)
    contract.tokens = []
    contract.save()
    ERC721Registry.create(Address.fromString(addr))
  }
}
export function handleOpenSeaSale(call:AtomicMatch_Call): void{
  let addrs = call.inputs.addrs
  createContractIfNotExisted(addrs[4].toHexString())
}

export function handleTransfer(event: Transfer): void {
  let contract = Contract.load(event.address.toHexString())

  let nftContract = ERC721.bind(Address.fromString(event.address.toHexString()))

  let shouldSaveContract = false
  if(!contract){
    contract = new Contract(event.address.toHexString())
    contract.address = event.address

    let callResult = nftContract.try_name()
    if(callResult.value == null){
      return
    }
    else{
      contract.name = callResult.value
      shouldSaveContract = true
    }
  }
  let tokenId = contract.address.toHexString() + '_'+event.params.tokenId.toString()
  let token = Token.load(tokenId)
  if(!token){
    token = new Token(tokenId)
    token.tokenId = event.params.tokenId
    token.contract = contract.id
    
    let tks = contract.tokens
    tks.push(token.id)
    contract.tokens = tks
    shouldSaveContract = true
  }

  let callOwner = nftContract.try_ownerOf(event.params.tokenId)
  if(!callOwner.reverted){
    token.owner = callOwner.value
  }
  token.save()
    
  if(shouldSaveContract){
    contract.save()
  }
  
  let transferId = event.transaction.hash.toHexString()+' '+event.logIndex.toString()
  let transfer = TransferEvent.load(transferId)
  if(!transfer){
    transfer = new TransferEvent(transferId)
    transfer.contract = contract.id
    transfer.contractAddress = event.address
    transfer.token = token.id
    transfer.tokenId = event.params.tokenId
    transfer.txEth = event.transaction.value.toBigDecimal()
    transfer.from = event.params.from
    transfer.to = event.params.from
    transfer.block = event.block.number
    transfer.timestamp = event.block.timestamp
    transfer.logIndex = event.logIndex
    transfer.txHash = event.transaction.hash
    transfer.save()
  }
}
