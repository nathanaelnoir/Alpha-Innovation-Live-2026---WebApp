import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// jsdom does not currently ship PointerEvent; MouseEvent carries the coordinates
// needed by the component while preserving the Pointer Events code path in tests.
Object.defineProperty(window, 'PointerEvent', {
  configurable: true,
  value: MouseEvent,
})

Object.defineProperties(HTMLElement.prototype, {
  setPointerCapture: { configurable: true, value: vi.fn() },
  hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
  releasePointerCapture: { configurable: true, value: vi.fn() },
})
