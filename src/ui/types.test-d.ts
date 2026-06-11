import type {
  DynamicToolUIPart,
  FileUIPart,
  InferUIMessageChunk,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  StepStartUIPart,
  TextUIPart,
  UIMessage,
} from 'ai';
import { describe, expectTypeOf, test } from 'vitest';
import type {
  InferUIMessagePart,
  UIMessageChunkOf,
  UIMessageChunks,
  UIMessagePartOf,
  UIMessageParts,
} from './types.js';

/** Concrete data/tools/message types used to drive inference in these tests. */
type MyData = { weather: { city: string } };
type MyTools = { search: { input: { q: string }; output: { hits: number } } };
type MyUIMessage = UIMessage<{ traceId: string }, MyData, MyTools>;
type MyPart = MyUIMessage['parts'][number];
type MyChunk = InferUIMessageChunk<MyUIMessage>;

describe('InferUIMessagePart', () => {
  test('should equal the message parts union', () => {
    expectTypeOf<InferUIMessagePart<MyUIMessage>>().toEqualTypeOf<MyPart>();
  });
});

describe('UIMessagePartOf', () => {
  test('should select a static variant from an exact type', () => {
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'text'>>().toEqualTypeOf<TextUIPart>();
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'reasoning'>>().toEqualTypeOf<ReasoningUIPart>();
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'source-url'>>().toEqualTypeOf<SourceUrlUIPart>();
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'source-document'>>().toEqualTypeOf<SourceDocumentUIPart>();
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'file'>>().toEqualTypeOf<FileUIPart>();
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'step-start'>>().toEqualTypeOf<StepStartUIPart>();
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'dynamic-tool'>>().toEqualTypeOf<DynamicToolUIPart>();
  });

  test('should select a dynamic tool/data variant by its concrete name', () => {
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'tool-search'>>().toEqualTypeOf<
      Extract<MyPart, { type: 'tool-search' }>
    >();
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'data-weather'>>().toEqualTypeOf<
      Extract<MyPart, { type: 'data-weather' }>
    >();
  });

  test('should select a union of variants from a union type', () => {
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'text' | 'reasoning'>>().toEqualTypeOf<TextUIPart | ReasoningUIPart>();
  });

  test('should select every matching variant from a template type', () => {
    expectTypeOf<UIMessagePartOf<MyUIMessage, `tool-${string}`>>().toEqualTypeOf<
      Extract<MyPart, { type: `tool-${string}` }>
    >();
  });

  test('should resolve a non-matching type to never', () => {
    expectTypeOf<UIMessagePartOf<MyUIMessage, 'nope'>>().toBeNever();
  });
});

describe('UIMessageChunkOf', () => {
  test('should select a variant from an exact type', () => {
    expectTypeOf<UIMessageChunkOf<MyUIMessage, 'text-start'>>().toEqualTypeOf<
      Extract<MyChunk, { type: 'text-start' }>
    >();
    expectTypeOf<UIMessageChunkOf<MyUIMessage, 'finish'>>().toEqualTypeOf<Extract<MyChunk, { type: 'finish' }>>();
  });

  test('should select a union of variants from a union type', () => {
    expectTypeOf<UIMessageChunkOf<MyUIMessage, 'text-start' | 'text-end'>>().toEqualTypeOf<
      Extract<MyChunk, { type: 'text-start' | 'text-end' }>
    >();
  });

  test('should select every matching variant from a template type', () => {
    expectTypeOf<UIMessageChunkOf<MyUIMessage, `tool-${string}`>>().toEqualTypeOf<
      Extract<MyChunk, { type: `tool-${string}` }>
    >();
  });

  test('should resolve a non-matching type to never', () => {
    expectTypeOf<UIMessageChunkOf<MyUIMessage, 'nope'>>().toBeNever();
  });
});

describe('UIMessageParts', () => {
  test('indexing a key should equal UIMessagePartOf / the Extract long form', () => {
    expectTypeOf<UIMessageParts<MyUIMessage>['text']>().toEqualTypeOf<UIMessagePartOf<MyUIMessage, 'text'>>();
    expectTypeOf<UIMessageParts<MyUIMessage>['tool-search']>().toEqualTypeOf<
      Extract<MyPart, { type: 'tool-search' }>
    >();
    expectTypeOf<UIMessageParts<MyUIMessage>['data-weather']>().toEqualTypeOf<
      Extract<MyPart, { type: 'data-weather' }>
    >();
  });

  test('indexing a union key should yield a union of parts', () => {
    expectTypeOf<UIMessageParts<MyUIMessage>['text' | 'reasoning']>().toEqualTypeOf<TextUIPart | ReasoningUIPart>();
  });
});

describe('UIMessageChunks', () => {
  test('indexing a key should equal UIMessageChunkOf / the Extract long form', () => {
    expectTypeOf<UIMessageChunks<MyUIMessage>['text-start']>().toEqualTypeOf<
      UIMessageChunkOf<MyUIMessage, 'text-start'>
    >();
    expectTypeOf<UIMessageChunks<MyUIMessage>['data-weather']>().toEqualTypeOf<
      Extract<MyChunk, { type: 'data-weather' }>
    >();
  });

  test('indexing a union key should yield a union of chunks', () => {
    expectTypeOf<UIMessageChunks<MyUIMessage>['text-start' | 'text-end']>().toEqualTypeOf<
      UIMessageChunkOf<MyUIMessage, 'text-start' | 'text-end'>
    >();
  });
});

describe('bundle completeness', () => {
  test('the parts bundle should key every part type', () => {
    expectTypeOf<keyof UIMessageParts<MyUIMessage>>().toEqualTypeOf<MyPart['type']>();
  });

  test('the chunks bundle should key every chunk type', () => {
    expectTypeOf<keyof UIMessageChunks<MyUIMessage>>().toEqualTypeOf<MyChunk['type']>();
  });
});
