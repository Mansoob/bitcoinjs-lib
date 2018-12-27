const Buffer = require('safe-buffer').Buffer
const bech32 = require('bech32')
const bs58check = require('bs58check')
const bscript = require('./script')
const networks = require('./networks')
const typeforce = require('typeforce')
const types = require('./types')
const payments = require('./payments')
import * as Networks from './networks'
import { Network } from './networks'

export type Base58CheckResult = {
  hash: Buffer;
  version: number;
}

export type Bech32Result = {
  version: number;
  prefix: string;
  data: Buffer;
}

export function fromBase58Check (address: string): Base58CheckResult {
  const payload = bs58check.decode(address)

  // TODO: 4.0.0, move to "toOutputScript"
  if (payload.length < 21) throw new TypeError(address + ' is too short')
  if (payload.length > 21) throw new TypeError(address + ' is too long')

  const version = payload.readUInt8(0)
  const hash = payload.slice(1)

  return { version: version, hash: hash }
}

export function fromBech32 (address: string): Bech32Result {
  const result = bech32.decode(address)
  const data = bech32.fromWords(result.words.slice(1))

  return {
    version: result.words[0],
    prefix: result.prefix,
    data: Buffer.from(data)
  }
}

export function toBase58Check (hash: Buffer, version: number): string {
  typeforce(types.tuple(types.Hash160bit, types.UInt8), arguments)

  const payload = Buffer.allocUnsafe(21)
  payload.writeUInt8(version, 0)
  hash.copy(payload, 1)

  return bs58check.encode(payload)
}

export function toBech32 (data: Buffer, version: number, prefix: string): string {
  const words = bech32.toWords(data)
  words.unshift(version)

  return bech32.encode(prefix, words)
}

export function fromOutputScript (output: Buffer, network: Network): string { //TODO: Network
  network = network || networks.bitcoin

  try { return payments.p2pkh({ output, network }).address } catch (e) {}
  try { return payments.p2sh({ output, network }).address } catch (e) {}
  try { return payments.p2wpkh({ output, network }).address } catch (e) {}
  try { return payments.p2wsh({ output, network }).address } catch (e) {}

  throw new Error(bscript.toASM(output) + ' has no matching Address')
}

export function toOutputScript (address: string, network: Network): Buffer {
  network = network || networks.bitcoin

  let decodeBase58: Base58CheckResult
  let decodeBech32: Bech32Result
  try {
    decodeBase58 = fromBase58Check(address)
  } catch (e) {}

  if (decodeBase58) {
    if (decodeBase58.version === network.pubKeyHash) return payments.p2pkh({ hash: decodeBase58.hash }).output
    if (decodeBase58.version === network.scriptHash) return payments.p2sh({ hash: decodeBase58.hash }).output
  } else {
    try {
      decodeBech32 = fromBech32(address)
    } catch (e) {}

    if (decodeBech32) {
      if (decodeBech32.prefix !== network.bech32) throw new Error(address + ' has an invalid prefix')
      if (decodeBech32.version === 0) {
        if (decodeBech32.data.length === 20) return payments.p2wpkh({ hash: decodeBech32.data }).output
        if (decodeBech32.data.length === 32) return payments.p2wsh({ hash: decodeBech32.data }).output
      }
    }
  }

  throw new Error(address + ' has no matching Script')
}
