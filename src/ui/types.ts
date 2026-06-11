import type { InferUIMessageChunk, UIMessage } from 'ai';

/**
 * The union of a message's parts. The part-level counterpart to the AI SDK's `InferUIMessageChunk`
 * (which the SDK exports for chunks but not for parts). Narrow it with {@link UIMessagePartOf} or
 * index {@link UIMessageParts}.
 */
export type InferUIMessagePart<UI_MESSAGE extends UIMessage> = UI_MESSAGE['parts'][number];

/**
 * A single part variant of a message, selected by its `type`. `TYPE` accepts an exact type, a union of
 * types, or a `tool-${string}` / `data-${string}` template; a non-matching type resolves to `never`.
 */
export type UIMessagePartOf<
  UI_MESSAGE extends UIMessage,
  TYPE extends InferUIMessagePart<UI_MESSAGE>['type'] | (string & {}),
> = Extract<InferUIMessagePart<UI_MESSAGE>, { type: TYPE }>;

/**
 * A single chunk variant of a message, selected by its `type`. `TYPE` accepts an exact type, a union of
 * types, or a template; a non-matching type resolves to `never`.
 */
export type UIMessageChunkOf<
  UI_MESSAGE extends UIMessage,
  TYPE extends InferUIMessageChunk<UI_MESSAGE>['type'] | (string & {}),
> = Extract<InferUIMessageChunk<UI_MESSAGE>, { type: TYPE }>;

/**
 * A message's part types bundled into a record keyed by each part's `type`, so a single variant is one
 * indexed access: `UIMessageParts<MyUIMessage>['text']`. A union key yields a union of parts, and the
 * dynamic `tool-${name}` / `data-${name}` parts appear under their concrete names.
 */
export type UIMessageParts<UI_MESSAGE extends UIMessage> = {
  [PART in InferUIMessagePart<UI_MESSAGE> as PART['type']]: PART;
};

/**
 * A message's chunk types bundled into a record keyed by each chunk's `type`, so a single variant is one
 * indexed access: `UIMessageChunks<MyUIMessage>['text-start']`. A union key yields a union of chunks.
 */
export type UIMessageChunks<UI_MESSAGE extends UIMessage> = {
  [CHUNK in InferUIMessageChunk<UI_MESSAGE> as CHUNK['type']]: CHUNK;
};
