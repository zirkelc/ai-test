import type { UIMessage, UIMessageChunk } from 'ai';
import { describe, expectTypeOf, test } from 'vitest';
import { UIChunks } from './chunks.js';
import { fromUIMessage } from './from-ui-message.js';
import type { UIMessageChunks } from './types.js';

/** Concrete data/tools/message types used to drive inference in these tests. */
type MyData = { weather: { city: string } };
type MyTools = { search: { input: { q: string }; output: { hits: number } } };
type MyUIMessage = UIMessage<{ traceId: string }, MyData, MyTools>;

/** A loose chunk variant selected by its `type`. */
type ChunkOf<TYPE extends string> = Extract<UIMessageChunk, { type: TYPE }>;

describe('UIChunks return types', () => {
  test('the text builders should each return their chunk variant', () => {
    expectTypeOf(UIChunks.textStart({ id: '1' })).toEqualTypeOf<ChunkOf<'text-start'>>();
    expectTypeOf(UIChunks.textDelta({ id: '1', delta: 'hi' })).toEqualTypeOf<ChunkOf<'text-delta'>>();
    expectTypeOf(UIChunks.textEnd({ id: '1' })).toEqualTypeOf<ChunkOf<'text-end'>>();
  });

  test('the reasoning builders should each return their chunk variant', () => {
    expectTypeOf(UIChunks.reasoningStart({ id: 'r' })).toEqualTypeOf<ChunkOf<'reasoning-start'>>();
    expectTypeOf(UIChunks.reasoningDelta({ id: 'r', delta: 'hm' })).toEqualTypeOf<ChunkOf<'reasoning-delta'>>();
    expectTypeOf(UIChunks.reasoningEnd({ id: 'r' })).toEqualTypeOf<ChunkOf<'reasoning-end'>>();
  });

  test('the tool builders should each return their chunk variant', () => {
    expectTypeOf(UIChunks.toolInputStart({ toolCallId: 'c', toolName: 'w' })).toEqualTypeOf<
      ChunkOf<'tool-input-start'>
    >();
    expectTypeOf(UIChunks.toolInputDelta({ toolCallId: 'c', inputTextDelta: '{' })).toEqualTypeOf<
      ChunkOf<'tool-input-delta'>
    >();
    expectTypeOf(UIChunks.toolInputAvailable({ toolCallId: 'c', toolName: 'w', input: {} })).toEqualTypeOf<
      ChunkOf<'tool-input-available'>
    >();
    expectTypeOf(
      UIChunks.toolInputError({ toolCallId: 'c', toolName: 'w', input: {}, errorText: 'bad' }),
    ).toEqualTypeOf<ChunkOf<'tool-input-error'>>();
    expectTypeOf(UIChunks.toolApprovalRequest({ approvalId: 'a', toolCallId: 'c' })).toEqualTypeOf<
      ChunkOf<'tool-approval-request'>
    >();
    expectTypeOf(UIChunks.toolOutputAvailable({ toolCallId: 'c', output: {} })).toEqualTypeOf<
      ChunkOf<'tool-output-available'>
    >();
    expectTypeOf(UIChunks.toolOutputError({ toolCallId: 'c', errorText: 'boom' })).toEqualTypeOf<
      ChunkOf<'tool-output-error'>
    >();
    expectTypeOf(UIChunks.toolOutputDenied({ toolCallId: 'c' })).toEqualTypeOf<ChunkOf<'tool-output-denied'>>();
  });

  test('the source/file builders should each return their chunk variant', () => {
    expectTypeOf(UIChunks.sourceUrl({ sourceId: 's', url: 'https://x' })).toEqualTypeOf<ChunkOf<'source-url'>>();
    expectTypeOf(UIChunks.sourceDocument({ sourceId: 's', mediaType: 'application/pdf', title: 'Doc' })).toEqualTypeOf<
      ChunkOf<'source-document'>
    >();
    expectTypeOf(UIChunks.file({ url: 'https://x', mediaType: 'image/png' })).toEqualTypeOf<ChunkOf<'file'>>();
  });

  test('the lifecycle builders should each return their chunk variant', () => {
    expectTypeOf(UIChunks.error('boom')).toEqualTypeOf<ChunkOf<'error'>>();
    expectTypeOf(UIChunks.startStep()).toEqualTypeOf<ChunkOf<'start-step'>>();
    expectTypeOf(UIChunks.finishStep()).toEqualTypeOf<ChunkOf<'finish-step'>>();
    expectTypeOf(UIChunks.start()).toEqualTypeOf<ChunkOf<'start'>>();
    expectTypeOf(UIChunks.finish()).toEqualTypeOf<ChunkOf<'finish'>>();
    expectTypeOf(UIChunks.abort()).toEqualTypeOf<ChunkOf<'abort'>>();
  });

  test('the block builders should each return an array of chunks', () => {
    expectTypeOf(UIChunks.text('hi')).items.toEqualTypeOf<UIMessageChunk>();
    expectTypeOf(UIChunks.reasoning('hm')).items.toEqualTypeOf<UIMessageChunk>();
    expectTypeOf(
      UIChunks.toolInput({ toolCallId: 'c', toolName: 'w', input: {} }),
    ).items.toEqualTypeOf<UIMessageChunk>();
  });

  test('the bound data/metadata builders should narrow to the message types', () => {
    const { UIChunks: BoundChunks } = fromUIMessage<MyUIMessage>();

    expectTypeOf(BoundChunks.data('weather', { city: 'Tokyo' })).toEqualTypeOf<
      UIMessageChunks<MyUIMessage>['data-weather']
    >();
    expectTypeOf(BoundChunks.messageMetadata({ traceId: 't' })).toEqualTypeOf<
      UIMessageChunks<MyUIMessage>['message-metadata']
    >();
  });
});
