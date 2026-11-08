export class IslandMap {
  constructor(root: HTMLElement);
  show(course: { id: string; mapSeed: number }, progress: Record<string, { done: number; total: number }>, onPick: (topicId: string) => void): void;
  hide(): void;
  setSelected(topicId: string): void;
  layout(): void;
}
