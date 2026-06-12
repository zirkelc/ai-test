import { generateImage } from 'ai';
import { describe, expect, test } from 'vitest';
import { MockImageModel, validBase64Image } from './mock-image-model.js';

describe('MockImageModel', () => {
  describe('from', () => {
    test('should generate from a bare images array', async () => {
      // Arrange
      const model = MockImageModel.from([validBase64Image]);

      // Act
      const result = await generateImage({ model, prompt: 'a cat' });

      // Assert
      expect(result.images.length).toBe(1);
      expect(result.images[0]?.base64).toBe(validBase64Image);
    });

    test('should default warnings for a bare images array', async () => {
      // Arrange
      const model = MockImageModel.from([validBase64Image]);

      // Act
      const result = await generateImage({ model, prompt: 'a cat' });

      // Assert
      expect(result.warnings).toEqual([]);
    });

    test('should throw when given an Error', async () => {
      // Arrange
      const model = MockImageModel.from(new Error('rate limited'));

      // Act
      const result = generateImage({ model, prompt: 'a cat' });

      // Assert
      await expect(result).rejects.toThrow();
    });

    test('should resolve a function response from the call options', async () => {
      // Arrange
      const model = MockImageModel.from(async (options) => ({
        images: [validBase64Image],
        warnings: [],
        response: { timestamp: new Date(0), modelId: String(options.n), headers: undefined },
      }));

      // Act
      const result = await generateImage({ model, prompt: 'a cat' });

      // Assert
      expect(result.images[0]?.base64).toBe(validBase64Image);
    });

    test('should throw a clear error when no response is configured', async () => {
      // Arrange
      const model = MockImageModel.from();

      // Act
      const result = generateImage({ model, prompt: 'x' });

      // Assert
      await expect(result).rejects.toThrow();
    });
  });

  describe('sequencing', () => {
    test('should advance through a sequence and clamp to the last', async () => {
      // Arrange
      const model = MockImageModel.from([new Error('429'), [validBase64Image]]);

      // Act + Assert
      await expect(generateImage({ model, prompt: 'a' })).rejects.toThrow();
      expect((await generateImage({ model, prompt: 'b' })).images[0]?.base64).toBe(validBase64Image);
      expect((await generateImage({ model, prompt: 'c' })).images[0]?.base64).toBe(validBase64Image);
    });
  });

  describe('spying', () => {
    test('should record calls on the spy and on the call history', async () => {
      // Arrange
      const model = MockImageModel.from([validBase64Image]);

      // Act
      await generateImage({ model, prompt: 'a cat' });

      // Assert
      expect(model.doGenerate.mock.calls.length).toBe(1);
      expect(model.doGenerateCalls[0]?.prompt).toBe('a cat');
    });
  });

  describe('options', () => {
    test('should default provider, auto-increment modelId, and set spec defaults', () => {
      // Arrange
      const a = MockImageModel.from();
      const b = MockImageModel.from();

      // Assert
      expect(a.provider).toBe('mock-provider');
      expect(a.modelId).not.toBe(b.modelId);
      expect(a.maxImagesPerCall).toBe(1);
    });

    test('should honor identity and capability overrides', () => {
      // Arrange
      const model = MockImageModel.from([validBase64Image], {
        provider: 'acme',
        modelId: 'acme-image',
        maxImagesPerCall: 4,
      });

      // Assert
      expect(model.provider).toBe('acme');
      expect(model.modelId).toBe('acme-image');
      expect(model.maxImagesPerCall).toBe(4);
    });
  });

  describe('builders', () => {
    test('result should build a full result with deterministic response metadata', () => {
      // Act
      const built = MockImageModel.result([validBase64Image]);

      // Assert
      expect(built.images).toEqual([validBase64Image]);
      expect(built.warnings).toEqual([]);
      expect(built.response.timestamp).toEqual(new Date(0));
      expect(built.response.modelId).toBe('mock-model');
    });

    test('image should be the valid base64 PNG', () => {
      // Assert
      expect(MockImageModel.image).toBe(validBase64Image);
    });
  });
});
