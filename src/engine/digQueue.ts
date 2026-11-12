export type DigJob = { userId: string; digs: number; rolls: number; big: boolean };

export class DigQueue {
  private jobs: DigJob[] = [];
  push(job: DigJob): void {
    this.jobs.push(job);
  }
  drainAll(): DigJob[] {
    const out = this.jobs;
    this.jobs = [];
    return out;
  }
  get size(): number {
    return this.jobs.length;
  }
}
