import type { DynamicToolUIPart, ToolUIPart, UIMessage } from 'ai';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { fromUIMessage } from './from-ui-message.js';

/** Concrete data/tools/message types used to drive inference in these tests. */
type MyData = { weather: { city: string } };
type MyTools = { search: { input: { q: string }; output: { hits: number } } };
type MyUIMessage = UIMessage<{ traceId: string }, MyData, MyTools>;

describe('fromUIMessage', () => {
  test('should bind data builders to the message data types', () => {
    // Arrange
    const { UIParts, UIChunks } = fromUIMessage<MyUIMessage>();

    // Act
    const part = UIParts.data('weather', { city: 'Tokyo' });
    const chunk = UIChunks.data('weather', { city: 'Tokyo' });

    // Assert
    expect(part).toEqual({ type: 'data-weather', data: { city: 'Tokyo' } });
    expect(chunk).toEqual({ type: 'data-weather', data: { city: 'Tokyo' } });
    expectTypeOf(UIParts.data).parameter(1).toEqualTypeOf<{ city: string }>();
  });

  test('should bind metadata builders to the message metadata type', () => {
    // Arrange
    const { UIChunks, UIMessages } = fromUIMessage<MyUIMessage>();

    // Act
    const chunk = UIChunks.messageMetadata({ traceId: 't1' });
    const message = UIMessages.assistant('hi', { id: 'm1', metadata: { traceId: 't1' } });

    // Assert
    expect(chunk).toEqual({ type: 'message-metadata', messageMetadata: { traceId: 't1' } });
    expect(message.metadata).toEqual({ traceId: 't1' });
    expectTypeOf(UIChunks.messageMetadata).parameter(0).toEqualTypeOf<{ traceId: string }>();
  });

  test('should bind tool parts to the message tool set', () => {
    // Arrange
    const { UIParts } = fromUIMessage<MyUIMessage>();

    // Act
    const part = UIParts.tool('search', {
      toolCallId: 'call-1',
      state: 'output-available',
      input: { q: 'cats' },
      output: { hits: 3 },
    });

    // Assert
    expect(part).toEqual({
      type: 'tool-search',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { q: 'cats' },
      output: { hits: 3 },
    });
  });

  test('should return the specific part variant so it assigns without a cast', () => {
    // Arrange
    const { UIParts } = fromUIMessage<MyUIMessage>();

    // Act — typed to the specific member; a wide-union return type would fail to compile here
    const tool: ToolUIPart<MyTools> = UIParts.tool('search', {
      toolCallId: 'c1',
      state: 'output-available',
      input: { q: 'cats' },
      output: { hits: 3 },
    });
    const dynamic: DynamicToolUIPart = UIParts.dynamicTool({
      toolName: 'weather',
      toolCallId: 'c1',
      state: 'input-available',
      input: { city: 'Tokyo' },
    });

    // Assert
    expect(tool.type).toBe('tool-search');
    expect(dynamic).toEqual({
      type: 'dynamic-tool',
      toolName: 'weather',
      toolCallId: 'c1',
      state: 'input-available',
      input: { city: 'Tokyo' },
    });
  });
});
