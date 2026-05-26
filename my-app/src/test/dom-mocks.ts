import { vi } from "vitest";

// Remember the original descriptors so we can put them back after each test.
const _origScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);
const _origClientHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientHeight",
);

export function mockOverflowLayout({
  scrollHeight = 120,
  clientHeight = 40,
}: {
  scrollHeight?: number;
  clientHeight?: number;
} = {}) {
  class MockResizeObserver {
    observe() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);

  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
}

/** Restore the original prototype descriptors. Call in afterEach / afterAll. */
export function restoreOverflowLayout() {
  if (_origScrollHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollHeight",
      _origScrollHeight,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  }
  if (_origClientHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "clientHeight",
      _origClientHeight,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  }
}
