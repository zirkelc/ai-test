import type { ImageModelV3, ImageModelV3CallOptions } from '@ai-sdk/provider';
import { type Mock, vi } from 'vitest';
import { defaultProvider, nextModelId } from '../internal/identity.js';

/** The result a `doGenerate` call resolves to, derived from the spec. */
type ImageGenerateResult = Awaited<ReturnType<ImageModelV3['doGenerate']>>;

/** The generated images: base64 strings or binary data, returned without conversion. */
export type GeneratedImages = ImageGenerateResult['images'];

/** A (possibly partial) generate result; only `images` is required, the rest defaults. */
type ImageResultInput = Partial<ImageGenerateResult> & { images: GeneratedImages };

/**
 * How to respond to a `doGenerate` call. A bare `images` array is the common case (just the images,
 * with default response metadata). A function receives the call options and returns the result
 * directly — the escape hatch for input-dependent responses.
 */
export type ImageResponse = GeneratedImages | Error | ImageResultInput | ImageModelV3['doGenerate'];

/** Optional identity overrides for a mock image model. */
export type MockImageModelOptions = {
  /** The provider id; defaults to `mock-provider`. */
  provider?: string;
  /** The model id; defaults to an auto-incrementing `mock-model-{n}`. */
  modelId?: string;
  /** The max images per call; defaults to `1`. */
  maxImagesPerCall?: number;
};

/** A valid base64-encoded 1x1 transparent PNG, handy as a stand-in generated image. */
export const validBase64Image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Throws a clear error when `doGenerate` is called but no matching response was configured. */
const notImplemented = (): never => {
  throw new Error(`MockImageModel.doGenerate was called but no matching response was provided.`);
};

/**
 * Whether a value is a single images array (`string[]` / `Uint8Array[]`) rather than a sequence of
 * responses. A sequence of pure-image responses holds arrays (not bare strings), and a mixed sequence
 * holds non-string members, so both are correctly classified as sequences.
 */
const isImagesArray = (value: unknown): value is GeneratedImages =>
  Array.isArray(value) && value.every((image) => typeof image === 'string' || image instanceof Uint8Array);

/** Fills a partial generate result with default warnings and response metadata. */
const buildImageResult = (input: ImageResultInput, modelId = 'mock-model'): ImageGenerateResult => ({
  warnings: [],
  ...input,
  response: { timestamp: new Date(0), modelId, headers: undefined, ...input.response },
});

/** Resolves a single response into a generate result; `undefined` means no response was configured. */
const resolveGenerate = async (
  response: ImageResponse | undefined,
  options: ImageModelV3CallOptions,
  modelId: string,
): Promise<ImageGenerateResult> => {
  if (response === undefined) return notImplemented();
  if (response instanceof Error) throw response;
  if (typeof response === 'function') return response(options);
  if (Array.isArray(response)) return buildImageResult({ images: response }, modelId);
  return buildImageResult(response, modelId);
};

/** Picks the response for the current call: a single response repeats, a sequence advances and clamps. */
const pickResponse = (
  input: ImageResponse | Array<ImageResponse> | undefined,
  callIndex: number,
): ImageResponse | undefined => {
  if (Array.isArray(input) && !isImagesArray(input)) {
    return input[Math.min(callIndex, input.length - 1)];
  }
  return input;
};

/**
 * An `ImageModelV3` mock whose `doGenerate` is a `vi.fn()` spy. Each call is also recorded on
 * `doGenerateCalls` so call arguments can be inspected without vitest. Created via {@link MockImageModel.from}.
 */
class ImageModelMock implements ImageModelV3 {
  /** The image model spec version this mock implements. */
  readonly specificationVersion = 'v3';
  /** The provider id. */
  readonly provider: string;
  /** The model id. */
  readonly modelId: string;
  /** The max images per call. */
  readonly maxImagesPerCall: number;

  /** Spy implementing `doGenerate`, resolving the configured response. */
  doGenerate: Mock<ImageModelV3['doGenerate']>;
  /** Call options captured for every `doGenerate` invocation, in order. */
  doGenerateCalls: Array<ImageModelV3CallOptions> = [];

  /** Builds the spy and identity from the configured response(s) and options. */
  constructor(input?: ImageResponse | Array<ImageResponse>, options: MockImageModelOptions = {}) {
    this.provider = options.provider ?? defaultProvider;
    this.modelId = options.modelId ?? nextModelId();
    this.maxImagesPerCall = options.maxImagesPerCall ?? 1;

    this.doGenerate = vi.fn(async (callOptions: ImageModelV3CallOptions) => {
      const response = pickResponse(input, this.doGenerateCalls.length);
      this.doGenerateCalls.push(callOptions);
      return resolveGenerate(response, callOptions, this.modelId);
    });
  }
}

/** Builds a full generate result from a set of images, overriding warnings/response as needed. */
const result = (images: GeneratedImages, overrides: Omit<ImageResultInput, 'images'> = {}): ImageGenerateResult =>
  buildImageResult({ images, ...overrides });

/** Creates a mock `ImageModelV3` from a response spec (or sequence of them). */
const from = (input?: ImageResponse | Array<ImageResponse>, options?: MockImageModelOptions): ImageModelMock =>
  new ImageModelMock(input, options);

/**
 * Namespace for building mock image models. `from` creates a mock `ImageModelV3`; `result` assembles
 * a generate result and `image` is a ready-made base64 PNG. Exported as both a value (the namespace)
 * and a type (the model instance).
 *
 * @example
 * const model = MockImageModel.from([MockImageModel.image]);
 * const flaky = MockImageModel.from([new Error('rate limited'), [MockImageModel.image]]);
 */
export const MockImageModel = { from, result, image: validBase64Image };

/** A mock image model instance, as returned by {@link MockImageModel.from}. */
export type MockImageModel = ImageModelMock;
