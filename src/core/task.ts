export class Task {
  private static taskCounter: number = 0;
  private id: number;
  private entryTime: number;
  private length: number;
  private period: number;
  private due: number;
  private activationCounter;

  constructor(
    id: number = Task.taskCounter++,
    entryTime: number = 0,
    length: number = 1,
    period: number = 0,
    due: number = 10,
  ) {
    this.id = id;
    this.entryTime = entryTime;
    this.length = length;
    this.period = period;
    this.due = due;

    this.activationCounter = 0;
  }
}
