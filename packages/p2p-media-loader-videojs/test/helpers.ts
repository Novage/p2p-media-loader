import type { VhsRequestHook, VhsResponseHook, VhsXhr } from "../src/types.js";

/**
 * Gives an xhr function the hook registry VHS puts on one: `onRequest` and
 * friends, backed by the sets VHS's own methods read.
 */
export function hookRegistry(fn: VhsXhr): VhsXhr {
  fn.onRequest = (cb: VhsRequestHook) => {
    (fn._requestCallbackSet ??= new Set()).add(cb);
  };
  fn.offRequest = (cb: VhsRequestHook) => fn._requestCallbackSet?.delete(cb);
  fn.onResponse = (cb: VhsResponseHook) => {
    (fn._responseCallbackSet ??= new Set()).add(cb);
  };
  fn.offResponse = (cb: VhsResponseHook) => fn._responseCallbackSet?.delete(cb);
  return fn;
}
