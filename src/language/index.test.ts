import { describe, expect, test } from 'vitest';
import * as language from './index.js';

describe('language barrel', () => {
  test('should export the language testing surface', () => {
    // Assert
    expect(typeof language.MockLanguageModel).toBe('object');
    expect(typeof language.MockLanguageModel.from).toBe('function');
    expect(typeof language.ContentParts).toBe('object');
    expect(typeof language.StreamParts).toBe('object');
    expect(typeof language.Options).toBe('object');
  });
});
