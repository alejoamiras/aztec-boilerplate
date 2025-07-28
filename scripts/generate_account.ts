import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { Fr, createPXEClient } from "@aztec/aztec.js";

async function main() {
  const pxe = await createPXEClient("http://localhost:8080");
  // Generate a random secret key and signing private key.
  const secretKey = Fr.random();
  // const signingPrivateKey = GrumpkinScalar.random();
  const signingPrivateKey = deriveSigningKey(secretKey);
  // Use a pre-funded wallet to pay for the fees for the deployments.
  const wallet = (await getDeployedTestAccountsWallets(pxe))[0];
  const newAccount = await getSchnorrAccount(pxe, secretKey, signingPrivateKey);
  await newAccount.deploy({ deployWallet: wallet }).wait();
  await newAccount.register();
  console.log("secret key", secretKey.toString());
  console.log("signing private key", signingPrivateKey.toString());
  console.log("account salt", newAccount.salt.toString());
  console.log("address", newAccount.getAddress().toString());
}

main();
