import { Cpu } from "./simulator";

export class CpuManager {
  private cpus: Cpu[];

  constructor() {
    this.cpus = [];
  }

  public setCpuAmount(cpuAmount: number) {
    if (this.cpus.length == cpuAmount) {
      return;
    }
    // TODO
  }
}
