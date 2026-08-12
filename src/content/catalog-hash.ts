function bytesToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function calculateCatalogHash(value: string): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error('問題カタログのhash検証に必要なWeb Crypto APIを利用できません。');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return bytesToHex(digest);
}
