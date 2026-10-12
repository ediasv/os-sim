export class Task {
  private static taskCounter = 0;

  private activationCounter = 0;
  private currentCpuId: string | null = null;

  constructor(
    private readonly id: number = Task.taskCounter++,
    private readonly entryTime: number = 0,
    private readonly length: number = 1,
    private readonly period: number = 0,
    private readonly due: number = 10,
    private readonly color: string = "red",
  ) {}
}
