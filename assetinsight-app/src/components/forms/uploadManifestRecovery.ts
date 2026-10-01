import { Alert } from 'react-native';

export function uploadConflictSource(error: any, fallback: string): string {
  // The server may have followed a prior replacement alias. Its canonical job
  // identity is also the client submission identity for these upload sessions.
  const value = error?.response?.data?.data?.jobId;
  return typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,160}$/.test(value) ? value : fallback;
}

/** Recovery is an explicit action, never an automatic identity change/retry. */
export function showUploadManifestRecovery(error: any, replace?: () => void): boolean {
  if (error?.response?.status !== 409 || error?.response?.data?.code !== 'SUBMISSION_MANIFEST_CHANGED') return false;
  if (error.response.data.data?.reportId) {
    Alert.alert('Existing report found', 'This upload already belongs to a report. Your current draft is saved. Open Reports or Previews to review the existing report, or contact support; it will not be replaced or submitted again.');
    return true;
  }
  Alert.alert(
    'Upload needs updating',
    replace
      ? 'The photos or lot grouping differ from the earlier upload. Your draft is saved. Upload the current version? The server will replace only an unfinished upload; an already-accepted report will not be replaced or duplicated.'
      : 'The photos or lot grouping differ from the earlier Incoming upload. Your draft is saved. Keep this draft and contact support to recover the same assigned upload; do not create a separate report for it.',
    [
      { text: 'Keep Draft', style: 'cancel' },
      ...(replace ? [{ text: 'Upload updated version', onPress: replace }] : []),
    ],
  );
  return true;
}
