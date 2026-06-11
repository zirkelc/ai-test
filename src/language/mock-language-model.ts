import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { type Mock, vi } from 'vitest';
import { defaultFinishReason, defaultUsage, toFinishReason } from '../internal/defaults.js';
import { Content } from './content.js';
import { simulateStream, type StreamDelayOptions } from './stream.js';
import { StreamParts } from './stream-parts.js';

/** A (possibly partial) non-streaming result; only `content` is required, the rest defaults. */
type GenerateResultInput = Omit<Partial<LanguageModelV3GenerateResult>, 'finishReason'> & {
  content: Array<LanguageModelV3Content>;
  /** The finish reason, as a full object or a bare unified value (e.g. `'length'`). */
  finishReason?: LanguageModelV3FinishReason | LanguageModelV3FinishReason['unified'];
};

/**
 * How to respond to a `doGenerate` call. A function receives the call options and returns the generate
 * result directly — the escape hatch for input-dependent responses.
 */
export type GenerateResponse = string | Error | GenerateResultInput | LanguageModelV3['doGenerate'];

/**
 * How to respond to a `doStream` call. A bare array (or `ReadableStream`) streams without delay; the
 * `{ chunks, ... }` form adds delays and abort handling. A function receives the call options and
 * returns the stream result directly — the escape hatch for input-dependent streams or a fully custom
 * `LanguageModelV3StreamResult` (e.g. one carrying response metadata).
 */
export type StreamResponse =
  | string
  | Error
  | Array<LanguageModelV3StreamPart>
  | ReadableStream<LanguageModelV3StreamPart>
  | ({ chunks: Array<LanguageModelV3StreamPart> } & StreamDelayOptions)
  | LanguageModelV3['doStream'];

/**
 * A single mock response. A `string` or `Error` applies to whichever method is called;
 * the object forms target one method explicitly.
 *
 * Note: `string` and `{ content }` describe the output for both methods — when streamed, a stream is
 * derived from the content. To sequence responses across calls, pass an `Array<MockResponse>` at the
 * top level. Because of that, a raw stream is expressed via the `stream` form (`{ stream: [...] }`),
 * never a bare array.
 */
export type MockResponse =
  | string
  | Error
  | GenerateResultInput
  | { generate?: GenerateResponse; stream?: StreamResponse };

/** Optional identity overrides for a mock model. */
export type MockLanguageModelOptions = {
  /** The provider id; defaults to `mock-provider`. */
  provider?: string;
  /** The model id; defaults to an auto-incrementing `mock-model-{n}`. */
  modelId?: string;
};

/** Monotonic counter backing the auto-generated model ids. */
let modelCounter = 0;
/** Returns the next unique auto-generated model id. */
const nextModelId = (): string => {
  modelCounter += 1;
  return `mock-model-${modelCounter}`;
};

/** Throws a clear error when a method is called but no matching response was configured. */
const notImplemented = (method: 'doGenerate' | 'doStream'): never => {
  throw new Error(`MockLanguageModel.${method} was called but no matching response was provided.`);
};

/** Narrows a response to the explicit `{ generate, stream }` form. */
const isExplicit = (response: MockResponse): response is { generate?: GenerateResponse; stream?: StreamResponse } =>
  typeof response === 'object' &&
  response !== null &&
  !(response instanceof Error) &&
  ('generate' in response || 'stream' in response);

/** Expands a single content part into the stream parts that represent it. */
const partToStreamParts = (part: LanguageModelV3Content, id: string): Array<LanguageModelV3StreamPart> => {
  if (part.type === 'text') return StreamParts.text(part.text, { id });
  if (part.type === 'reasoning') return StreamParts.reasoning(part.text, { id });
  return [part];
};

/** Derives a stream from content parts: `stream-start` → one block per part → `finish`. */
const contentToStream = (
  content: Array<LanguageModelV3Content>,
  finishReason?: LanguageModelV3FinishReason | LanguageModelV3FinishReason['unified'],
  usage?: LanguageModelV3Usage,
): Array<LanguageModelV3StreamPart> => [
  StreamParts.streamStart(),
  ...content.flatMap((part, index) => partToStreamParts(part, String(index))),
  StreamParts.finish({ finishReason, usage }),
];

/** The streamed form of a string is the streamed form of a single text content part. */
const textToStream = (text: string): Array<LanguageModelV3StreamPart> => contentToStream([Content.text(text)]);

/** Fills a partial generate result with default finish reason, usage, and warnings; coerces a string finish reason. */
const buildGenerateResult = (input: GenerateResultInput): LanguageModelV3GenerateResult => {
  const { finishReason, ...rest } = input;
  return {
    finishReason: finishReason === undefined ? defaultFinishReason : toFinishReason(finishReason),
    usage: defaultUsage,
    warnings: [],
    ...rest,
  };
};

/** Wraps stream parts into a stream result, with optional simulated delays and abort handling. */
const buildStreamResult = (
  chunks: Array<LanguageModelV3StreamPart>,
  opts: StreamDelayOptions = {},
): LanguageModelV3StreamResult => ({
  stream: simulateStream(chunks, opts),
});

/** Resolves the `generate` form of an explicit response into a generate result. */
const resolveGenerateResponse = async (
  response: GenerateResponse,
  options: LanguageModelV3CallOptions,
): Promise<LanguageModelV3GenerateResult> => {
  if (typeof response === 'string') return buildGenerateResult({ content: [Content.text(response)] });
  if (response instanceof Error) throw response;
  if (typeof response === 'function') return response(options);
  return buildGenerateResult(response);
};

/** Resolves the `stream` form of an explicit response into a stream result. */
const resolveStreamResponse = async (
  response: StreamResponse,
  options: LanguageModelV3CallOptions,
): Promise<LanguageModelV3StreamResult> => {
  const { abortSignal } = options;
  if (typeof response === 'string') return buildStreamResult(textToStream(response), { abortSignal });
  if (response instanceof Error) throw response;
  if (Array.isArray(response)) return buildStreamResult(response, { abortSignal });
  if (response instanceof ReadableStream) return { stream: response };
  if (typeof response === 'function') return response(options);
  return buildStreamResult(response.chunks, {
    initialDelayInMs: response.initialDelayInMs,
    chunkDelayInMs: response.chunkDelayInMs,
    abortSignal: response.abortSignal ?? abortSignal,
  });
};

/** Resolves a top-level response for a `doGenerate` call. */
const resolveGenerate = async (
  response: MockResponse,
  options: LanguageModelV3CallOptions,
): Promise<LanguageModelV3GenerateResult> => {
  if (typeof response === 'string') return buildGenerateResult({ content: [Content.text(response)] });
  if (response instanceof Error) throw response;
  if (isExplicit(response)) {
    return response.generate === undefined
      ? notImplemented('doGenerate')
      : resolveGenerateResponse(response.generate, options);
  }
  if ('content' in response) return buildGenerateResult(response);
  return notImplemented('doGenerate');
};

/** Resolves a top-level response for a `doStream` call. */
const resolveStream = async (
  response: MockResponse,
  options: LanguageModelV3CallOptions,
): Promise<LanguageModelV3StreamResult> => {
  const { abortSignal } = options;
  if (typeof response === 'string') return buildStreamResult(textToStream(response), { abortSignal });
  if (response instanceof Error) throw response;
  if (isExplicit(response)) {
    return response.stream === undefined ? notImplemented('doStream') : resolveStreamResponse(response.stream, options);
  }
  if ('content' in response) {
    return buildStreamResult(contentToStream(response.content, response.finishReason, response.usage), { abortSignal });
  }
  return notImplemented('doStream');
};

/** Picks the response for the current call: a single response repeats, an array advances and clamps. */
const pickResponse = (input: MockResponse | Array<MockResponse>, callIndex: number): MockResponse => {
  if (!Array.isArray(input)) return input;
  if (input.length === 0) return {};
  return input[Math.min(callIndex, input.length - 1)] ?? {};
};

/**
 * A `LanguageModelV3` mock whose `doGenerate`/`doStream` are `vi.fn()` spies. Each call is also
 * recorded on `doGenerateCalls`/`doStreamCalls` so call arguments can be inspected without vitest.
 * Instances are created via the {@link MockLanguageModel} factory.
 */
class LanguageModelMock implements LanguageModelV3 {
  /** The language model spec version this mock implements. */
  readonly specificationVersion = 'v3';
  /** URL patterns the model supports — none, for a mock. */
  readonly supportedUrls: LanguageModelV3['supportedUrls'] = {};
  /** The provider id. */
  readonly provider: string;
  /** The model id. */
  readonly modelId: string;

  /** Spy implementing `doGenerate`, resolving the configured response. */
  doGenerate: Mock<LanguageModelV3['doGenerate']>;
  /** Spy implementing `doStream`, resolving the configured response. */
  doStream: Mock<LanguageModelV3['doStream']>;

  /** Call options captured for every `doGenerate` invocation, in order. */
  doGenerateCalls: Array<LanguageModelV3CallOptions> = [];
  /** Call options captured for every `doStream` invocation, in order. */
  doStreamCalls: Array<LanguageModelV3CallOptions> = [];

  /** Builds the spies and identity from the configured response(s) and options. */
  constructor(input: MockResponse | Array<MockResponse> = {}, options: MockLanguageModelOptions = {}) {
    this.provider = options.provider ?? 'mock-provider';
    this.modelId = options.modelId ?? nextModelId();

    this.doGenerate = vi.fn(async (callOptions: LanguageModelV3CallOptions) => {
      const response = pickResponse(input, this.doGenerateCalls.length);
      this.doGenerateCalls.push(callOptions);
      return resolveGenerate(response, callOptions);
    });

    this.doStream = vi.fn(async (callOptions: LanguageModelV3CallOptions) => {
      const response = pickResponse(input, this.doStreamCalls.length);
      this.doStreamCalls.push(callOptions);
      return resolveStream(response, callOptions);
    });
  }
}

/** Builds the content array for a generate result: a string becomes one text part; an array passes through. */
const content = (input: string | Array<LanguageModelV3Content>): Array<LanguageModelV3Content> =>
  typeof input === 'string' ? [Content.text(input)] : input;

/** Builds a full generate result, filling finish reason, usage, and warnings. */
const generateResult = (input: string | GenerateResultInput): LanguageModelV3GenerateResult =>
  buildGenerateResult(typeof input === 'string' ? { content: [Content.text(input)] } : input);

/** Builds a full stream result; a string is assembled into `stream-start` → text → `finish`. */
const streamResult = (
  input: string | Array<LanguageModelV3StreamPart> | ReadableStream<LanguageModelV3StreamPart>,
  opts: StreamDelayOptions = {},
): LanguageModelV3StreamResult => {
  if (input instanceof ReadableStream) return { stream: input };
  return buildStreamResult(typeof input === 'string' ? textToStream(input) : input, opts);
};

/** Builds a usage object, overriding individual token fields on top of the defaults. */
const usage = (
  overrides: {
    inputTokens?: Partial<LanguageModelV3Usage['inputTokens']>;
    outputTokens?: Partial<LanguageModelV3Usage['outputTokens']>;
  } = {},
): LanguageModelV3Usage => ({
  inputTokens: { ...defaultUsage.inputTokens, ...overrides.inputTokens },
  outputTokens: { ...defaultUsage.outputTokens, ...overrides.outputTokens },
});

/** Builds a finish reason from its unified value (raw mirrors it). */
const finishReason = (unified: LanguageModelV3FinishReason['unified'] = 'stop'): LanguageModelV3FinishReason =>
  toFinishReason(unified);

/** Creates a mock `LanguageModelV3` from a response spec (or sequence of them). */
const from = (input?: MockResponse | Array<MockResponse>, options?: MockLanguageModelOptions): LanguageModelMock =>
  new LanguageModelMock(input ?? {}, options);

/**
 * Namespace for building mock language models. `from` creates a mock `LanguageModelV3`; the other
 * builders assemble the values a model returns. Exported as both a value (the namespace) and a type
 * (the model instance).
 *
 * @example
 * const model = MockLanguageModel.from('Hello, world!');
 * const flaky = MockLanguageModel.from([new Error('rate limited'), 'recovered']);
 * const built = MockLanguageModel.from({ content: MockLanguageModel.content('Hi') });
 */
export const MockLanguageModel = { from, content, generateResult, streamResult, usage, finishReason };

/** A mock language model instance, as returned by {@link MockLanguageModel.from}. */
export type MockLanguageModel = LanguageModelMock;
