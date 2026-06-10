# ai-test-kit

<p align="center">Test utilities for the AI SDK: mock models, content and stream-part builders, fully type-safe</p>
<p align="center">
  <a href="https://www.npmjs.com/package/ai-test-kit" alt="ai-test-kit"><img src="https://img.shields.io/npm/dt/ai-test-kit?label=ai-test-kit"></a> <a href="https://github.com/zirkelc/ai-test-kit/actions/workflows/ci.yml" alt="CI"><img src="https://img.shields.io/github/actions/workflow/status/zirkelc/ai-test-kit/ci.yml?branch=main"></a>
</p>

This library provides ergonomic, type-safe helpers for testing code built on the AI SDK: a fluent API to mock [`generateText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text) / [`streamText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text), build content and stream parts, and assert on results. It implements its own `LanguageModelV3` mock and builds on the AI SDK's own stream helpers (`simulateReadableStream` and the stream converters).

### Why?

The AI SDK ships `MockLanguageModelV3` and other helpers under `ai/test`, but they are deliberately low-level. In practice every project ends up rebuilding the same helpers to:

- **Mock a model**: return text, throw an error, or replay a scripted response per call
- **Build content and stream parts**: assemble valid `text-start` → `text-delta` → `text-end` → `finish` streams by hand
- **Keep tests deterministic**: pin message ids and timestamps so snapshots are stable

This library provides those helpers as small, composable builders. Models are `vi.fn()` spies, so you can assert on calls with the full Vitest API while also reading the recorded call arguments directly.

Helpers are split by layer, each under its own entry point so an import only pulls in the types it needs:

- `ai-test-kit/language` — the model layer: mock a `LanguageModelV3`, build `LanguageModelV3Content` and stream parts (and later `ai-test-kit/embedding`, `ai-test-kit/image`)
- `ai-test-kit/ui` — the UI layer: build `UIMessagePart`, `UIMessageChunk`, and `UIMessage` fixtures, optionally typed to your own `UIMessage`

### Installation

```bash
npm install -D ai-test-kit
```

`ai` and `vitest` are peer dependencies.

## Usage

### Language Models

Helpers from `ai-test-kit/language` to mock a model and build the content and stream parts it returns.

#### Creating a Mock Model

Pass a response to `MockLanguageModel.from()`. A `string` is the common case: it serves both `doGenerate` and `doStream`.

```typescript
import { generateText } from 'ai';
import { MockLanguageModel } from 'ai-test-kit/language';

const model = MockLanguageModel.from('Hello, world!');

const result = await generateText({ model, prompt: 'Hi' });
result.text; // 'Hello, world!'
```

#### Generate and Stream

The same model answers both `generateText()` and `streamText()`. For streaming, a string is assembled into a `stream-start` → `text-start` → `text-delta*` → `text-end` → `finish` sequence.

```typescript
import { streamText } from 'ai';
import { MockLanguageModel, Stream } from 'ai-test-kit/language';

const model = MockLanguageModel.from('Hello World');

const result = streamText({ model, prompt: 'Hi' });
const text = (await Stream.toArray(result.textStream)).join(''); // 'Hello World'
```

#### Throwing Errors

Pass an `Error` to make the model throw, for testing error handling and retries.

```typescript
const model = MockLanguageModel.from(new Error('rate limited'));

await expect(generateText({ model, prompt: 'Hi' })).rejects.toThrow();
```

#### Sequenced Responses

Pass an array to script a response per call. The model advances through the array and clamps to the last entry once exhausted, ideal for retry and fallback tests. An array models the sequence directly and is easy to build programmatically.

```typescript
// fail, fail, then succeed
const model = MockLanguageModel.from([new Error('429'), new Error('429'), 'recovered']);

await generateText({ model, prompt: 'Hi' }).catch(() => {});
await generateText({ model, prompt: 'Hi' }).catch(() => {});
const result = await generateText({ model, prompt: 'Hi' });
result.text; // 'recovered'
```

#### Building Content

Use `Content` to assemble the parts a model returns from `doGenerate`. Pass them via the `content` response form. Like a plain `string`, a `{ content }` mock also serves `streamText()` — the stream is derived from the parts.

```typescript
import { Content, MockLanguageModel } from 'ai-test-kit/language';

const model = MockLanguageModel.from({
  content: [
    Content.text('Here is the weather:'),
    Content.toolCall({ toolCallId: 'call-1', toolName: 'weather', input: { city: 'Tokyo' } }),
  ],
});

const result = await generateText({ model, prompt: 'Weather in Tokyo?' });
result.toolCalls[0].toolName; // 'weather'
```

#### Usage and Finish Reason

By default a mock reports a `stop` finish reason and a small fixed token usage. Override them via the `{ content, finishReason, usage }` form to test code that branches on the finish reason or tracks token usage.

```typescript
import { Content, MockLanguageModel } from 'ai-test-kit/language';

const model = MockLanguageModel.from({
  content: [Content.text('truncated…')],
  finishReason: MockLanguageModel.finishReason('length'),
  usage: MockLanguageModel.usage({ outputTokens: { total: 50 } }),
});

const result = await generateText({ model, prompt: 'Hi' });
result.finishReason; // 'length'
result.usage; // the configured token usage
```

#### Building Streams

Use `StreamParts` to compose a stream from atoms. The text-like builders return a `start` / `delta` / `end` block (no trailing `finish`), so streams compose by concatenation.

```typescript
import { MockLanguageModel, StreamParts } from 'ai-test-kit/language';

const model = MockLanguageModel.from({
  stream: [
    StreamParts.streamStart(),
    ...StreamParts.text('Hello', { length: 1 }), // emit one character per delta
    ...StreamParts.toolInput({ id: 't1', toolName: 'weather', input: { city: 'Tokyo' } }),
    StreamParts.toolCall({ toolCallId: 'call-1', toolName: 'weather', input: { city: 'Tokyo' } }),
    StreamParts.finish(),
  ],
});
```

For timing tests, give the `stream` form a `{ chunks, ... }` object with delays (or use `Stream.simulate`):

```typescript
const model = MockLanguageModel.from({
  stream: {
    chunks: [...StreamParts.text('slow'), StreamParts.finish()],
    initialDelayInMs: 10,
    chunkDelayInMs: 5,
  },
});
```

#### Aborting a Stream

The call's `abortSignal` is wired into the simulated stream automatically, so a stream aborted mid-flight errors with an `AbortError` just like a real provider — no custom `ReadableStream` needed. Pair it with `chunkDelayInMs` so the abort can land between chunks.

```typescript
import { MockLanguageModel, StreamParts } from 'ai-test-kit/language';

const controller = new AbortController();

const model = MockLanguageModel.from({
  stream: { chunks: [...StreamParts.text('Hello World'), StreamParts.finish()], chunkDelayInMs: 10 },
});

const result = streamText({ model, prompt: 'Hi', abortSignal: controller.signal });
// ...later, controller.abort() makes the stream reject with an AbortError
```

#### Different Responses per Method

Use the `{ generate, stream }` form to drive `doGenerate` and `doStream` independently — for example to return plain text non-streaming but a richer sequence when streamed.

```typescript
import { MockLanguageModel, StreamParts } from 'ai-test-kit/language';

const model = MockLanguageModel.from({
  generate: 'Final answer',
  stream: [...StreamParts.text('Final answer'), StreamParts.finish()],
});
```

#### Inspecting Streams

Use `Stream` to build, drain, and read stream parts when asserting.

```typescript
import { Stream, StreamParts } from 'ai-test-kit/language';

const parts = [...StreamParts.text('Hello World'), StreamParts.finish()];

Stream.text(parts); // 'Hello World'
Stream.finishReason(parts)?.unified; // 'stop'

const drained = await Stream.toArray(Stream.from(parts)); // round-trips parts
```

#### Deterministic Output

`generateText()` / `streamText()` assign a random `response.id` and a wall-clock `response.timestamp`. When a test asserts on those (e.g. snapshots), spread `Options` to pin them. It is not needed for ordinary assertions like `result.text`.

```typescript
import { MockLanguageModel, Options } from 'ai-test-kit/language';

const model = MockLanguageModel.from('Hi');

await generateText({ model, prompt: 'x', ...Options.generate });
streamText({ model, prompt: 'x', ...Options.stream });
```

#### Inspecting Calls

`doGenerate` and `doStream` are `vi.fn()` spies, so the full Vitest API works. Each call is also recorded on `doGenerateCalls` / `doStreamCalls`, which you can read without Vitest.

```typescript
const model = MockLanguageModel.from('hi');

await generateText({ model, prompt: 'question' });

// Vitest spy
expect(model.doGenerate).toHaveBeenCalledTimes(1);
model.doGenerate.mock.calls[0][0].prompt;

// Recorded call options
model.doGenerateCalls.length; // 1
model.doGenerateCalls[0].prompt;
```

#### Custom Identity

Override `provider` and `modelId`; otherwise the model uses `mock-provider` and an auto-incrementing id.

```typescript
const model = MockLanguageModel.from('hi', { provider: 'acme', modelId: 'acme-1' });
model.provider; // 'acme'
model.modelId; // 'acme-1'
```

### UI Messages

Helpers from `ai-test-kit/ui` to build the messages, parts, and chunks exchanged between the server and the client. Use them to test code that operates on `UIMessage`, `UIMessageChunk`, or `UIMessagePart` (custom transports, stream consumers, message reducers). The builders return plain objects shaped to the AI SDK's UI types, so the entry has no runtime cost beyond the types.

#### Building Parts, Chunks, and Messages

`UIParts` builds message parts, `UIChunks` builds stream chunks, and `UIMessages` builds whole messages from a `string` shortcut or an array of parts.

```typescript
import { UIChunks, UIMessages, UIParts } from 'ai-test-kit/ui';

const message = UIMessages.assistant([
  UIParts.text('Here is the weather:'),
  UIParts.sourceUrl({ sourceId: 's1', url: 'https://example.com' }),
]);

const chunks = [
  UIChunks.start(),
  ...UIChunks.text('Hello', { length: 1 }), // text-start → text-delta* → text-end
  UIChunks.finish(),
];
```

The text-like builders (`UIChunks.text` / `UIChunks.reasoning` / `UIChunks.toolInput`) return a block of atoms, so streams compose by concatenation. The individual atoms (`UIChunks.textStart`, `textDelta`, …) are also available.

#### Consuming a Chunk Stream

The chunk builders shine when testing code that consumes a `UIMessageChunk` stream. `Stream` (from `ai-test-kit/language`) is layer-agnostic, so it builds and drains chunk streams too.

```typescript
import { Stream } from 'ai-test-kit/language';
import { UIChunks } from 'ai-test-kit/ui';

const chunks = [UIChunks.start(), ...UIChunks.text('Hello'), UIChunks.finish()];

const stream = Stream.from(chunks); // ReadableStream<UIMessageChunk>

// pass `stream` to the code under test (a transport, reducer, readUIMessageStream, …),
// or drain it to assert on the chunks directly
const received = await Stream.toArray(stream);
received.length; // 5
```

#### Typing to Your Own `UIMessage`

By default `data` payloads, tool names, and message metadata are loose. Pass your own `UIMessage` type to `fromUIMessage()` once and the bound builders infer them.

```typescript
import type { UIMessage } from 'ai';
import { fromUIMessage } from 'ai-test-kit/ui';

type MyUIMessage = UIMessage<
  { traceId: string }, // metadata
  { weather: { city: string } }, // data parts
  { search: { input: { q: string }; output: { hits: number } } } // tools
>;

const { UIParts, UIChunks, UIMessages } = fromUIMessage<MyUIMessage>();

UIChunks.data('weather', { city: 'Tokyo' }); // name + payload typed
UIChunks.messageMetadata({ traceId: 't1' }); // metadata typed
UIParts.tool('search', { toolCallId: 'c1', state: 'output-available', input: { q: 'cats' }, output: { hits: 3 } });
```

## API

### Language Models

Builders and the mock model from `ai-test-kit/language`.

#### `MockLanguageModel`

Namespace for the mock model and its result builders. The model returned by `.from()` exposes `doGenerate` / `doStream` as `vi.fn()` spies and records call options on `doGenerateCalls` / `doStreamCalls`. The namespace and the instance type share the name.

#### `.from(input?, options?)`

Creates a mock `LanguageModelV3` from a response spec (or a sequence of them).

```ts
MockLanguageModel.from(input?: MockResponse | MockResponse[], options?: MockLanguageModelOptions): MockLanguageModel
// MockLanguageModel.from('Hi'): a model returning 'Hi' from generate and stream
// MockLanguageModel.from(new Error('429')): a model that throws from generate and stream
// MockLanguageModel.from({ content: [Content.text('Hi')] }): a model returning those parts (stream derived from them)
// MockLanguageModel.from({ generate: 'A', stream: [...] }): drives doGenerate and doStream independently
// MockLanguageModel.from([new Error('429'), 'ok']): sequences responses per call, clamping to the last
```

- `input` defaults to a single response repeated for every call; an array sequences one response per call, clamped to the last. See [`MockResponse`](#mockresponse).
- `options.provider` defaults to `mock-provider`; `options.modelId` defaults to an auto-incrementing `mock-model-{n}`.

#### `.content(input)`

```ts
MockLanguageModel.content(input: string | LanguageModelV3Content[]): LanguageModelV3Content[]
// MockLanguageModel.content('hi'): [{ type: 'text', text: 'hi' }]
// MockLanguageModel.content([Content.text('hi')]): [{ type: 'text', text: 'hi' }] — array passes through
```

#### `.generateResult(input)`

```ts
MockLanguageModel.generateResult(input: string | { content: LanguageModelV3Content[]; finishReason?: LanguageModelV3FinishReason; usage?: LanguageModelV3Usage }): LanguageModelV3GenerateResult
// MockLanguageModel.generateResult('hi'): { content: [{ type: 'text', text: 'hi' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }
// MockLanguageModel.generateResult({ content: [Content.text('hi')] }): { content: [{ type: 'text', text: 'hi' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }
```

#### `.streamResult(input, options?)`

```ts
MockLanguageModel.streamResult(input: string | LanguageModelV3StreamPart[] | ReadableStream<LanguageModelV3StreamPart>, options?: StreamDelayOptions): LanguageModelV3StreamResult
// MockLanguageModel.streamResult('hi'): { stream } — a ReadableStream of stream-start → text → finish
// MockLanguageModel.streamResult([...StreamParts.text('hi'), StreamParts.finish()]): { stream } — a ReadableStream of the given parts
// MockLanguageModel.streamResult(Stream.from(parts)): { stream } — wraps an existing ReadableStream as-is (delays ignored)
```

#### `.usage(overrides?)`

```ts
MockLanguageModel.usage(overrides?: { inputTokens?: Partial<LanguageModelV3Usage['inputTokens']>; outputTokens?: Partial<LanguageModelV3Usage['outputTokens']> }): LanguageModelV3Usage
// MockLanguageModel.usage({ outputTokens: { total: 99 } }): { inputTokens: { total: 10, … }, outputTokens: { total: 99, … } }
```

#### `.finishReason(unified?)`

```ts
MockLanguageModel.finishReason(unified?: LanguageModelV3FinishReason['unified']): LanguageModelV3FinishReason
// MockLanguageModel.finishReason('length'): { unified: 'length', raw: 'length' }
```

#### `Content`

Builders for the static content parts returned from `doGenerate`.

#### `.text(text)`

```ts
Content.text(text: string): LanguageModelV3Text
// Content.text('Hi'): { type: 'text', text: 'Hi' }
```

#### `.reasoning(text)`

```ts
Content.reasoning(text: string): LanguageModelV3Reasoning
// Content.reasoning('Because...'): { type: 'reasoning', text: 'Because...' }
```

#### `.toolCall(args)`

```ts
Content.toolCall(args: { toolCallId: string; toolName: string; input: unknown }): LanguageModelV3ToolCall
// Content.toolCall({ toolCallId: 'c1', toolName: 'weather', input: { city: 'Tokyo' } }): { type: 'tool-call', toolCallId: 'c1', toolName: 'weather', input: '{"city":"Tokyo"}' } — input is JSON-stringified unless already a string
```

#### `.toolResult(args)`

```ts
Content.toolResult(args: { toolCallId: string; toolName: string; result: unknown; isError?: boolean }): LanguageModelV3ToolResult
// Content.toolResult({ toolCallId: 'c1', toolName: 'weather', result: { temp: 20 } }): { type: 'tool-result', toolCallId: 'c1', toolName: 'weather', result: { temp: 20 } }
```

#### `.file(args)`

```ts
Content.file(args: { mediaType: string; data: string | Uint8Array }): LanguageModelV3File
// Content.file({ mediaType: 'image/png', data: 'abc' }): { type: 'file', mediaType: 'image/png', data: 'abc' }
```

#### `.source(args)`

```ts
Content.source(args: { id: string; url: string; title?: string }): LanguageModelV3Source
// Content.source({ id: 's1', url: 'https://example.com' }): { type: 'source', sourceType: 'url', id: 's1', url: 'https://example.com' }
```

#### `StreamParts`

Builders for individual stream parts emitted by `doStream`. The text-like builders return a `start` / `delta` / `end` block (without `finish`); control parts are single parts.

#### `.text(text, options?)`

```ts
StreamParts.text(text: string, options?: StreamPartOptions): LanguageModelV3StreamPart[]
// StreamParts.text('Hi'): [{ type: 'text-start', id: '1' }, { type: 'text-delta', id: '1', delta: 'Hi' }, { type: 'text-end', id: '1' }]
```

#### `.reasoning(text, options?)`

```ts
StreamParts.reasoning(text: string, options?: StreamPartOptions): LanguageModelV3StreamPart[]
// StreamParts.reasoning('Hmm'): [{ type: 'reasoning-start', id: '1' }, { type: 'reasoning-delta', id: '1', delta: 'Hmm' }, { type: 'reasoning-end', id: '1' }]
```

#### `.toolInput(args)`

```ts
StreamParts.toolInput(args: { id: string; toolName: string; input: unknown; length?: number }): LanguageModelV3StreamPart[]
// StreamParts.toolInput({ id: 't1', toolName: 'weather', input: { city: 'Tokyo' } }): [{ type: 'tool-input-start', id: 't1', toolName: 'weather' }, { type: 'tool-input-delta', id: 't1', delta: '{"city":"Tokyo"}' }, { type: 'tool-input-end', id: 't1' }]
```

#### `.toolCall(args)`

```ts
StreamParts.toolCall(args: { toolCallId: string; toolName: string; input: unknown }): LanguageModelV3StreamPart
// StreamParts.toolCall({ toolCallId: 'c1', toolName: 'weather', input: { city: 'Tokyo' } }): { type: 'tool-call', toolCallId: 'c1', toolName: 'weather', input: '{"city":"Tokyo"}' }
```

#### `.toolResult(args)`

```ts
StreamParts.toolResult(args: { toolCallId: string; toolName: string; result: unknown; isError?: boolean }): LanguageModelV3StreamPart
// StreamParts.toolResult({ toolCallId: 'c1', toolName: 'weather', result: { temp: 20 } }): { type: 'tool-result', toolCallId: 'c1', toolName: 'weather', result: { temp: 20 } }
```

#### `.source(args)`

```ts
StreamParts.source(args: { id: string; url: string; title?: string }): LanguageModelV3StreamPart
// StreamParts.source({ id: 's1', url: 'https://example.com' }): { type: 'source', sourceType: 'url', id: 's1', url: 'https://example.com' }
```

#### `.file(args)`

```ts
StreamParts.file(args: { mediaType: string; data: string | Uint8Array }): LanguageModelV3StreamPart
// StreamParts.file({ mediaType: 'image/png', data: 'abc' }): { type: 'file', mediaType: 'image/png', data: 'abc' }
```

#### `.finish(args?)`

```ts
StreamParts.finish(args?: { finishReason?: LanguageModelV3FinishReason | LanguageModelV3FinishReason['unified']; usage?: LanguageModelV3Usage }): LanguageModelV3StreamPart
// StreamParts.finish(): { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage }
```

#### `.error(error)`

```ts
StreamParts.error(error: unknown): LanguageModelV3StreamPart
// StreamParts.error(new Error('boom')): { type: 'error', error: Error('boom') }
```

#### `.streamStart(warnings?)`

```ts
StreamParts.streamStart(warnings?: SharedV3Warning[]): LanguageModelV3StreamPart
// StreamParts.streamStart(): { type: 'stream-start', warnings: [] }
```

#### `.responseMetadata(meta?)`

```ts
StreamParts.responseMetadata(meta?: LanguageModelV3ResponseMetadata): LanguageModelV3StreamPart
// StreamParts.responseMetadata({ id: 'r1' }): { type: 'response-metadata', id: 'r1' }
```

#### `.raw(rawValue)`

```ts
StreamParts.raw(rawValue: unknown): LanguageModelV3StreamPart
// StreamParts.raw({ foo: 1 }): { type: 'raw', rawValue: { foo: 1 } }
```

#### `Stream`

Operations for building, draining, and inspecting streams.

#### `.from(parts)`

```ts
Stream.from<T>(parts: T[]): ReadableStream<T>
// Stream.from([a, b]): ReadableStream emitting a, then b
```

#### `.simulate(chunks, options?)`

```ts
Stream.simulate<T>(chunks: T[], options?: StreamDelayOptions): ReadableStream<T>
// Stream.simulate([a, b], { chunkDelayInMs: 5 }): ReadableStream emitting a, then b, with delays
```

#### `.toArray(stream)`

```ts
Stream.toArray<T>(stream: ReadableStream<T>): Promise<T[]>
// Stream.toArray(stream): Promise<[a, b]>
```

#### `.toIterable(stream)`

```ts
Stream.toIterable<T>(stream: ReadableStream<T>): ReadableStream<T> & AsyncIterable<T>
// for await (const part of Stream.toIterable(stream)) { ... } — consume a stream via for-await
```

#### `.text(parts)`

```ts
Stream.text(parts: LanguageModelV3StreamPart[]): string
// Stream.text(StreamParts.text('Hello World')): 'Hello World'
```

#### `.finishReason(parts)`

```ts
Stream.finishReason(parts: LanguageModelV3StreamPart[]): LanguageModelV3FinishReason | undefined
// Stream.finishReason([StreamParts.finish()]): { unified: 'stop', raw: 'stop' }
```

#### `Iterable`

The async-iterable complement to `Stream`: build, drain, and convert `AsyncIterable`s (async generators, and anything consumed via `for await`). Use it when the code under test produces or consumes a plain async iterable rather than a `ReadableStream`. Cross back to the `Stream` toolbox with `.toStream`.

#### `.from(items)`

```ts
Iterable.from<T>(items: T[]): AsyncIterable<T>
// Iterable.from([a, b]): an async iterable yielding a, then b
```

#### `.toArray(iterable)`

```ts
Iterable.toArray<T>(iterable: AsyncIterable<T>): Promise<T[]>
// Iterable.toArray(iterable): Promise<[a, b]>
```

#### `.toStream(iterable)`

```ts
Iterable.toStream<T>(iterable: AsyncIterable<T>): ReadableStream<T>
// Iterable.toStream(iterable): a ReadableStream emitting a, then b
```

#### `Options`

Determinism helpers to spread into `generateText()` / `streamText()`.

#### `.generateId()`

```ts
Options.generateId(): string
// Options.generateId(): 'aitxt-mock-id'
```

#### `.generate`

```ts
Options.generate: { _internal: { generateId } }
// generateText({ model, prompt: 'x', ...Options.generate }): a deterministic generateId
```

#### `.stream`

```ts
Options.stream: { _internal: { generateId, now } }
// streamText({ model, prompt: 'x', ...Options.stream }): a deterministic generateId and now
```

> [!NOTE]
> `Options.stream` pins timestamps via `_internal.now`, but the AI SDK uses `new Date()` directly on the `finish-step` part in the error streaming path. Tests that hit that path additionally need `vi.useFakeTimers()`.

### UI Messages

Builders from `ai-test-kit/ui`. See [UI Messages](#ui-messages) under Usage for examples. By default `data`, `tool`, and metadata are loosely typed; bind them with [`fromUIMessage`](#fromuimessage).

#### `UIParts`

Builders for `UIMessagePart`.

#### `.text(text, options?)`

```ts
UIParts.text(text: string, options?: { state?: 'streaming' | 'done'; providerMetadata?: ProviderMetadata }): TextUIPart
// UIParts.text('Hi'): { type: 'text', text: 'Hi' }
```

#### `.reasoning(text, options?)`

```ts
UIParts.reasoning(text: string, options?: { state?: 'streaming' | 'done'; providerMetadata?: ProviderMetadata }): ReasoningUIPart
// UIParts.reasoning('Hmm'): { type: 'reasoning', text: 'Hmm' }
```

#### `.sourceUrl(args)`

```ts
UIParts.sourceUrl(args: { sourceId: string; url: string; title?: string; providerMetadata?: ProviderMetadata }): SourceUrlUIPart
// UIParts.sourceUrl({ sourceId: 's1', url: 'https://example.com' }): { type: 'source-url', sourceId: 's1', url: 'https://example.com' }
```

#### `.sourceDocument(args)`

```ts
UIParts.sourceDocument(args: { sourceId: string; mediaType: string; title: string; filename?: string; providerMetadata?: ProviderMetadata }): SourceDocumentUIPart
// UIParts.sourceDocument({ sourceId: 's1', mediaType: 'application/pdf', title: 'Doc' }): { type: 'source-document', sourceId: 's1', mediaType: 'application/pdf', title: 'Doc' }
```

#### `.file(args)`

```ts
UIParts.file(args: { mediaType: string; filename?: string; url: string; providerMetadata?: ProviderMetadata }): FileUIPart
// UIParts.file({ mediaType: 'image/png', url: 'https://example.com/a.png' }): { type: 'file', mediaType: 'image/png', url: 'https://example.com/a.png' }
```

#### `.stepStart()`

```ts
UIParts.stepStart(): StepStartUIPart
// UIParts.stepStart(): { type: 'step-start' }
```

#### `.data(name, data, options?)`

```ts
UIParts.data(name: string, data: unknown, options?: { id?: string }): DataUIPart
// UIParts.data('weather', { city: 'Tokyo' }): { type: 'data-weather', data: { city: 'Tokyo' } }
```

#### `.tool(name, invocation)`

```ts
UIParts.tool(name: string, invocation: UIToolInvocation): ToolUIPart
// UIParts.tool('weather', { toolCallId: 'c1', state: 'output-available', input: { city: 'Tokyo' }, output: { temp: 20 } }): { type: 'tool-weather', toolCallId: 'c1', state: 'output-available', input: { city: 'Tokyo' }, output: { temp: 20 } }
```

#### `.dynamicTool(invocation)`

```ts
UIParts.dynamicTool(invocation: Omit<DynamicToolUIPart, 'type'>): DynamicToolUIPart
// UIParts.dynamicTool({ toolName: 'weather', toolCallId: 'c1', state: 'input-available', input: { city: 'Tokyo' } }): { type: 'dynamic-tool', toolName: 'weather', toolCallId: 'c1', state: 'input-available', input: { city: 'Tokyo' } }
```

#### `UIChunks`

Builders for every `UIMessageChunk` variant; required fields shown, each also accepts its variant's optional fields (`providerMetadata`, `toolMetadata`, …). The `text`, `reasoning`, and `toolInput` block helpers return arrays.

#### `.textStart(args)`

```ts
UIChunks.textStart(args: { id: string }): UIMessageChunk
// UIChunks.textStart({ id: '1' }): { type: 'text-start', id: '1' }
```

#### `.textDelta(args)`

```ts
UIChunks.textDelta(args: { id: string; delta: string }): UIMessageChunk
// UIChunks.textDelta({ id: '1', delta: 'Hi' }): { type: 'text-delta', id: '1', delta: 'Hi' }
```

#### `.textEnd(args)`

```ts
UIChunks.textEnd(args: { id: string }): UIMessageChunk
// UIChunks.textEnd({ id: '1' }): { type: 'text-end', id: '1' }
```

#### `.reasoningStart(args)`

```ts
UIChunks.reasoningStart(args: { id: string }): UIMessageChunk
// UIChunks.reasoningStart({ id: 'r1' }): { type: 'reasoning-start', id: 'r1' }
```

#### `.reasoningDelta(args)`

```ts
UIChunks.reasoningDelta(args: { id: string; delta: string }): UIMessageChunk
// UIChunks.reasoningDelta({ id: 'r1', delta: 'Hmm' }): { type: 'reasoning-delta', id: 'r1', delta: 'Hmm' }
```

#### `.reasoningEnd(args)`

```ts
UIChunks.reasoningEnd(args: { id: string }): UIMessageChunk
// UIChunks.reasoningEnd({ id: 'r1' }): { type: 'reasoning-end', id: 'r1' }
```

#### `.error(errorText)`

```ts
UIChunks.error(errorText: string): UIMessageChunk
// UIChunks.error('boom'): { type: 'error', errorText: 'boom' }
```

#### `.toolInputStart(args)`

```ts
UIChunks.toolInputStart(args: { toolCallId: string; toolName: string }): UIMessageChunk
// UIChunks.toolInputStart({ toolCallId: 'c1', toolName: 'weather' }): { type: 'tool-input-start', toolCallId: 'c1', toolName: 'weather' }
```

#### `.toolInputDelta(args)`

```ts
UIChunks.toolInputDelta(args: { toolCallId: string; inputTextDelta: string }): UIMessageChunk
// UIChunks.toolInputDelta({ toolCallId: 'c1', inputTextDelta: '{"city":' }): { type: 'tool-input-delta', toolCallId: 'c1', inputTextDelta: '{"city":' }
```

#### `.toolInputAvailable(args)`

```ts
UIChunks.toolInputAvailable(args: { toolCallId: string; toolName: string; input: unknown }): UIMessageChunk
// UIChunks.toolInputAvailable({ toolCallId: 'c1', toolName: 'weather', input: { city: 'Tokyo' } }): { type: 'tool-input-available', toolCallId: 'c1', toolName: 'weather', input: { city: 'Tokyo' } }
```

#### `.toolInputError(args)`

```ts
UIChunks.toolInputError(args: { toolCallId: string; toolName: string; input: unknown; errorText: string }): UIMessageChunk
// UIChunks.toolInputError({ toolCallId: 'c1', toolName: 'weather', input: {}, errorText: 'bad input' }): { type: 'tool-input-error', toolCallId: 'c1', toolName: 'weather', input: {}, errorText: 'bad input' }
```

#### `.toolApprovalRequest(args)`

```ts
UIChunks.toolApprovalRequest(args: { approvalId: string; toolCallId: string }): UIMessageChunk
// UIChunks.toolApprovalRequest({ approvalId: 'a1', toolCallId: 'c1' }): { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c1' }
```

#### `.toolOutputAvailable(args)`

```ts
UIChunks.toolOutputAvailable(args: { toolCallId: string; output: unknown }): UIMessageChunk
// UIChunks.toolOutputAvailable({ toolCallId: 'c1', output: { temp: 20 } }): { type: 'tool-output-available', toolCallId: 'c1', output: { temp: 20 } }
```

#### `.toolOutputError(args)`

```ts
UIChunks.toolOutputError(args: { toolCallId: string; errorText: string }): UIMessageChunk
// UIChunks.toolOutputError({ toolCallId: 'c1', errorText: 'failed' }): { type: 'tool-output-error', toolCallId: 'c1', errorText: 'failed' }
```

#### `.toolOutputDenied(args)`

```ts
UIChunks.toolOutputDenied(args: { toolCallId: string }): UIMessageChunk
// UIChunks.toolOutputDenied({ toolCallId: 'c1' }): { type: 'tool-output-denied', toolCallId: 'c1' }
```

#### `.sourceUrl(args)`

```ts
UIChunks.sourceUrl(args: { sourceId: string; url: string; title?: string }): UIMessageChunk
// UIChunks.sourceUrl({ sourceId: 's1', url: 'https://example.com' }): { type: 'source-url', sourceId: 's1', url: 'https://example.com' }
```

#### `.sourceDocument(args)`

```ts
UIChunks.sourceDocument(args: { sourceId: string; mediaType: string; title: string; filename?: string }): UIMessageChunk
// UIChunks.sourceDocument({ sourceId: 's1', mediaType: 'application/pdf', title: 'Doc' }): { type: 'source-document', sourceId: 's1', mediaType: 'application/pdf', title: 'Doc' }
```

#### `.file(args)`

```ts
UIChunks.file(args: { url: string; mediaType: string }): UIMessageChunk
// UIChunks.file({ url: 'https://example.com/a.png', mediaType: 'image/png' }): { type: 'file', url: 'https://example.com/a.png', mediaType: 'image/png' }
```

#### `.data(name, data, options?)`

```ts
UIChunks.data(name: string, data: unknown, options?: { id?: string; transient?: boolean }): UIMessageChunk
// UIChunks.data('weather', { city: 'Tokyo' }): { type: 'data-weather', data: { city: 'Tokyo' } }
```

#### `.startStep()`

```ts
UIChunks.startStep(): UIMessageChunk
// UIChunks.startStep(): { type: 'start-step' }
```

#### `.finishStep()`

```ts
UIChunks.finishStep(): UIMessageChunk
// UIChunks.finishStep(): { type: 'finish-step' }
```

#### `.start(args?)`

```ts
UIChunks.start(args?: { messageId?: string; messageMetadata?: unknown }): UIMessageChunk
// UIChunks.start(): { type: 'start' }
```

#### `.finish(args?)`

```ts
UIChunks.finish(args?: { finishReason?: FinishReason; messageMetadata?: unknown }): UIMessageChunk
// UIChunks.finish(): { type: 'finish' }
```

#### `.abort(args?)`

```ts
UIChunks.abort(args?: { reason?: string }): UIMessageChunk
// UIChunks.abort({ reason: 'cancelled' }): { type: 'abort', reason: 'cancelled' }
```

#### `.messageMetadata(metadata)`

```ts
UIChunks.messageMetadata(metadata: unknown): UIMessageChunk
// UIChunks.messageMetadata({ traceId: 't1' }): { type: 'message-metadata', messageMetadata: { traceId: 't1' } }
```

#### `.text(text, options?)`

```ts
UIChunks.text(text: string, options?: UIChunkBlockOptions): UIMessageChunk[]
// UIChunks.text('Hi'): [{ type: 'text-start', id: '1' }, { type: 'text-delta', id: '1', delta: 'Hi' }, { type: 'text-end', id: '1' }]
```

#### `.reasoning(text, options?)`

```ts
UIChunks.reasoning(text: string, options?: UIChunkBlockOptions): UIMessageChunk[]
// UIChunks.reasoning('Hmm'): [{ type: 'reasoning-start', id: '1' }, { type: 'reasoning-delta', id: '1', delta: 'Hmm' }, { type: 'reasoning-end', id: '1' }]
```

#### `.toolInput(args)`

```ts
UIChunks.toolInput(args: { toolCallId: string; toolName: string; input: unknown; length?: number }): UIMessageChunk[]
// UIChunks.toolInput({ toolCallId: 'c1', toolName: 'weather', input: { city: 'Tokyo' } }): [{ type: 'tool-input-start', toolCallId: 'c1', toolName: 'weather' }, { type: 'tool-input-delta', toolCallId: 'c1', inputTextDelta: '{"city":"Tokyo"}' }, { type: 'tool-input-available', toolCallId: 'c1', toolName: 'weather', input: { city: 'Tokyo' } }]
```

#### `UIMessages`

Builders for `UIMessage`. A `string` becomes a single text part; ids auto-increment (`mock-message-{n}`) when omitted.

#### `.user(content, options?)`

```ts
UIMessages.user(content: string | UIMessagePart[], options?: { id?: string; metadata?: unknown }): UIMessage
// UIMessages.user('hi'): { id: 'mock-message-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }
// UIMessages.user([UIParts.text('hi')]): { id: 'mock-message-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] } — array of parts passes through
```

#### `.assistant(content, options?)`

```ts
UIMessages.assistant(content: string | UIMessagePart[], options?: { id?: string; metadata?: unknown }): UIMessage
// UIMessages.assistant('Hi'): { id: 'mock-message-1', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }
// UIMessages.assistant([UIParts.text('Hi')], { id: 'm1' }): { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] } — array of parts passes through
```

#### `.system(content, options?)`

```ts
UIMessages.system(content: string | UIMessagePart[], options?: { id?: string; metadata?: unknown }): UIMessage
// UIMessages.system('Be concise', { id: 'm1' }): { id: 'm1', role: 'system', parts: [{ type: 'text', text: 'Be concise' }] }
// UIMessages.system([UIParts.text('Be concise')]): { id: 'mock-message-1', role: 'system', parts: [{ type: 'text', text: 'Be concise' }] } — array of parts passes through
```

#### `fromUIMessage`

Binds the UI builders to a concrete `UIMessage` type so `data`, `tool`, and metadata infer their names and payloads. The `createUIParts` / `createUIChunks` / `createUIMessages` factories are also exported for binding type parameters directly.

```ts
fromUIMessage<UIMessage>(): { UIParts; UIChunks; UIMessages }
// const { UIParts, UIChunks, UIMessages } = fromUIMessage<MyUIMessage>(): builders typed to MyUIMessage
```

## Types

All types are exported from `ai-test-kit/language`.

### `MockResponse`

A single mock response. A `string` or `Error` applies to whichever method is called; the object forms target one method explicitly. Pass an `Array<MockResponse>` to sequence responses across calls.

```ts
type MockResponse =
  | string // text, for both generate and stream
  | Error // both methods throw
  | { content; finishReason?; usage? } // generate result, or a derived stream
  | { generate?; stream? }; // generate and/or stream explicitly
```

### `MockLanguageModel`

The mock model instance type, as returned by `MockLanguageModel.from()`. Because the namespace and the instance type share the name, you can use `MockLanguageModel` to annotate a model parameter.

```ts
import type { MockLanguageModel } from 'ai-test-kit/language';
```

### `GenerateResponse` / `StreamResponse`

The per-method response shapes used by the `{ generate, stream }` form of `MockResponse`. `stream` accepts a bare `Array<StreamPart>`, a `ReadableStream<StreamPart>` (used as-is), or a `{ chunks, initialDelayInMs?, chunkDelayInMs? }` object to simulate delays.

```ts
import type { GenerateResponse, StreamResponse } from 'ai-test-kit/language';
```

### `MockLanguageModelOptions`

The identity overrides accepted as the second argument to `MockLanguageModel.from()`.

```ts
import type { MockLanguageModelOptions } from 'ai-test-kit/language';
// { provider?: string; modelId?: string }
```

### `StreamPartOptions`

Options for the streamed-text part builders (`StreamParts.text` / `StreamParts.reasoning`).

```ts
import type { StreamPartOptions } from 'ai-test-kit/language';
// { id?: string; length?: number; separator?: string }
```

### `StreamDelayOptions`

Simulated timing shared by `Stream.simulate`, `MockLanguageModel.streamResult`, and the `stream` chunks form. With an `abortSignal`, the stream errors with an `AbortError` the instant the signal fires (mid-delay), matching a real provider stream.

```ts
import type { StreamDelayOptions } from 'ai-test-kit/language';
// { initialDelayInMs?: number | null; chunkDelayInMs?: number | null; abortSignal?: AbortSignal }
```

## License

MIT
