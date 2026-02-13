/**
 * Dummy Blob ID Generator
 *
 * TODO: This is a temporary utility for hackathon development.
 * Replace with actual Walrus blob IDs when Walrus integration is restored.
 *
 * Purpose: Generates fake blob IDs to bypass Walrus upload during development.
 * Format: dummy-{type}-{random}-{timestamp}
 */

/**
 * Generates a dummy blob ID for testing without Walrus integration
 * @param type - Type of blob (e.g., 'job', 'milestone', 'avatar')
 * @param id - Optional identifier to include in the blob ID
 * @returns A dummy blob ID string
 */
export function generateDummyBlobId(type: string, id?: string | number): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const identifier = id ? `${id}` : random;

  return `dummy-${type}-${identifier}-${timestamp}`;
}

/**
 * Check if a blob ID is a dummy ID
 * @param blobId - The blob ID to check
 * @returns true if the blob ID is a dummy ID
 */
export function isDummyBlobId(blobId: string): boolean {
  return blobId.startsWith('dummy-');
}
