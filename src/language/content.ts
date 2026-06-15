import type {
  LanguageModelV3File,
  LanguageModelV3Reasoning,
  LanguageModelV3Source,
  LanguageModelV3Text,
  LanguageModelV3ToolCall,
  LanguageModelV3ToolResult,
} from '@ai-sdk/provider';
import { toJSONString } from '../internal/json.js';

/** Builders for the static content parts a language model returns from `doGenerate`. */
export const ContentParts = {
  /** A text part. */
  text: (text: string): LanguageModelV3Text => ({ type: 'text', text }),

  /** A reasoning part. */
  reasoning: (text: string): LanguageModelV3Reasoning => ({ type: 'reasoning', text }),

  /** A tool call. `input` is stringified to JSON unless already a string. */
  toolCall: (args: { toolCallId: string; toolName: string; input: unknown }): LanguageModelV3ToolCall => ({
    type: 'tool-call',
    toolCallId: args.toolCallId,
    toolName: args.toolName,
    input: toJSONString(args.input),
  }),

  /** A tool result. */
  toolResult: (args: {
    toolCallId: string;
    toolName: string;
    result: LanguageModelV3ToolResult['result'];
    isError?: boolean;
  }): LanguageModelV3ToolResult => ({
    type: 'tool-result',
    toolCallId: args.toolCallId,
    toolName: args.toolName,
    result: args.result,
    ...(args.isError !== undefined ? { isError: args.isError } : {}),
  }),

  /** A file part. */
  file: (args: { mediaType: string; data: string | Uint8Array }): LanguageModelV3File => ({
    type: 'file',
    mediaType: args.mediaType,
    data: args.data,
  }),

  /** A URL source part. */
  source: (args: { id: string; url: string; title?: string }): LanguageModelV3Source => ({
    type: 'source',
    sourceType: 'url',
    id: args.id,
    url: args.url,
    ...(args.title !== undefined ? { title: args.title } : {}),
  }),
};
