type MethodNames<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

export function decorateMethod<
  T extends object,
  MethodName extends MethodNames<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Method extends T[MethodName] extends (...args: any[]) => any
    ? T[MethodName]
    : never
>(
  player: T,
  method: MethodName,
  decorator: (...args: Parameters<Method>) => void
) {
  const methodOriginal = player[method] as Method;

  player[method] = ((...args) => {
    const result = methodOriginal.apply(player, args);
    decorator(...(args as Parameters<Method>));
    return result;
  }) as Method;
}
