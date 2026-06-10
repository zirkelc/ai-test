import type { LanguageModelV3FinishReason, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { convertArrayToReadableStream, convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';

/** Simulated timing for a stream. Shared by `Stream.simulate`, `MockLanguageModel.streamResult`, and the `stream` chunks form. */
export type StreamDelayOptions = {
  /** Delay before the first part is emitted; `null` skips the delay. Defaults to `0`. */
  initialDelayInMs?: number | null;
  /** Delay between each subsequent part; `null` skips the delay. Defaults to `0`. */
  chunkDelayInMs?: number | null;
  /** When provided, the stream errors with an `AbortError` the instant the signal fires. */
  abortSignal?: AbortSignal;
};

/** The error a real provider stream rejects with when its request is aborted. */
const abortError = (): DOMException => new DOMException('The user aborted a request.', 'AbortError');

/** Waits `ms` (`null` resolves at once), resolving early if the signal aborts so the caller can react immediately. */
const delay = (ms: number | null, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve) => {
    if (ms == null) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Builds a delayed `ReadableStream`, a port of the AI SDK's `simulateReadableStream` (delay before each
 * part, `null` to skip) extended with abort handling: when an `abortSignal` fires it errors with an
 * `AbortError` at once (even mid-delay), matching a real provider stream. Inert without a signal.
 */
export const simulateStream = <PART>(chunks: Array<PART>, opts: StreamDelayOptions = {}): ReadableStream<PART> => {
  const { abortSignal, initialDelayInMs = 0, chunkDelayInMs = 0 } = opts;
  let index = 0;
  return new ReadableStream<PART>({
    async pull(controller) {
      if (abortSignal?.aborted) {
        controller.error(abortError());
        return;
      }
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      await delay(index === 0 ? initialDelayInMs : chunkDelayInMs, abortSignal);
      if (abortSignal?.aborted) {
        controller.error(abortError());
        return;
      }
      controller.enqueue(chunks[index]!);
      index += 1;
    },
  });
};

/** Operations for building, draining, and inspecting language model streams in tests. */
export const Stream = {
  /** Builds a `ReadableStream` from an array of parts. */
  from: <PART>(parts: Array<PART>): ReadableStream<PART> => convertArrayToReadableStream(parts),

  /** Builds a `ReadableStream` that emits parts with optional delays, for timing tests. */
  simulate: <PART>(chunks: Array<PART>, opts: StreamDelayOptions = {}): ReadableStream<PART> =>
    simulateStream(chunks, opts),

  /** Reads a stream to completion and returns every part it emitted. */
  toArray: <PART>(stream: ReadableStream<PART>): Promise<Array<PART>> => convertReadableStreamToArray(stream),

  /** Joins the `text-delta` parts of a stream-part sequence into the full text. */
  text: (parts: Array<LanguageModelV3StreamPart>): string =>
    parts
      .filter((part): part is Extract<LanguageModelV3StreamPart, { type: 'text-delta' }> => part.type === 'text-delta')
      .map((part) => part.delta)
      .join(''),

  /** Returns the finish reason from a stream-part sequence, if a `finish` part is present. */
  finishReason: (parts: Array<LanguageModelV3StreamPart>): LanguageModelV3FinishReason | undefined =>
    parts.find((part): part is Extract<LanguageModelV3StreamPart, { type: 'finish' }> => part.type === 'finish')
      ?.finishReason,
};
