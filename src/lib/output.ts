import type { OutputOptions } from '../types/index.js';
import { convertMilliunitsToAmounts } from './utils.js';

let globalOutputOptions: OutputOptions = {};

export function setOutputOptions(options: OutputOptions): void {
  globalOutputOptions = options;
}

export function outputJson(data: unknown, options: OutputOptions = {}): void {
  const convertedData = convertMilliunitsToAmounts(data);
  const mergedOptions = { ...globalOutputOptions, ...options };
  const jsonString = mergedOptions.compact
    ? JSON.stringify(convertedData)
    : JSON.stringify(convertedData, null, 2);

  console.log(jsonString);
}

export function outputError(error: { name: string; detail: string; statusCode: number }): void {
  const jsonString = globalOutputOptions.compact
    ? JSON.stringify({ error })
    : JSON.stringify({ error }, null, 2);

  console.error(jsonString);
}
