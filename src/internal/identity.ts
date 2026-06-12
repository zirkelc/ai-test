/** Shared identity helpers for the mock models, so every family auto-assigns a unique model id. */

/** Default provider id for mock models. */
export const defaultProvider = 'mock-provider';

/** Monotonic counter backing the auto-generated model ids, shared across all model families. */
let modelCounter = 0;

/** Returns the next unique auto-generated model id, e.g. `mock-model-1`. */
export const nextModelId = (): string => {
  modelCounter += 1;
  return `mock-model-${modelCounter}`;
};
