interface AnimationFrameWindow {
	requestAnimationFrame(callback: FrameRequestCallback): number;
	cancelAnimationFrame(handle: number): void;
}

/** Coalesces layout-sensitive work into one animation frame. */
export class AnimationFrameTaskScheduler {
	private frameId: number | null = null;

	constructor(
		private readonly getWindow: () => AnimationFrameWindow,
		private readonly task: () => void,
	) {}

	/** Queues the task once so observers do not synchronously mutate layout. */
	schedule(): void {
		if (this.frameId !== null) {
			return;
		}
		const win = this.getWindow();
		this.frameId = win.requestAnimationFrame(() => {
			this.frameId = null;
			this.task();
		});
	}

	/** Cancels an outstanding frame when the owning view is closing. */
	cancel(): void {
		if (this.frameId === null) {
			return;
		}
		this.getWindow().cancelAnimationFrame(this.frameId);
		this.frameId = null;
	}
}
