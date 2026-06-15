import { describe, expect, test } from 'vitest';
import { StreamParts } from './language/stream-parts.js';
import { Streams } from './stream.js';

describe('Streams', () => {
  test('from() and toArray() should round-trip parts', async () => {
    // Arrange
    const parts = StreamParts.text('round');

    // Act
    const roundTripped = await Streams.toArray(Streams.from(parts));

    // Assert
    expect(roundTripped).toEqual(parts);
  });

  test('simulate() should drain to the provided chunks', async () => {
    // Arrange
    const parts = StreamParts.text('sim');

    // Act
    const drained = await Streams.toArray(Streams.simulate(parts));

    // Assert
    expect(drained).toEqual(parts);
  });

  test('toIterable() should make a stream consumable via for-await', async () => {
    // Arrange
    const stream = Streams.from(['a', 'b', 'c']);

    // Act
    const collected: Array<string> = [];
    for await (const item of Streams.toIterable(stream)) {
      collected.push(item);
    }

    // Assert
    expect(collected).toEqual(['a', 'b', 'c']);
  });

  test('toIterable() should stop reading the source when the loop breaks early', async () => {
    // Arrange
    const stream = Streams.from(['a', 'b', 'c']);

    // Act
    const collected: Array<string> = [];
    for await (const item of Streams.toIterable(stream)) {
      collected.push(item);
      break;
    }

    // Assert
    expect(collected).toEqual(['a']);
  });

  test('simulate() should error with an AbortError when the signal is already aborted', async () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();
    const stream = Streams.simulate(StreamParts.text('nope'), { abortSignal: controller.signal });

    // Act
    const error = await Streams.toArray(stream).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });

  test('simulate() should error the instant the signal fires mid-stream', async () => {
    // Arrange
    const controller = new AbortController();
    const parts = [...StreamParts.text('Hello World'), StreamParts.finish()];
    const stream = Streams.simulate(parts, { chunkDelayInMs: 10, abortSignal: controller.signal });
    const reader = stream.getReader();

    // Act
    const first = await reader.read();
    controller.abort();
    const error = await reader.read().catch((e: unknown) => e);

    // Assert
    expect(first.value).toEqual(parts[0]);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });
});
