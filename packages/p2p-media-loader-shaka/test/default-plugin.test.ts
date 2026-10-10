import { describe, expect, it, vi } from "vitest";
import { defaultPluginFor } from "../src/default-plugin.js";
import type { Shaka } from "../src/types.js";

/**
 * The two paths that load without the core — a request no engine claimed, and
 * a request type the adapter passes through — both ask this which plugin
 * Shaka would have used.
 */
function fakeShaka(fetchSupported: boolean) {
  const net = {
    HttpFetchPlugin: { parse: vi.fn(), isSupported: () => fetchSupported },
    HttpXHRPlugin: { parse: vi.fn() },
    DataUriPlugin: { parse: vi.fn() },
  };
  return { shaka: { net } as unknown as Shaka, net };
}

describe("the plugin Shaka would have used", () => {
  it("is fetch where fetch is supported", () => {
    const { shaka, net } = fakeShaka(true);
    expect(defaultPluginFor(shaka, "https://cdn.example/s.m3u8")).toBe(
      net.HttpFetchPlugin,
    );
  });

  it("is XHR where it is not", () => {
    // Old Smart TV browsers: Shaka registers XHR there and never registers
    // the fetch plugin at all; forcing it throws inside Shaka.
    const { shaka, net } = fakeShaka(false);
    expect(defaultPluginFor(shaka, "https://cdn.example/s.m3u8")).toBe(
      net.HttpXHRPlugin,
    );
  });

  it("decodes a data URI, on either", () => {
    // An XHR cannot open one, and Shaka registers `data:` to a plugin that
    // decodes it with no network stack.
    for (const fetchSupported of [true, false]) {
      const { shaka, net } = fakeShaka(fetchSupported);
      expect(
        defaultPluginFor(shaka, "data:application/dash+xml;base64,PE1QRC8+"),
      ).toBe(net.DataUriPlugin);
    }
  });
});
