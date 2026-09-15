// Settings IDs are shareable, not secret: they read like a playlist name and
// are stored in plain text so the Master Admin panel can list and rename them.
export const idPattern = /^[a-z0-9][a-z0-9_-]{1,38}[a-z0-9]$/;

export function normaliseId(value: string) {
  return value.trim().toLowerCase();
}

export function validId(value: string) {
  return idPattern.test(normaliseId(value));
}

const adjectives = ['amber', 'brisk', 'calm', 'clever', 'crisp', 'daily', 'eager', 'early', 'golden', 'keen', 'lucid', 'north', 'quiet', 'rapid', 'sharp', 'solar', 'steady', 'swift', 'urban', 'vivid'];
const nouns = ['anchor', 'beacon', 'bulletin', 'canvas', 'column', 'compass', 'digest', 'edition', 'gazette', 'harbor', 'headline', 'journal', 'ledger', 'lookout', 'marker', 'notebook', 'outlook', 'signal', 'summit', 'tribune'];

export function suggestId() {
  const pick = <T,>(list: T[]) => list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(2)), b => b.toString(16).padStart(2, '0')).join('');
  return `${pick(adjectives)}-${pick(nouns)}-${suffix}`;
}
