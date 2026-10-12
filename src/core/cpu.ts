export class Cpu {
  private static cpuCount: number = 0;
  public readonly id: number;

  constructor() {
    this.id = Cpu.cpuCount++;
  }
}

export class CpuManager {
  private cpus: Cpu[];

  constructor() {
    this.cpus = [];
  }

  public addCpu() {
    this.cpus.push(new Cpu());
  }

  public removeCpu() {
    // TODO: consider what will happen to the task executing in this CPU
    this.cpus.pop();
  }
}
