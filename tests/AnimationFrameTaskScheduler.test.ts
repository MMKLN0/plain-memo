import test from "node:test";
import assert from "node:assert/strict";

import { AnimationFrameTaskScheduler } from "../src/ui/AnimationFrameTaskScheduler";

class FakeAnimationFrameWindow {
	private nextId = 1;
	readonly callbacks = new Map<number, FrameRequestCallback>();

	requestAnimationFrame(callback: FrameRequestCallback): number {
		const id = this.nextId;
		this.nextId += 1;
		this.callbacks.set(id, callback);
		return id;
	}

	cancelAnimationFrame(handle: number): void {
		this.callbacks.delete(handle);
	}

	runFrame(): void {
		const callbacks = [...this.callbacks.values()];
		this.callbacks.clear();
		for (const callback of callbacks) {
			callback(0);
		}
	}
}

test("coalesces repeated container resize requests into one frame", () => {
	const win = new FakeAnimationFrameWindow();
	let syncCount = 0;
	const scheduler = new AnimationFrameTaskScheduler(() => win, () => {
		syncCount += 1;
	});

	scheduler.schedule();
	scheduler.schedule();
	scheduler.schedule();

	assert.equal(win.callbacks.size, 1);
	win.runFrame();
	assert.equal(syncCount, 1);
});

test("cancels a queued container resize sync when the view closes", () => {
	const win = new FakeAnimationFrameWindow();
	let syncCount = 0;
	const scheduler = new AnimationFrameTaskScheduler(() => win, () => {
		syncCount += 1;
	});

	scheduler.schedule();
	scheduler.cancel();
	win.runFrame();

	assert.equal(syncCount, 0);
});
