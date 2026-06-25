/**
 * NFC cast/catch — Android Chrome only (Web NFC / NDEFReader). Feature-detect
 * and hide the option entirely where unsupported. On iOS, a physically
 * pre-written sticker still auto-opens the URL via the OS reader, but
 * phone-to-phone Web NFC is unavailable — so we never surface it on iOS.
 */

export function nfcSupported() {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

/**
 * Write the room URL to a tag. Must be called from a user gesture.
 * @returns {Promise<void>} resolves when the tag is written
 */
export async function writeRoomToTag(url) {
  if (!nfcSupported()) throw new Error('Web NFC unsupported');
  const reader = new window.NDEFReader();
  await reader.write({ records: [{ recordType: 'url', data: url }] });
}

/**
 * Scan for a tag and return the first URL record's data. Must be called from a
 * user gesture. Returns a stop() function; resolves the URL via onUrl callback.
 * @returns {Promise<() => void>} a stop function
 */
export async function scanTags(onUrl, onError) {
  if (!nfcSupported()) throw new Error('Web NFC unsupported');
  const reader = new window.NDEFReader();
  const controller = new AbortController();
  reader.onreading = (event) => {
    for (const record of event.message.records) {
      if (record.recordType === 'url') {
        const url = new TextDecoder().decode(record.data);
        onUrl(url);
        return;
      }
    }
  };
  reader.onreadingerror = () => onError?.(new Error('NFC read error'));
  await reader.scan({ signal: controller.signal });
  return () => controller.abort();
}
