import { describe, expect, test } from 'vitest';
import * as language from './index.js';

describe('language barrel', () => {
  test('should export the language testing surface', () => {
    // Assert
    expect(typeof language.MockLanguageModel).toBe('object');
    expect(typeof language.MockLanguageModel.from).toBe('function');
    expect(typeof language.Content).toBe('object');
    expect(typeof language.StreamParts).toBe('object');
    expect(typeof language.Stream).toBe('object');
    expect(typeof language.Iterable).toBe('object');
    expect(typeof language.Options).toBe('object');
  });
});
