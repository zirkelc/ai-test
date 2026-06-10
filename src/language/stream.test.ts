import { describe, expect, test } from 'vitest';
import { Stream } from './stream.js';
import { StreamParts } from './stream-parts.js';

describe('Stream', () => {
  test('text() should join text-delta parts', () => {
    // Arrange
    const parts = StreamParts.text('Hello World');

    // Act
    const text = Stream.text(parts);

    // Assert
    expect(text).toBe('Hello World');
  });

  test('finishReason() should read the finish part', () => {
    // Arrange
    const parts = [...StreamParts.text('hi'), StreamParts.finish({ finishReason: 'length' })];

    // Act
    const reason = Stream.finishReason(parts);

    // Assert
    expect(reason).toEqual({ unified: 'length', raw: 'length' });
  });

  test('finishReason() should be undefined without a finish part', () => {
    // Act
    const reason = Stream.finishReason(StreamParts.text('hi'));

    // Assert
    expect(reason).toBe(undefined);
  });

  test('from() and toArray() should round-trip parts', async () => {
    // Arrange
    const parts = StreamParts.text('round');

    // Act
    const roundTripped = await Stream.toArray(Stream.from(parts));

    // Assert
    expect(roundTripped).toEqual(parts);
  });

  test('simulate() should drain to the provided chunks', async () => {
    // Arrange
    const parts = StreamParts.text('sim');

    // Act
    const drained = await Stream.toArray(Stream.simulate(parts));

    // Assert
    expect(drained).toEqual(parts);
  });

  test('simulate() should error with an AbortError when the signal is already aborted', async () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();
    const stream = Stream.simulate(StreamParts.text('nope'), { abortSignal: controller.signal });

    // Act
    const error = await Stream.toArray(stream).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });

  test('simulate() should error the instant the signal fires mid-stream', async () => {
    // Arrange
    const controller = new AbortController();
    const parts = [...StreamParts.text('Hello World'), StreamParts.finish()];
    const stream = Stream.simulate(parts, { chunkDelayInMs: 10, abortSignal: controller.signal });
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
