export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform?.toUpperCase().includes('MAC') ??
    navigator.userAgent?.toUpperCase().includes('MAC') ??
    false;
}

export function getModKey(): 'metaKey' | 'ctrlKey' {
  return isMacOS() ? 'metaKey' : 'ctrlKey';
}
