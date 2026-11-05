export interface NativeProofResult { id: string; status: 'passed' | 'failed' | 'manual-required'; detail: string }
export async function runNativeProof(): Promise<NativeProofResult[]> {
  return [{ id: 'native-build', status: 'manual-required', detail: 'Execute em um build Android próprio; navegador e Expo Go não validam SQLCipher.' }];
}
