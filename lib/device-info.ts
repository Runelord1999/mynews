// What a browser is willing to say about itself. Browsers deliberately hide
// real hardware identifiers, so this is a coarse fingerprint, not machine
// specs: no serial numbers, no hostnames, no MAC addresses exist here.
export function deviceInfo() {
 try {
  const nav = navigator as Navigator & {userAgentData?: {platform?: string; mobile?: boolean}; deviceMemory?: number};
  return {
   platform: nav.userAgentData?.platform || nav.platform || '',
   mobile: nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad/.test(navigator.userAgent),
   screen: `${screen.width}x${screen.height}@${devicePixelRatio || 1}x`,
   viewport: `${innerWidth}x${innerHeight}`,
   timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
   language: navigator.language || '',
   memoryGb: nav.deviceMemory ?? null,
   cores: navigator.hardwareConcurrency ?? null,
  };
 } catch {return {};}
}
