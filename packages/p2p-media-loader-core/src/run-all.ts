/**
 * Runs each step whatever the ones before it made of themselves, and reports
 * what failed.
 *
 * Teardown is where this matters: an integrator's own segment storage is
 * destroyed as part of it and is free to throw, and a teardown that stopped
 * at the first failure leaves an adapter's loaders and listeners attached to
 * a player it reports as released. The caller raises what came back once
 * there is nothing left to let go of.
 */
export function runAll(steps: (() => void)[]): unknown[] {
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      step();
    } catch (failure) {
      failures.push(failure);
    }
  }
  return failures;
}
