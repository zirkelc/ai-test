import type {
  EmbeddingModelV3,
  EmbeddingModelV3CallOptions,
  EmbeddingModelV3Embedding,
  EmbeddingModelV3Result,
} from '@ai-sdk/provider';
import { type Mock, vi } from 'vitest';
import { defaultProvider, nextModelId } from '../internal/identity.js';

/** A single embedding vector, in the same order as the embedded input values. */
export type EmbeddingVector = EmbeddingModelV3Embedding;

/** A (possibly partial) embed result; only `embeddings` is required, the rest defaults. */
type EmbedResultInput = Partial<EmbeddingModelV3Result> & { embeddings: Array<EmbeddingVector> };

/**
 * How to respond to a `doEmbed` call. A bare `Array<EmbeddingVector>` is the common case (just the
 * embeddings, with default usage). A function receives the call options and returns the result
 * directly — the escape hatch for input-dependent responses.
 */
export type EmbedResponse = Array<EmbeddingVector> | Error | EmbedResultInput | EmbeddingModelV3['doEmbed'];

/** Optional identity overrides for a mock embedding model. */
export type MockEmbeddingModelOptions = {
  /** The provider id; defaults to `mock-provider`. */
  provider?: string;
  /** The model id; defaults to an auto-incrementing `mock-model-{n}`. */
  modelId?: string;
  /** The max embeddings per call; defaults to `1`. */
  maxEmbeddingsPerCall?: number;
  /** Whether parallel calls are supported; defaults to `true`. */
  supportsParallelCalls?: boolean;
};

/** Small, stable token usage used when none is supplied. */
const defaultUsage: EmbeddingModelV3Result['usage'] = { tokens: 0 };

/** Throws a clear error when `doEmbed` is called but no matching response was configured. */
const notImplemented = (): never => {
  throw new Error(`MockEmbeddingModel.doEmbed was called but no matching response was provided.`);
};

/**
 * Whether a value is a single embeddings matrix (`number[][]`) rather than a sequence of responses.
 * A sequence of pure-embedding responses is one level deeper (`number[][][]`), and a mixed sequence
 * holds non-array members, so both are correctly classified as sequences.
 */
const isEmbeddingsMatrix = (value: unknown): value is Array<EmbeddingVector> =>
  Array.isArray(value) && value.every((vector) => Array.isArray(vector) && vector.every((n) => typeof n === 'number'));

/** Fills a partial embed result with default usage and warnings. */
const buildEmbedResult = (input: EmbedResultInput): EmbeddingModelV3Result => ({
  usage: defaultUsage,
  warnings: [],
  ...input,
});

/** Resolves a single response into an embed result; `undefined` means no response was configured. */
const resolveEmbed = async (
  response: EmbedResponse | undefined,
  options: EmbeddingModelV3CallOptions,
): Promise<EmbeddingModelV3Result> => {
  if (response === undefined) return notImplemented();
  if (response instanceof Error) throw response;
  if (typeof response === 'function') return response(options);
  if (Array.isArray(response)) return buildEmbedResult({ embeddings: response });
  return buildEmbedResult(response);
};

/** Picks the response for the current call: a single response repeats, a sequence advances and clamps. */
const pickResponse = (
  input: EmbedResponse | Array<EmbedResponse> | undefined,
  callIndex: number,
): EmbedResponse | undefined => {
  if (Array.isArray(input) && !isEmbeddingsMatrix(input)) {
    return input[Math.min(callIndex, input.length - 1)];
  }
  return input;
};

/**
 * An `EmbeddingModelV3` mock whose `doEmbed` is a `vi.fn()` spy. Each call is also recorded on
 * `doEmbedCalls` so call arguments can be inspected without vitest. Created via {@link MockEmbeddingModel.from}.
 */
class EmbeddingModelMock implements EmbeddingModelV3 {
  /** The embedding model spec version this mock implements. */
  readonly specificationVersion = 'v3';
  /** The provider id. */
  readonly provider: string;
  /** The model id. */
  readonly modelId: string;
  /** The max embeddings per call. */
  readonly maxEmbeddingsPerCall: number;
  /** Whether the model supports parallel calls. */
  readonly supportsParallelCalls: boolean;

  /** Spy implementing `doEmbed`, resolving the configured response. */
  doEmbed: Mock<EmbeddingModelV3['doEmbed']>;
  /** Call options captured for every `doEmbed` invocation, in order. */
  doEmbedCalls: Array<EmbeddingModelV3CallOptions> = [];

  /** Builds the spy and identity from the configured response(s) and options. */
  constructor(input?: EmbedResponse | Array<EmbedResponse>, options: MockEmbeddingModelOptions = {}) {
    this.provider = options.provider ?? defaultProvider;
    this.modelId = options.modelId ?? nextModelId();
    this.maxEmbeddingsPerCall = options.maxEmbeddingsPerCall ?? 1;
    this.supportsParallelCalls = options.supportsParallelCalls ?? true;

    this.doEmbed = vi.fn(async (callOptions: EmbeddingModelV3CallOptions) => {
      const response = pickResponse(input, this.doEmbedCalls.length);
      this.doEmbedCalls.push(callOptions);
      return resolveEmbed(response, callOptions);
    });
  }
}

/** Builds a full embed result from a set of vectors, overriding usage/warnings as needed. */
const result = (
  embeddings: Array<EmbeddingVector>,
  overrides: Omit<EmbedResultInput, 'embeddings'> = {},
): EmbeddingModelV3Result => buildEmbedResult({ embeddings, ...overrides });

/** Builds an embedding usage object from a token count. */
const usage = (tokens = 0): EmbeddingModelV3Result['usage'] => ({ tokens });

/** Creates a mock `EmbeddingModelV3` from a response spec (or sequence of them). */
const from = (input?: EmbedResponse | Array<EmbedResponse>, options?: MockEmbeddingModelOptions): EmbeddingModelMock =>
  new EmbeddingModelMock(input, options);

/**
 * Namespace for building mock embedding models. `from` creates a mock `EmbeddingModelV3`; the other
 * builders assemble the values a model returns. Exported as both a value (the namespace) and a type
 * (the model instance).
 *
 * @example
 * const model = MockEmbeddingModel.from([[0.1, 0.2, 0.3]]);
 * const flaky = MockEmbeddingModel.from([new Error('rate limited'), [[0.1, 0.2, 0.3]]]);
 */
export const MockEmbeddingModel = { from, result, usage };

/** A mock embedding model instance, as returned by {@link MockEmbeddingModel.from}. */
export type MockEmbeddingModel = EmbeddingModelMock;
