import { describe, expect, test } from 'vitest';
import { createUIChunks, UIChunks } from './chunks.js';

describe('UIChunks', () => {
  test('textStart() / textDelta() / textEnd() should build text atoms', () => {
    // Assert
    expect(UIChunks.textStart({ id: '1' })).toEqual({ type: 'text-start', id: '1' });
    expect(UIChunks.textDelta({ id: '1', delta: 'hi' })).toEqual({ type: 'text-delta', id: '1', delta: 'hi' });
    expect(UIChunks.textEnd({ id: '1' })).toEqual({ type: 'text-end', id: '1' });
  });

  test('text() should build a start → delta* → end block', () => {
    // Act
    const chunks = UIChunks.text('ab', { id: '1', length: 1 });

    // Assert
    expect(chunks).toEqual([
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'a' },
      { type: 'text-delta', id: '1', delta: 'b' },
      { type: 'text-end', id: '1' },
    ]);
  });

  test('reasoning() should build a reasoning block', () => {
    // Act
    const chunks = UIChunks.reasoning('hm', { id: 'r1' });

    // Assert
    expect(chunks).toEqual([
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'hm' },
      { type: 'reasoning-end', id: 'r1' },
    ]);
  });

  test('error() should build an error chunk', () => {
    // Act
    const chunk = UIChunks.error('boom');

    // Assert
    expect(chunk).toEqual({ type: 'error', errorText: 'boom' });
  });

  test('toolInput() should build a start → delta* → available block', () => {
    // Act
    const chunks = UIChunks.toolInput({ toolCallId: 'call-1', toolName: 'weather', input: { city: 'Tokyo' } });

    // Assert
    expect(chunks).toEqual([
      { type: 'tool-input-start', toolCallId: 'call-1', toolName: 'weather' },
      { type: 'tool-input-delta', toolCallId: 'call-1', inputTextDelta: '{"city":"Tokyo"}' },
      { type: 'tool-input-available', toolCallId: 'call-1', toolName: 'weather', input: { city: 'Tokyo' } },
    ]);
  });

  test('toolInput() should pass a string input through without re-encoding', () => {
    // Act
    const chunks = UIChunks.toolInput({ toolCallId: 'call-1', toolName: 'weather', input: '{"city":"Tokyo"}' });

    // Assert
    expect(chunks[1]).toEqual({ type: 'tool-input-delta', toolCallId: 'call-1', inputTextDelta: '{"city":"Tokyo"}' });
  });

  test('toolOutputAvailable() should build a tool output chunk', () => {
    // Act
    const chunk = UIChunks.toolOutputAvailable({ toolCallId: 'call-1', output: { temp: 20 } });

    // Assert
    expect(chunk).toEqual({ type: 'tool-output-available', toolCallId: 'call-1', output: { temp: 20 } });
  });

  test('data() should build a typed data chunk', () => {
    // Arrange
    const ui = createUIChunks<unknown, { weather: { city: string } }>();

    // Act
    const chunk = ui.data('weather', { city: 'Tokyo' }, { transient: true });

    // Assert
    expect(chunk).toEqual({ type: 'data-weather', data: { city: 'Tokyo' }, transient: true });
  });

  test('start() / finish() should default to a bare chunk', () => {
    // Assert
    expect(UIChunks.start()).toEqual({ type: 'start' });
    expect(UIChunks.finish()).toEqual({ type: 'finish' });
  });

  test('startStep() / finishStep() should build step markers', () => {
    // Assert
    expect(UIChunks.startStep()).toEqual({ type: 'start-step' });
    expect(UIChunks.finishStep()).toEqual({ type: 'finish-step' });
  });

  test('abort() should build an abort chunk with a reason', () => {
    // Act
    const chunk = UIChunks.abort({ reason: 'cancelled' });

    // Assert
    expect(chunk).toEqual({ type: 'abort', reason: 'cancelled' });
  });

  test('messageMetadata() should build a typed metadata chunk', () => {
    // Arrange
    const ui = createUIChunks<{ traceId: string }>();

    // Act
    const chunk = ui.messageMetadata({ traceId: 't1' });

    // Assert
    expect(chunk).toEqual({ type: 'message-metadata', messageMetadata: { traceId: 't1' } });
  });
});
