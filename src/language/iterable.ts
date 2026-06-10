/** Yields each array item in order as an async iterable. */
async function* fromArray<ITEM>(items: Array<ITEM>): AsyncGenerator<ITEM> {
  for (const item of items) {
    yield item;
  }
}

/**
 * Operations for building, draining, and converting async iterables in tests.
 *
 * The complement to `Stream`: where `Stream` works with `ReadableStream`s, `Iterable` works with
 * `AsyncIterable`s (async generators and anything consumed via `for await`). Cross over to the full
 * `Stream` toolbox with `Iterable.toStream`.
 */
export const Iterable = {
  /** Builds an `AsyncIterable` that yields each item in order, e.g. to feed code that consumes one. */
  from: <ITEM>(items: Array<ITEM>): AsyncIterable<ITEM> => fromArray(items),

  /** Reads an async iterable to completion and returns every item it yielded. */
  toArray: async <ITEM>(iterable: AsyncIterable<ITEM>): Promise<Array<ITEM>> => {
    const items: Array<ITEM> = [];
    for await (const item of iterable) {
      items.push(item);
    }
    return items;
  },

  /** Converts an async iterable into a `ReadableStream`, e.g. to feed a `ReadableStream`-consuming API. */
  toStream: <ITEM>(iterable: AsyncIterable<ITEM>): ReadableStream<ITEM> => {
    const iterator = iterable[Symbol.asyncIterator]();
    let cancelled = false;

    return new ReadableStream<ITEM>({
      async pull(controller) {
        if (cancelled) return;
        try {
          const { value, done } = await iterator.next();
          if (done) {
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        cancelled = true;
        try {
          await iterator.return?.(reason);
        } catch {
          /** ignore errors raised while cancelling */
        }
      },
    });
  },
};
