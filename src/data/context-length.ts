import { DEFAULT_CONTEXT_LENGTH, CONTEXT_LENGTHS } from '../constants.js';

export function getModelContextLength(modelId: string): number {
  if (modelId.includes('claude-3') || modelId.includes('claude-sonnet-4')) {
    return CONTEXT_LENGTHS.CLAUDE_3;
  } else if (
    modelId.includes('gpt-4o') ||
    modelId.includes('deepseek') ||
    modelId.includes('gpt-4o-mini')
  ) {
    return CONTEXT_LENGTHS.GPT_4O;
  } else if (modelId.includes('gemini')) {
    return CONTEXT_LENGTHS.GEMINI;
  } else if (modelId.includes('gpt-4')) {
    return CONTEXT_LENGTHS.GPT_4;
  } else if (modelId.includes('gpt-3.5-turbo')) {
    return CONTEXT_LENGTHS.GPT_3_5_TURBO;
  }

  return DEFAULT_CONTEXT_LENGTH;
}
