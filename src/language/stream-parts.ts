import type { LanguageModelV3FinishReason, LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider';
import { defaultFinishReason, defaultUsage, toFinishReason } from '../internal/defaults.js';
import { toJSONString } from '../internal/json.js';
import { tokenize } from '../internal/tokenize.js';
import { ContentParts } from './content.js';

/** The `warnings` array carried by a `stream-start` part. */
type StreamStartWarnings = Extract<LanguageModelV3StreamPart, { type: 'stream-start' }>['warnings'];
/** The fields of a `response-metadata` part, without its `type` tag. */
type ResponseMetadata = Omit<Extract<LanguageModelV3StreamPart, { type: 'response-metadata' }>, 'type'>;

/** Options for the streamed-text part builders: a stable part `id` plus a tokenization strategy. */
export type StreamPartOptions = {
  /** Stable id shared by the start/delta/end parts. */
  id?: string;
  /** Split the text into fixed-size slices of at most this many characters. */
  length?: number;
  /** Split the text on this delimiter, re-appending it to each token. */
  separator?: string;
};

/**
 * Builders for individual stream parts emitted by a language model's `doStream`. The text-like
 * builders return a start / delta / end block (without a trailing `finish`) so streams compose by
 * concatenation; control parts (`finish`, `error`, …) are single parts.
 */
export const StreamParts = {
  /** A text block: `text-start` → `text-delta`* → `text-end`. */
  text: (text: string, { id = '1', length, separator }: StreamPartOptions = {}): Array<LanguageModelV3StreamPart> => [
    { type: 'text-start', id },
    ...tokenize(text, { length, separator }).map((delta) => ({ type: 'text-delta' as const, id, delta })),
    { type: 'text-end', id },
  ],

  /** A reasoning block: `reasoning-start` → `reasoning-delta`* → `reasoning-end`. */
  reasoning: (
    text: string,
    { id = '1', length, separator }: StreamPartOptions = {},
  ): Array<LanguageModelV3StreamPart> => [
    { type: 'reasoning-start', id },
    ...tokenize(text, { length, separator }).map((delta) => ({ type: 'reasoning-delta' as const, id, delta })),
    { type: 'reasoning-end', id },
  ],

  /** A streamed tool input: `tool-input-start` → `tool-input-delta`* → `tool-input-end`. */
  toolInput: (args: {
    id: string;
    toolName: string;
    input: unknown;
    length?: number;
  }): Array<LanguageModelV3StreamPart> => [
    { type: 'tool-input-start', id: args.id, toolName: args.toolName },
    ...tokenize(toJSONString(args.input), { length: args.length }).map((delta) => ({
      type: 'tool-input-delta' as const,
      id: args.id,
      delta,
    })),
    { type: 'tool-input-end', id: args.id },
  ],

  /** A completed tool call (same shape as the content part). */
  toolCall: (args: { toolCallId: string; toolName: string; input: unknown }): LanguageModelV3StreamPart =>
    ContentParts.toolCall(args),

  /** A tool result (same shape as the content part). */
  toolResult: (args: {
    toolCallId: string;
    toolName: string;
    result: Parameters<typeof ContentParts.toolResult>[0]['result'];
    isError?: boolean;
  }): LanguageModelV3StreamPart => ContentParts.toolResult(args),

  /** A source part. */
  source: (args: { id: string; url: string; title?: string }): LanguageModelV3StreamPart => ContentParts.source(args),

  /** A file part. */
  file: (args: { mediaType: string; data: string | Uint8Array }): LanguageModelV3StreamPart => ContentParts.file(args),

  /** The terminal `finish` part with usage and finish reason. The finish reason may be a unified string. */
  finish: (
    opts: {
      finishReason?: LanguageModelV3FinishReason | LanguageModelV3FinishReason['unified'];
      usage?: LanguageModelV3Usage;
    } = {},
  ): LanguageModelV3StreamPart => ({
    type: 'finish',
    finishReason: toFinishReason(opts.finishReason ?? defaultFinishReason),
    usage: opts.usage ?? defaultUsage,
  }),

  /** An error part, mirroring a provider failing mid-stream. */
  error: (error: unknown): LanguageModelV3StreamPart => ({ type: 'error', error }),

  /** The opening `stream-start` part carrying call warnings. */
  streamStart: (warnings: StreamStartWarnings = []): LanguageModelV3StreamPart => ({ type: 'stream-start', warnings }),

  /** Provider response metadata (id, timestamp, modelId, …). */
  responseMetadata: (meta: ResponseMetadata = {}): LanguageModelV3StreamPart => ({
    type: 'response-metadata',
    ...meta,
  }),

  /** A raw passthrough part. */
  raw: (rawValue: unknown): LanguageModelV3StreamPart => ({ type: 'raw', rawValue }),
};
