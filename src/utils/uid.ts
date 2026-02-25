let counter = 0;

export function generateUid(): string {
  counter++;
  return `el_${Date.now().toString(36)}_${counter.toString(36)}`;
}
