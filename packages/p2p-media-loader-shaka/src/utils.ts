/* eslint-disable @typescript-eslint/no-explicit-any */

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

export function decorateMethod<
  T extends object,
  MethodName extends MethodNames<T>,
  Method extends T[MethodName] extends (...args: any[]) => any
    ? T[MethodName]
    : never
>(
  player: T,
  method: MethodName,
  decorator: (...args: Parameters<Method>) => void,
  position: "before" | "after" = "before"
) {
  const methodOriginal = player[method] as Method;

  player[method] = ((...args) => {
    if (position === "before") decorator(...(args as Parameters<Method>));
    const result = methodOriginal.apply(player, args);
    if (position === "after") decorator(...(args as Parameters<Method>));
    return result;
  }) as Method;
  (player[method] as any)._p2pmlOriginalMethod = methodOriginal;
}

export function undecorateMethod<
  T extends object,
  MethodName extends MethodNames<T>,
  Method extends T[MethodName] extends (...args: any[]) => any
    ? T[MethodName]
    : never
>(player: T, method: MethodName) {
  const originalMethod = (player[method] as any)._p2pmlOriginalMethod as Method;
  (player[method] as any) = originalMethod.bind(player);
}
