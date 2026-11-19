/**
 * Hybrid Logical Clock.
 * Encoded as `<15-digit ms>:<5-char counter>:<node>` so plain string comparison gives causal order,
 * and ties between devices are broken deterministically by node id.
 */
export class Hlc {
  private lastMs = 0;
  private counter = 0;

  constructor(
    private readonly node: string,
    private readonly clock: () => number = Date.now,
  ) {}

  now(): string {
    const t = this.clock();
    if (t > this.lastMs) {
      this.lastMs = t;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return Hlc.encode(this.lastMs, this.counter, this.node);
  }

  /** Advance past a timestamp seen from another device so our next write orders after it. */
  receive(remote: string): void {
    const { ms, counter } = Hlc.decode(remote);
    if (ms > this.lastMs) {
      this.lastMs = ms;
      this.counter = counter;
    } else if (ms === this.lastMs && counter > this.counter) {
      this.counter = counter;
    }
  }

  static encode(ms: number, counter: number, node: string): string {
    return `${ms.toString().padStart(15, '0')}:${counter.toString(36).padStart(5, '0')}:${node}`;
  }

  static decode(hlc: string): { ms: number; counter: number; node: string } {
    const [ms, counter, ...node] = hlc.split(':');
    return { ms: Number(ms), counter: parseInt(counter, 36), node: node.join(':') };
  }
}
