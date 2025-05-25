import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  PublicAPI,
} from '@massalabs/massa-web3';
import { getScByteCode } from './utils';

const account = await Account.fromEnv();
console.log('Adresse du compte (string) :', account.address.toString());
const apiUrl = "https://buildnet.massa.net/api/v2";
const provider = new JsonRpcProvider(new PublicAPI(apiUrl), account);
// Vérification réseau
const status = await provider.getNodeStatus();
console.log('Network version:', status.version, 'ChainId:', status.chainId);

console.log('Deploying contract...');

const byteCode = getScByteCode('build', 'main.wasm');

const name = 'Tetrisc';
const constructorArgs = new Args().addString(name);

const contract = await SmartContract.deploy(
  provider,
  byteCode,
  constructorArgs,
  { coins: Mas.fromString('10') },
);

console.log('Contract deployed at:', contract.address);

const events = await provider.getEvents({
  smartContractAddress: contract.address,
});

for (const event of events) {
  console.log('Event message:', event.data);
}
