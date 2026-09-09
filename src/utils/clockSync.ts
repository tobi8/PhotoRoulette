export class ClockSync {
  private offsetMs: number = 0
  private rttSamples: Array<{ rtt: number; offset: number }> = []

  public recordSample(tClientSend: number, tServerTime: number, tClientReceive: number): number {
    const rtt = Math.max(0, tClientReceive - tClientSend)
    const offset = tServerTime + rtt / 2 - tClientReceive
    this.rttSamples.push({ rtt, offset })
    if (this.rttSamples.length > 10) {
      this.rttSamples.shift()
    }
    const bestSamples = [...this.rttSamples].sort((a, b) => a.rtt - b.rtt).slice(0, Math.min(5, this.rttSamples.length))
    const avgOffset = bestSamples.reduce((acc, curr) => acc + curr.offset, 0) / bestSamples.length
    this.offsetMs = Math.round(avgOffset)
    return this.offsetMs
  }

  public setOffset(offset: number): void {
    this.offsetMs = offset
  }

  public getOffset(): number {
    return this.offsetMs
  }

  public now(): number {
    return Date.now() + this.offsetMs
  }

  public reset(): void {
    this.offsetMs = 0
    this.rttSamples = []
  }
}

export const clockSync = new ClockSync()
