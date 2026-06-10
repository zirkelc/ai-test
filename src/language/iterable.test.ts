import { describe, expect, test } from 'vitest';
import { Iterable } from './iterable.js';
import { Stream } from './stream.js';

describe('Iterable', () => {
  test('from() and toArray() should round-trip items', async () => {
    // Arrange
    const items = [1, 2, 3];

    // Act
    const roundTripped = await Iterable.toArray(Iterable.from(items));

    // Assert
    expect(roundTripped).toEqual(items);
  });

  test('toArray() should drain an async generator', async () => {
    // Arrange
    async function* generate(): AsyncGenerator<string> {
      yield 'a';
      yield 'b';
    }

    // Act
    const items = await Iterable.toArray(generate());

    // Assert
    expect(items).toEqual(['a', 'b']);
  });

  test('toStream() should convert an async iterable into a drainable ReadableStream', async () => {
    // Arrange
    const iterable = Iterable.from(['x', 'y']);

    // Act
    const stream = Iterable.toStream(iterable);
    const items = await Stream.toArray(stream);

    // Assert
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(items).toEqual(['x', 'y']);
  });

  test('toStream() should surface an error thrown by the iterable', async () => {
    // Arrange
    async function* failing(): AsyncGenerator<number> {
      yield 1;
      throw new Error('boom');
    }

    // Act
    const result = Stream.toArray(Iterable.toStream(failing()));

    // Assert
    await expect(result).rejects.toThrow();
  });
});
