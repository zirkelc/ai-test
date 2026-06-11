import type { UIMessage } from 'ai';
import { describe, expectTypeOf, test } from 'vitest';
import { fromUIMessage } from './from-ui-message.js';
import { UIMessages } from './message.js';

/** Concrete data/tools/message types used to drive inference in these tests. */
type MyData = { weather: { city: string } };
type MyTools = { search: { input: { q: string }; output: { hits: number } } };
type MyUIMessage = UIMessage<{ traceId: string }, MyData, MyTools>;

describe('UIMessages return types', () => {
  test('the loose role builders should return a UIMessage', () => {
    expectTypeOf(UIMessages.user('hi')).toEqualTypeOf<UIMessage>();
    expectTypeOf(UIMessages.assistant('hi')).toEqualTypeOf<UIMessage>();
    expectTypeOf(UIMessages.system('hi')).toEqualTypeOf<UIMessage>();
  });

  test('the bound role builders should return the concrete UIMessage type', () => {
    const { UIMessages: BoundMessages } = fromUIMessage<MyUIMessage>();

    expectTypeOf(BoundMessages.user('hi')).toEqualTypeOf<MyUIMessage>();
    expectTypeOf(BoundMessages.assistant('hi')).toEqualTypeOf<MyUIMessage>();
    expectTypeOf(BoundMessages.system('hi')).toEqualTypeOf<MyUIMessage>();
  });
});
