import type { UIDataTypes, UIMessagePart, UIToolInvocation, UITools } from 'ai';

/** A single part variant selected from the union by its `type` tag. */
type PartOf<DATA extends UIDataTypes, TOOLS extends UITools, TYPE extends string> = Extract<
  UIMessagePart<DATA, TOOLS>,
  { type: TYPE }
>;

/** `Omit` that distributes over a union, so a variant split by a discriminant (e.g. `dynamic-tool` by `state`) keeps each member. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** The fields of a part variant without the given keys, used as a builder's argument shape. */
type PartArgs<
  DATA extends UIDataTypes,
  TOOLS extends UITools,
  TYPE extends string,
  OMIT extends string = 'type',
> = DistributiveOmit<PartOf<DATA, TOOLS, TYPE>, OMIT | 'type'>;

/**
 * Builds the {@link UIParts} namespace bound to a message's `DATA` and `TOOLS` types. The runtime is
 * identical for every binding; the type parameters only sharpen `data` and `tool`. Use the top-level
 * {@link UIParts} for the loose default, or `fromUIMessage` to bind.
 */
export const createUIParts = <DATA extends UIDataTypes = UIDataTypes, TOOLS extends UITools = UITools>() => ({
  /** A text part, optionally with streaming `state` and provider metadata. */
  text: (text: string, opts?: PartArgs<DATA, TOOLS, 'text', 'text'>): PartOf<DATA, TOOLS, 'text'> =>
    ({ type: 'text', text, ...opts }) as PartOf<DATA, TOOLS, 'text'>,

  /** A reasoning part, optionally with streaming `state` and provider metadata. */
  reasoning: (text: string, opts?: PartArgs<DATA, TOOLS, 'reasoning', 'text'>): PartOf<DATA, TOOLS, 'reasoning'> =>
    ({ type: 'reasoning', text, ...opts }) as PartOf<DATA, TOOLS, 'reasoning'>,

  /** A URL source part. */
  sourceUrl: (args: PartArgs<DATA, TOOLS, 'source-url'>): PartOf<DATA, TOOLS, 'source-url'> =>
    ({ type: 'source-url', ...args }) as PartOf<DATA, TOOLS, 'source-url'>,

  /** A document source part. */
  sourceDocument: (args: PartArgs<DATA, TOOLS, 'source-document'>): PartOf<DATA, TOOLS, 'source-document'> =>
    ({ type: 'source-document', ...args }) as PartOf<DATA, TOOLS, 'source-document'>,

  /** A file part referencing a file by URL. */
  file: (args: PartArgs<DATA, TOOLS, 'file'>): PartOf<DATA, TOOLS, 'file'> =>
    ({ type: 'file', ...args }) as PartOf<DATA, TOOLS, 'file'>,

  /** A step boundary part. */
  stepStart: (): PartOf<DATA, TOOLS, 'step-start'> => ({ type: 'step-start' }) as PartOf<DATA, TOOLS, 'step-start'>,

  /** A `data-${name}` part carrying a typed custom data payload. */
  data: <NAME extends keyof DATA & string>(
    name: NAME,
    data: DATA[NAME],
    opts: { id?: string } = {},
  ): PartOf<DATA, TOOLS, `data-${NAME}`> =>
    ({ type: `data-${name}`, data, ...opts }) as unknown as PartOf<DATA, TOOLS, `data-${NAME}`>,

  /** A `tool-${name}` invocation part, typed by the tool set. The `state` discriminates the invocation. */
  tool: <NAME extends keyof TOOLS & string>(
    name: NAME,
    invocation: UIToolInvocation<TOOLS[NAME]>,
  ): PartOf<DATA, TOOLS, `tool-${NAME}`> =>
    ({ type: `tool-${name}`, ...invocation }) as PartOf<DATA, TOOLS, `tool-${NAME}`>,

  /** A `dynamic-tool` invocation part for tools whose types are not known at development time. */
  dynamicTool: (args: PartArgs<DATA, TOOLS, 'dynamic-tool'>): PartOf<DATA, TOOLS, 'dynamic-tool'> =>
    ({ type: 'dynamic-tool', ...args }) as PartOf<DATA, TOOLS, 'dynamic-tool'>,
});

/** Builders for `UIMessagePart`s, with loose default types. Use `fromUIMessage` to bind to a message type. */
export const UIParts = createUIParts();
