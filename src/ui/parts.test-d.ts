import type {
  DynamicToolUIPart,
  FileUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  StepStartUIPart,
  TextUIPart,
  UIMessage,
} from 'ai';
import { describe, expectTypeOf, test } from 'vitest';
import { fromUIMessage } from './from-ui-message.js';
import { UIParts } from './parts.js';
import type { UIMessageParts } from './types.js';

/** Concrete data/tools/message types used to drive inference in these tests. */
type MyData = { weather: { city: string } };
type MyTools = { search: { input: { q: string }; output: { hits: number } } };
type MyUIMessage = UIMessage<{ traceId: string }, MyData, MyTools>;

describe('UIParts return types', () => {
  test('the static builders should each return their part variant', () => {
    expectTypeOf(UIParts.text('hi')).toEqualTypeOf<TextUIPart>();
    expectTypeOf(UIParts.reasoning('hm')).toEqualTypeOf<ReasoningUIPart>();
    expectTypeOf(UIParts.sourceUrl({ sourceId: 's', url: 'https://x' })).toEqualTypeOf<SourceUrlUIPart>();
    expectTypeOf(
      UIParts.sourceDocument({ sourceId: 's', mediaType: 'application/pdf', title: 'Doc' }),
    ).toEqualTypeOf<SourceDocumentUIPart>();
    expectTypeOf(UIParts.file({ mediaType: 'image/png', url: 'https://x' })).toEqualTypeOf<FileUIPart>();
    expectTypeOf(UIParts.stepStart()).toEqualTypeOf<StepStartUIPart>();
    expectTypeOf(
      UIParts.dynamicTool({ toolName: 'w', toolCallId: 'c', state: 'input-streaming' }),
    ).toEqualTypeOf<DynamicToolUIPart>();
  });

  test('the bound tool/data builders should narrow to the message variant', () => {
    const { UIParts: BoundParts } = fromUIMessage<MyUIMessage>();

    expectTypeOf(
      BoundParts.tool('search', { toolCallId: 'c', state: 'output-available', input: { q: 'x' }, output: { hits: 1 } }),
    ).toEqualTypeOf<UIMessageParts<MyUIMessage>['tool-search']>();
    expectTypeOf(BoundParts.data('weather', { city: 'Tokyo' })).toEqualTypeOf<
      UIMessageParts<MyUIMessage>['data-weather']
    >();
  });
});
