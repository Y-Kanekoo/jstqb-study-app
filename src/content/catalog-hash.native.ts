import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

export function calculateCatalogHash(value: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
}
