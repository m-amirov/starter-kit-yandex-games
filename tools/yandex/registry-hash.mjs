import crypto from 'node:crypto';

/**
 * Hash registry text by its semantic bytes, independent of checkout EOL.
 * Deliberate whitespace/content changes remain visible to the hash.
 */
export function normalizeRegistryText(text) {
  return String(text).replace(/\r\n?/g, '\n');
}

export function registryTextSha256(text) {
  return crypto.createHash('sha256')
    .update(normalizeRegistryText(text), 'utf8')
    .digest('hex');
}
