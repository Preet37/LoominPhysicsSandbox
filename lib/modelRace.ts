/**
 * Preference-ordered racing for model cascades.
 *
 * Trying models one at a time means a slow leader burns its entire timeout
 * producing nothing before the next candidate even starts, and in a repair loop
 * that dead time repeats every turn. Racing them together costs extra tokens but
 * bounds latency at the first useful answer, while still handing back the
 * strongest result whenever it arrives in time.
 */

export interface RaceOptions<T> {
  /** Rejects degenerate answers (e.g. a truncated 40-character component). */
  isUsable: (value: T) => boolean;
  /** Hard ceiling for the whole race. */
  budgetMs: number;
  /**
   * Grace period granted to stronger candidates once a weaker one has already
   * produced something usable. Without it, a stalled leader spends the entire
   * budget on a result that may never arrive.
   */
  upgradeWindowMs: number;
  onResolve?: (index: number, value: T) => void;
  onError?: (index: number, error: unknown) => void;
}

export interface RaceResult<T> {
  value: T;
  /** Position in the preference list; 0 is the strongest candidate. */
  index: number;
}

function unrefTimer(t: ReturnType<typeof setTimeout>): void {
  (t as unknown as { unref?: () => void }).unref?.();
}

export async function raceWithPreference<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  opts: RaceOptions<T>,
): Promise<RaceResult<T> | null> {
  if (tasks.length === 0) return null;

  const usable = new Map<number, T>();
  const errors: unknown[] = [];

  let armUpgradeWindow = () => {};
  const upgradeExpiry = new Promise<"upgrade">((resolve) => {
    armUpgradeWindow = () => {
      unrefTimer(setTimeout(() => resolve("upgrade"), opts.upgradeWindowMs));
    };
  });

  const running = tasks.map((task, index) =>
    task()
      .then((value) => {
        if (!opts.isUsable(value)) {
          errors.push(new Error(`candidate ${index} returned an unusable result`));
          return;
        }
        const isFirstUsable = usable.size === 0;
        usable.set(index, value);
        opts.onResolve?.(index, value);
        // Only a weaker winner starts the clock — if the strongest already
        // answered there is nothing left to upgrade to.
        if (isFirstUsable && index > 0) armUpgradeWindow();
      })
      .catch((error) => {
        errors.push(error);
        opts.onError?.(index, error);
      }),
  );

  const allSettled = Promise.all(running).then(() => "settled" as const);
  const budgetExpiry = new Promise<"budget">((resolve) => {
    unrefTimer(setTimeout(() => resolve("budget"), opts.budgetMs));
  });

  // The strongest candidate is the only reason to keep waiting; every other
  // outcome means we take the best result already in hand.
  if (!usable.has(0)) {
    await Promise.race([allSettled, budgetExpiry, upgradeExpiry]);
  }

  for (let i = 0; i < tasks.length; i++) {
    if (usable.has(i)) return { value: usable.get(i)!, index: i };
  }
  return null;
}
