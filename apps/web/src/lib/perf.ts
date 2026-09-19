/**
 * One attribute on the root toggles every glass surface at once. Components
 * never branch on it — that is the whole point of putting it in CSS.
 */
export function setBlurEnabled(on: boolean): void {
  if (on) document.documentElement.removeAttribute('data-blur')
  else document.documentElement.dataset.blur = 'off'
}

export function isBlurEnabled(): boolean {
  return document.documentElement.dataset.blur !== 'off'
}
