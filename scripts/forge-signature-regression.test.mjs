import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli'));
const certificateRequire = createRequire(cliRequire.resolve('@expo/code-signing-certificates'));

test('Expo CLI and certificate signer use the same patched node-forge', () => {
  assert.equal(cliRequire.resolve('node-forge'), certificateRequire.resolve('node-forge'));

  const forge = cliRequire('node-forge');
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const md = forge.md.sha256.create();
  md.update('synthetic signature regression', 'utf8');
  const digest = md.digest().getBytes();

  assert.equal(publicKey.verify(digest, privateKey.sign(md)), true);

  const asn1 = forge.asn1;
  const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const nestedWithGarbage = node(asn1.Type.SEQUENCE, true, [
    node(asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes()),
    node(asn1.Type.NULL, false, ''),
    node(asn1.Type.OCTETSTRING, false, 'unexpected-child'),
  ]);
  const malformedDigestInfo = asn1.toDer(node(asn1.Type.SEQUENCE, true, [
    nestedWithGarbage,
    node(asn1.Type.OCTETSTRING, false, digest),
  ])).getBytes();
  const malformedSignature = privateKey.sign(malformedDigestInfo, 'NONE');

  assert.throws(
    () => publicKey.verify(digest, malformedSignature),
    /valid RSASSA-PKCS1-v1_5 DigestInfo/u,
  );
});
