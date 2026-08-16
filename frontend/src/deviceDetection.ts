const DESKTOP_POINTER_QUERY = '(hover: hover) and (pointer: fine)'

export function isLikelyDesktopDevice(
  hasFineHoverPointer: boolean,
  maxTouchPoints: number,
): boolean {
  return hasFineHoverPointer && maxTouchPoints === 0
}

export function detectLikelyDesktopDevice(): boolean {
  const hasFineHoverPointer =
    window.matchMedia?.(DESKTOP_POINTER_QUERY).matches ?? false
  return isLikelyDesktopDevice(hasFineHoverPointer, navigator.maxTouchPoints ?? 0)
}
