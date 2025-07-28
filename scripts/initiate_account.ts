import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { Fr, createPXEClient } from "@aztec/aztec.js";

const secretKey = Fr.fromHexString(
  "0x092cdaff47a18bb6e9ffbca59e7f01c0bf5e4b9e415cc8cac2d20938ec93357f",
);
// const signingPrivateKey = GrumpkinScalar.fromHexString("");
const signingPrivateKey = deriveSigningKey(secretKey);

const salt = Fr.fromHexString(
  "0x19ceb1563956e0c7e0c0f984e6997b2a36b227d8f4b2add8e642f9cfb4483f71",
);

async function main() {
  const pxe = await createPXEClient("http://localhost:8080");
  const account = await getSchnorrAccount(
    pxe,
    secretKey,
    signingPrivateKey,
    salt,
  );
  console.log("account address", account.getAddress().toString());
}

main().then(() => process.exit(0));
