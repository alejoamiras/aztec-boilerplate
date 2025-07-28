import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing";
import {
  AccountManager,
  AccountWalletWithSecretKey,
  ContractInstanceWithAddress,
  Fr,
  GrumpkinScalar,
  PXE,
  SponsoredFeePaymentMethod,
  createPXEClient,
} from "@aztec/aztec.js";
import {
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
} from "@aztec/aztec.js";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { FPCContract } from "@aztec/noir-contracts.js/FPC";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromDeployParams } from "@aztec/aztec.js";
import { CounterContract } from "../src/artifacts/Counter";
import { SPONSORED_FPC_SALT } from "@aztec/constants";

const secretKey = Fr.fromHexString(
  "0x092cdaff47a18bb6e9ffbca59e7f01c0bf5e4b9e415cc8cac2d20938ec93357f",
);
const signingPrivateKey = GrumpkinScalar.fromHexString(
  "0x292d8a29371c9fcca9b5b58aa4aa8287c22c68e62b1159360162f45149e9ee7b",
);
const salt = Fr.fromHexString(
  "0x19ceb1563956e0c7e0c0f984e6997b2a36b227d8f4b2add8e642f9cfb4483f71",
);

type Basics = {
  pxe: PXE;
  account: AccountManager;
  accountWallet: AccountWalletWithSecretKey;
  preFundedWallet: AccountWalletWithSecretKey;
};

async function setupBasics(): Promise<Basics> {
  const pxe = createPXEClient("http://localhost:8080");
  const preFundedWallet = (await getDeployedTestAccountsWallets(pxe))[0];
  const account = await getSchnorrAccount(
    pxe,
    secretKey,
    signingPrivateKey,
    salt,
  );
  return {
    pxe,
    preFundedWallet,
    account,
    accountWallet: await account.getWallet(),
  };
}

async function deployThroughFeeJuice(basics: Basics) {
  const { preFundedWallet, account } = basics;
  const counter = await CounterContract.deploy(
    preFundedWallet,
    account.getAddress(), // arg1: owner
  )
    .send()
    .deployed();
  console.log("counter address", counter.address.toString());
}

async function deployCoinAndFPC(basics: Basics): Promise<{
  gasCoin: TokenContract;
  feePayingContract: FPCContract;
}> {
  const { accountWallet, preFundedWallet } = basics;
  const gasCoin = await TokenContract.deploy(
    preFundedWallet,
    accountWallet.getAddress(),
    "gasCoin",
    "GC",
    18,
  )
    .send()
    .deployed();
  const feePayingContract = await FPCContract.deploy(
    preFundedWallet,
    gasCoin.address,
    accountWallet.getAddress(),
  )
    .send()
    .deployed();
  return {
    gasCoin,
    feePayingContract,
  };
}

// Fee Paying Contract
async function deployThroughFPC(basics: Basics) {
  const { gasCoin, feePayingContract } = await deployCoinAndFPC(basics);
  //   // get the deployed FPC contract instance
  //   const fpcContractInstance = getContractInstanceFromDeployParams(
  //     FPCContract.artifact,
  //     fpcDeployParams // the params used to deploy the FPC
  //   );
  //   // register the already deployed FPC contract in users PXE
  //   await pxe.registerContract({
  //     instance: fpcContractInstance,
  //     artifact: FPCContract.artifact,
  //   });
}

async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(
    SponsoredFPCContract.artifact,
    {
      salt: new Fr(SPONSORED_FPC_SALT),
    },
  );
}

// Sponsored Fee Paying Contract
async function deployThroughSponsoredFPC(basics: Basics) {
  const { account, accountWallet } = basics;
  const sponsoredFPC = await getSponsoredFPCInstance();
  console.log("sponsored fpc address", sponsoredFPC.address.toString());
  // It's already registered in the PXE on sandbox
  // await pxe.registerContract({
  //   instance: sponsoredFPC,
  //   artifact: SponsoredFPCContract.artifact,
  // });
  const sponsoredFeePaymentMethod = new SponsoredFeePaymentMethod(
    sponsoredFPC.address,
  );

  const counter = await CounterContract.deploy(
    accountWallet,
    account.getAddress(), // arg1: owner
  )
    .send({
      fee: {
        paymentMethod: sponsoredFeePaymentMethod,
      },
    })
    .deployed();
  console.log("counter address", counter.address.toString());
}

const basics = await setupBasics();
deployThroughSponsoredFPC(basics).then(() => process.exit(0));
