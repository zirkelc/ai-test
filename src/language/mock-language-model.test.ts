import { generateText, streamText } from 'ai';
import { describe, expect, test } from 'vitest';
import { Content } from './content.js';
import { MockLanguageModel } from './mock-language-model.js';
import { Options } from './options.js';
import { Stream } from './stream.js';
import { StreamParts } from './stream-parts.js';

describe('MockLanguageModel', () => {
  describe('generate', () => {
    test('should return text content from a string shorthand', async () => {
      // Arrange
      const model = MockLanguageModel.from('Hello, world!');

      // Act
      const result = await generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(result.text).toBe('Hello, world!');
    });

    test('should throw from an Error shorthand', async () => {
      // Arrange
      const model = MockLanguageModel.from(new Error('boom'));

      // Act
      const result = generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      await expect(result).rejects.toThrow();
    });

    test('should return explicit content built from Content atoms', async () => {
      // Arrange
      const model = MockLanguageModel.from({ content: [Content.text('explicit')] });

      // Act
      const result = await generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(result.text).toBe('explicit');
      expect(result.finishReason).toBe('stop');
    });

    test('should accept a unified finish-reason string in the content form', async () => {
      // Arrange
      const model = MockLanguageModel.from({ content: [Content.text('truncated')], finishReason: 'length' });

      // Act
      const result = await generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(result.finishReason).toBe('length');
    });

    test('should resolve the generate form from a function of the call options', async () => {
      // Arrange
      const model = MockLanguageModel.from({
        generate: async (options) => MockLanguageModel.generateResult(`prompt-parts:${options.prompt.length}`),
      });

      // Act
      const result = await generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(result.text).toBe('prompt-parts:1');
    });

    test('should surface a tool call from Content.toolCall', async () => {
      // Arrange
      const model = MockLanguageModel.from({
        content: [Content.toolCall({ toolCallId: 'call-1', toolName: 'weather', input: { city: 'Tokyo' } })],
      });

      // Act
      const result = await generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(result.toolCalls.length).toBe(1);
      expect(result.toolCalls[0]!.toolName).toBe('weather');
    });
  });

  describe('stream', () => {
    test('should stream text from a string shorthand', async () => {
      // Arrange
      const model = MockLanguageModel.from('Hello World');

      // Act
      const result = streamText({ model, prompt: 'Hi', ...Options.stream });
      const text = (await Stream.toArray(result.textStream)).join('');

      // Assert
      expect(text).toBe('Hello World');
    });

    test('should stream from composed StreamParts', async () => {
      // Arrange
      const chunks = [StreamParts.streamStart(), ...StreamParts.text('abcdef', { length: 2 }), StreamParts.finish()];
      const model = MockLanguageModel.from({ stream: chunks });

      // Act
      const result = streamText({ model, prompt: 'Hi', ...Options.stream });
      const text = (await Stream.toArray(result.textStream)).join('');

      // Assert
      expect(text).toBe('abcdef');
    });

    test('should derive a stream from content', async () => {
      // Arrange
      const model = MockLanguageModel.from({ content: [Content.text('derived')] });

      // Act
      const result = streamText({ model, prompt: 'Hi', ...Options.stream });
      const text = (await Stream.toArray(result.textStream)).join('');

      // Assert
      expect(text).toBe('derived');
    });

    test('should make a string and the equivalent content stream identically', async () => {
      // Arrange
      const fromString = MockLanguageModel.from('Hello');
      const fromContent = MockLanguageModel.from({ content: [Content.text('Hello')] });
      const callOptions = { prompt: [] } as never;

      // Act
      const stringParts = await Stream.toArray((await fromString.doStream(callOptions)).stream);
      const contentParts = await Stream.toArray((await fromContent.doStream(callOptions)).stream);

      // Assert
      expect(stringParts).toEqual(contentParts);
    });

    test('should stream from a chunks object with delays', async () => {
      // Arrange
      const model = MockLanguageModel.from({
        stream: { chunks: [...StreamParts.text('fast'), StreamParts.finish()], chunkDelayInMs: 0 },
      });

      // Act
      const result = streamText({ model, prompt: 'Hi', ...Options.stream });
      const text = (await Stream.toArray(result.textStream)).join('');

      // Assert
      expect(text).toBe('fast');
    });

    test('should resolve the stream form from a function of the call options', async () => {
      // Arrange
      const model = MockLanguageModel.from({
        stream: async (options) => MockLanguageModel.streamResult(options.prompt.length > 0 ? 'has-prompt' : 'empty'),
      });

      // Act
      const result = streamText({ model, prompt: 'Hi', ...Options.stream });
      const text = (await Stream.toArray(result.textStream)).join('');

      // Assert
      expect(text).toBe('has-prompt');
    });

    test('should stream from a bare ReadableStream in the stream form', async () => {
      // Arrange
      const parts = [StreamParts.streamStart(), ...StreamParts.text('piped'), StreamParts.finish()];
      const model = MockLanguageModel.from({ stream: Stream.from(parts) });

      // Act
      const result = streamText({ model, prompt: 'Hi', ...Options.stream });
      const text = (await Stream.toArray(result.textStream)).join('');

      // Assert
      expect(text).toBe('piped');
    });

    test('should error with an AbortError when the call abortSignal fires mid-stream', async () => {
      // Arrange
      const controller = new AbortController();
      const parts = [StreamParts.streamStart(), ...StreamParts.text('Hello World'), StreamParts.finish()];
      const model = MockLanguageModel.from({ stream: { chunks: parts, chunkDelayInMs: 10 } });
      const { stream } = await model.doStream({ prompt: [], abortSignal: controller.signal } as never);
      const reader = stream.getReader();

      // Act
      const first = await reader.read();
      controller.abort();
      const error = await reader.read().catch((e: unknown) => e);

      // Assert
      expect(first.value).toEqual(parts[0]);
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe('AbortError');
    });
  });

  describe('sequencing', () => {
    test('should advance through an array of responses per call', async () => {
      // Arrange
      const model = MockLanguageModel.from(['first', 'second']);

      // Act
      const a = await generateText({ model, prompt: 'Hi', ...Options.generate });
      const b = await generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(a.text).toBe('first');
      expect(b.text).toBe('second');
    });

    test('should clamp to the last response once the array is exhausted', async () => {
      // Arrange
      const model = MockLanguageModel.from(['only-first', 'last']);

      // Act
      await generateText({ model, prompt: 'Hi', ...Options.generate });
      await generateText({ model, prompt: 'Hi', ...Options.generate });
      const third = await generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(third.text).toBe('last');
    });
  });

  describe('vitest integration', () => {
    test('should record calls on the vi.fn spy', async () => {
      // Arrange
      const model = MockLanguageModel.from('hi');

      // Act
      await generateText({ model, prompt: 'question', ...Options.generate });

      // Assert
      expect(model.doGenerate).toHaveBeenCalledTimes(1);
      const callArgs = model.doGenerate.mock.calls[0]!;
      expect(callArgs[0].prompt).toEqual([{ role: 'user', content: [{ type: 'text', text: 'question' }] }]);
    });

    test('should record calls on the native call array', async () => {
      // Arrange
      const model = MockLanguageModel.from('hi');

      // Act
      await generateText({ model, prompt: 'question', ...Options.generate });

      // Assert
      expect(model.doGenerateCalls.length).toBe(1);
      expect(model.doGenerateCalls[0]!.prompt).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'question' }] },
      ]);
    });

    test('should not call the fallback when the primary succeeds', async () => {
      // Arrange
      const primary = MockLanguageModel.from('primary');
      const fallback = MockLanguageModel.from('fallback');

      // Act
      await generateText({ model: primary, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(primary.doGenerate).toHaveBeenCalledTimes(1);
      expect(fallback.doGenerate).toHaveBeenCalledTimes(0);
    });
  });

  describe('builders', () => {
    test('content() should wrap a string into a single text part', () => {
      // Act
      const parts = MockLanguageModel.content('hi');

      // Assert
      expect(parts).toEqual([{ type: 'text', text: 'hi' }]);
    });

    test('usage() should override defaults per field', () => {
      // Act
      const result = MockLanguageModel.usage({ outputTokens: { total: 99 } });

      // Assert
      expect(result.outputTokens.total).toBe(99);
      expect(result.inputTokens.total).toBe(10);
    });

    test('finishReason() should mirror raw from unified', () => {
      // Act
      const result = MockLanguageModel.finishReason('length');

      // Assert
      expect(result).toEqual({ unified: 'length', raw: 'length' });
    });

    test('generateResult() should build a full result from a string', () => {
      // Act
      const result = MockLanguageModel.generateResult('hi');

      // Assert
      expect(result.content).toEqual([{ type: 'text', text: 'hi' }]);
      expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
      expect(result.warnings).toEqual([]);
    });

    test('generateResult() output can drive the doGenerate spy directly', async () => {
      // Arrange
      const model = MockLanguageModel.from();
      model.doGenerate.mockResolvedValue(MockLanguageModel.generateResult('stubbed'));

      // Act
      const result = await generateText({ model, prompt: 'Hi', ...Options.generate });

      // Assert
      expect(result.text).toBe('stubbed');
    });

    test('streamResult() should wrap a ReadableStream as a stream result', async () => {
      // Arrange
      const parts = [...StreamParts.text('wrapped'), StreamParts.finish()];
      const stream = Stream.from(parts);

      // Act
      const result = MockLanguageModel.streamResult(stream);

      // Assert
      expect(result.stream).toBe(stream);
      expect(await Stream.toArray(result.stream)).toEqual(parts);
    });
  });

  describe('identity', () => {
    test('should default provider and auto-increment modelId', () => {
      // Arrange
      const a = MockLanguageModel.from();
      const b = MockLanguageModel.from();

      // Act + Assert
      expect(a.provider).toBe('mock-provider');
      expect(a.modelId).not.toBe(b.modelId);
    });

    test('should honor provider and modelId overrides', () => {
      // Arrange
      const model = MockLanguageModel.from('hi', { provider: 'acme', modelId: 'acme-1' });

      // Act + Assert
      expect(model.provider).toBe('acme');
      expect(model.modelId).toBe('acme-1');
    });
  });
});
