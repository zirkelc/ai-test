import { describe, expect, test } from 'vitest';
import { Iterables } from './iterable.js';
import { Streams } from './stream.js';

describe('Iterables', () => {
  test('from() and toArray() should round-trip items', async () => {
    // Arrange
    const items = [1, 2, 3];

    // Act
    const roundTripped = await Iterables.toArray(Iterables.from(items));

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
    const items = await Iterables.toArray(generate());

    // Assert
    expect(items).toEqual(['a', 'b']);
  });

  test('toStream() should convert an async iterable into a drainable ReadableStream', async () => {
    // Arrange
    const iterable = Iterables.from(['x', 'y']);

    // Act
    const stream = Iterables.toStream(iterable);
    const items = await Streams.toArray(stream);

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
    const result = Streams.toArray(Iterables.toStream(failing()));

    // Assert
    await expect(result).rejects.toThrow();
  });
});
