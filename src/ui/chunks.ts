import type { UIDataTypes, UIMessageChunk } from 'ai';
import { toJSONString } from '../internal/json.js';
import { tokenize } from '../internal/tokenize.js';

/** A single chunk variant selected from the union by its `type` tag. */
type ChunkOf<METADATA, DATA extends UIDataTypes, TYPE extends string> = Extract<
  UIMessageChunk<METADATA, DATA>,
  { type: TYPE }
>;

/** The fields of a chunk variant without its `type` tag, used as a builder's argument shape. */
type ChunkArgs<METADATA, DATA extends UIDataTypes, TYPE extends string> = Omit<ChunkOf<METADATA, DATA, TYPE>, 'type'>;

/** Options for the streamed text/reasoning block builders: a stable id plus a tokenization strategy. */
export type UIChunkBlockOptions = {
  /** Stable id shared by the start/delta/end chunks. */
  id?: string;
  /** Split the text into fixed-size slices of at most this many characters. */
  length?: number;
  /** Split the text on this delimiter, re-appending it to each token. */
  separator?: string;
};

/**
 * Builds the {@link UIChunks} namespace bound to a message's `METADATA` and `DATA` types. The runtime
 * is identical for every binding; the type parameters only sharpen `data`, `start`, `finish`, and
 * `messageMetadata`. Use the top-level {@link UIChunks} for the loose default, or `fromUIMessage` to bind.
 */
export const createUIChunks = <METADATA = unknown, DATA extends UIDataTypes = UIDataTypes>() => ({
  /** A `text-start` chunk opening a text block. */
  textStart: (args: ChunkArgs<METADATA, DATA, 'text-start'>): ChunkOf<METADATA, DATA, 'text-start'> =>
    ({ type: 'text-start', ...args }) as ChunkOf<METADATA, DATA, 'text-start'>,

  /** A `text-delta` chunk carrying a slice of streamed text. */
  textDelta: (args: ChunkArgs<METADATA, DATA, 'text-delta'>): ChunkOf<METADATA, DATA, 'text-delta'> =>
    ({ type: 'text-delta', ...args }) as ChunkOf<METADATA, DATA, 'text-delta'>,

  /** A `text-end` chunk closing a text block. */
  textEnd: (args: ChunkArgs<METADATA, DATA, 'text-end'>): ChunkOf<METADATA, DATA, 'text-end'> =>
    ({ type: 'text-end', ...args }) as ChunkOf<METADATA, DATA, 'text-end'>,

  /** A `reasoning-start` chunk opening a reasoning block. */
  reasoningStart: (args: ChunkArgs<METADATA, DATA, 'reasoning-start'>): ChunkOf<METADATA, DATA, 'reasoning-start'> =>
    ({ type: 'reasoning-start', ...args }) as ChunkOf<METADATA, DATA, 'reasoning-start'>,

  /** A `reasoning-delta` chunk carrying a slice of streamed reasoning. */
  reasoningDelta: (args: ChunkArgs<METADATA, DATA, 'reasoning-delta'>): ChunkOf<METADATA, DATA, 'reasoning-delta'> =>
    ({ type: 'reasoning-delta', ...args }) as ChunkOf<METADATA, DATA, 'reasoning-delta'>,

  /** A `reasoning-end` chunk closing a reasoning block. */
  reasoningEnd: (args: ChunkArgs<METADATA, DATA, 'reasoning-end'>): ChunkOf<METADATA, DATA, 'reasoning-end'> =>
    ({ type: 'reasoning-end', ...args }) as ChunkOf<METADATA, DATA, 'reasoning-end'>,

  /** An `error` chunk carrying an error message. */
  error: (errorText: string): ChunkOf<METADATA, DATA, 'error'> =>
    ({ type: 'error', errorText }) as ChunkOf<METADATA, DATA, 'error'>,

  /** A `tool-input-start` chunk opening a streamed tool input. */
  toolInputStart: (args: ChunkArgs<METADATA, DATA, 'tool-input-start'>): ChunkOf<METADATA, DATA, 'tool-input-start'> =>
    ({ type: 'tool-input-start', ...args }) as ChunkOf<METADATA, DATA, 'tool-input-start'>,

  /** A `tool-input-delta` chunk carrying a slice of the streamed tool input. */
  toolInputDelta: (args: ChunkArgs<METADATA, DATA, 'tool-input-delta'>): ChunkOf<METADATA, DATA, 'tool-input-delta'> =>
    ({ type: 'tool-input-delta', ...args }) as ChunkOf<METADATA, DATA, 'tool-input-delta'>,

  /** A `tool-input-available` chunk carrying the completed tool input. */
  toolInputAvailable: (
    args: ChunkArgs<METADATA, DATA, 'tool-input-available'>,
  ): ChunkOf<METADATA, DATA, 'tool-input-available'> =>
    ({ type: 'tool-input-available', ...args }) as ChunkOf<METADATA, DATA, 'tool-input-available'>,

  /** A `tool-input-error` chunk reporting a failed tool input. */
  toolInputError: (args: ChunkArgs<METADATA, DATA, 'tool-input-error'>): ChunkOf<METADATA, DATA, 'tool-input-error'> =>
    ({ type: 'tool-input-error', ...args }) as ChunkOf<METADATA, DATA, 'tool-input-error'>,

  /** A `tool-approval-request` chunk asking the user to approve a tool call. */
  toolApprovalRequest: (
    args: ChunkArgs<METADATA, DATA, 'tool-approval-request'>,
  ): ChunkOf<METADATA, DATA, 'tool-approval-request'> =>
    ({ type: 'tool-approval-request', ...args }) as ChunkOf<METADATA, DATA, 'tool-approval-request'>,

  /** A `tool-output-available` chunk carrying a tool result. */
  toolOutputAvailable: (
    args: ChunkArgs<METADATA, DATA, 'tool-output-available'>,
  ): ChunkOf<METADATA, DATA, 'tool-output-available'> =>
    ({ type: 'tool-output-available', ...args }) as ChunkOf<METADATA, DATA, 'tool-output-available'>,

  /** A `tool-output-error` chunk reporting a failed tool execution. */
  toolOutputError: (
    args: ChunkArgs<METADATA, DATA, 'tool-output-error'>,
  ): ChunkOf<METADATA, DATA, 'tool-output-error'> =>
    ({ type: 'tool-output-error', ...args }) as ChunkOf<METADATA, DATA, 'tool-output-error'>,

  /** A `tool-output-denied` chunk marking a denied tool call. */
  toolOutputDenied: (
    args: ChunkArgs<METADATA, DATA, 'tool-output-denied'>,
  ): ChunkOf<METADATA, DATA, 'tool-output-denied'> =>
    ({ type: 'tool-output-denied', ...args }) as ChunkOf<METADATA, DATA, 'tool-output-denied'>,

  /** A `source-url` chunk referencing a URL source. */
  sourceUrl: (args: ChunkArgs<METADATA, DATA, 'source-url'>): ChunkOf<METADATA, DATA, 'source-url'> =>
    ({ type: 'source-url', ...args }) as ChunkOf<METADATA, DATA, 'source-url'>,

  /** A `source-document` chunk referencing a document source. */
  sourceDocument: (args: ChunkArgs<METADATA, DATA, 'source-document'>): ChunkOf<METADATA, DATA, 'source-document'> =>
    ({ type: 'source-document', ...args }) as ChunkOf<METADATA, DATA, 'source-document'>,

  /** A `file` chunk referencing a file by URL. */
  file: (args: ChunkArgs<METADATA, DATA, 'file'>): ChunkOf<METADATA, DATA, 'file'> =>
    ({ type: 'file', ...args }) as ChunkOf<METADATA, DATA, 'file'>,

  /** A `data-${name}` chunk carrying a typed custom data payload. */
  data: <NAME extends keyof DATA & string>(
    name: NAME,
    data: DATA[NAME],
    opts: { id?: string; transient?: boolean } = {},
  ): ChunkOf<METADATA, DATA, `data-${NAME}`> =>
    ({ type: `data-${name}`, data, ...opts }) as unknown as ChunkOf<METADATA, DATA, `data-${NAME}`>,

  /** A `start-step` chunk marking the beginning of a step. */
  startStep: (): ChunkOf<METADATA, DATA, 'start-step'> =>
    ({ type: 'start-step' }) as ChunkOf<METADATA, DATA, 'start-step'>,

  /** A `finish-step` chunk marking the end of a step. */
  finishStep: (): ChunkOf<METADATA, DATA, 'finish-step'> =>
    ({ type: 'finish-step' }) as ChunkOf<METADATA, DATA, 'finish-step'>,

  /** A `start` chunk opening a message stream, optionally carrying id and metadata. */
  start: (args?: ChunkArgs<METADATA, DATA, 'start'>): ChunkOf<METADATA, DATA, 'start'> =>
    ({ type: 'start', ...args }) as ChunkOf<METADATA, DATA, 'start'>,

  /** A `finish` chunk closing a message stream, optionally carrying finish reason and metadata. */
  finish: (args?: ChunkArgs<METADATA, DATA, 'finish'>): ChunkOf<METADATA, DATA, 'finish'> =>
    ({ type: 'finish', ...args }) as ChunkOf<METADATA, DATA, 'finish'>,

  /** An `abort` chunk marking an aborted stream. */
  abort: (args?: ChunkArgs<METADATA, DATA, 'abort'>): ChunkOf<METADATA, DATA, 'abort'> =>
    ({ type: 'abort', ...args }) as ChunkOf<METADATA, DATA, 'abort'>,

  /** A `message-metadata` chunk carrying typed message metadata. */
  messageMetadata: (messageMetadata: METADATA): ChunkOf<METADATA, DATA, 'message-metadata'> =>
    ({ type: 'message-metadata', messageMetadata }) as ChunkOf<METADATA, DATA, 'message-metadata'>,

  /** A text block: `text-start` → `text-delta`* → `text-end`, so blocks compose by concatenation. */
  text: (
    text: string,
    { id = '1', length, separator }: UIChunkBlockOptions = {},
  ): Array<UIMessageChunk<METADATA, DATA>> => [
    { type: 'text-start', id },
    ...tokenize(text, { length, separator }).map(
      (delta): UIMessageChunk<METADATA, DATA> => ({ type: 'text-delta', id, delta }),
    ),
    { type: 'text-end', id },
  ],

  /** A reasoning block: `reasoning-start` → `reasoning-delta`* → `reasoning-end`. */
  reasoning: (
    text: string,
    { id = '1', length, separator }: UIChunkBlockOptions = {},
  ): Array<UIMessageChunk<METADATA, DATA>> => [
    { type: 'reasoning-start', id },
    ...tokenize(text, { length, separator }).map(
      (delta): UIMessageChunk<METADATA, DATA> => ({ type: 'reasoning-delta', id, delta }),
    ),
    { type: 'reasoning-end', id },
  ],

  /** A streamed tool input block: `tool-input-start` → `tool-input-delta`* → `tool-input-available`. */
  toolInput: (args: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    length?: number;
  }): Array<UIMessageChunk<METADATA, DATA>> => [
    { type: 'tool-input-start', toolCallId: args.toolCallId, toolName: args.toolName },
    ...tokenize(toJSONString(args.input), { length: args.length }).map(
      (inputTextDelta): UIMessageChunk<METADATA, DATA> => ({
        type: 'tool-input-delta',
        toolCallId: args.toolCallId,
        inputTextDelta,
      }),
    ),
    { type: 'tool-input-available', toolCallId: args.toolCallId, toolName: args.toolName, input: args.input },
  ],
});

/** Builders for `UIMessageChunk`s, with loose default types. Use `fromUIMessage` to bind to a message type. */
export const UIChunks = createUIChunks();
