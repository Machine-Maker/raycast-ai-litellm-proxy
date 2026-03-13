import { ModelConfig } from './models.js';
import { DEFAULT_CAPABILITIES } from '../constants.js';

// Vision model patterns
export const VISION_MODEL_PATTERNS = [
  /gpt-4.*vision/i,
  /gpt-4o/i,
  /claude-3/i,
  /gemini.*pro.*vision/i,
  /gemini.*flash/i,
  /llava/i,
];

export function hasVisionCapability(modelId: string): boolean {
  return VISION_MODEL_PATTERNS.some((pattern) => pattern.test(modelId));
}

export function detectCapabilitiesFromLiteLLM(modelInfo?: {
  supports_function_calling?: boolean | null;
  supports_tool_choice?: boolean | null;
  supports_vision?: boolean | null;
}): ModelConfig['capabilities'] {
  const capabilities: ModelConfig['capabilities'] = [];

  // Use LiteLLM's actual capability flags (most reliable)
  if (modelInfo) {
    if (modelInfo.supports_function_calling === true || modelInfo.supports_tool_choice === true) {
      capabilities.push('tools');
    }
    if (modelInfo.supports_vision === true) {
      capabilities.push('vision');
    }
  }

  // If we don't have any capabilities detected, default to tools for chat models
  if (capabilities.length === 0) {
    capabilities.push('tools');
  }

  return capabilities;
}

export function detectCapabilitiesFromProvider(
  modelName: string,
  provider?: string,
): ModelConfig['capabilities'] {
  const capabilities: ModelConfig['capabilities'] = ['tools']; // Default for chat models

  // Provider-based detection (more reliable than pattern matching)
  if (provider) {
    switch (provider.toLowerCase()) {
      case 'openai':
        if (
          modelName.includes('gpt-4') &&
          (modelName.includes('vision') || modelName.includes('4o'))
        ) {
          capabilities.push('vision');
        }
        break;
      case 'anthropic':
        if (modelName.includes('claude-3')) {
          capabilities.push('vision');
        }
        break;
      case 'vertex_ai':
      case 'gemini':
        if (
          modelName.includes('gemini') &&
          (modelName.includes('pro') || modelName.includes('flash'))
        ) {
          capabilities.push('vision');
        }
        break;
    }
  } else {
    // Fallback to pattern matching if no provider info
    if (hasVisionCapability(modelName)) {
      capabilities.push('vision');
    }
  }

  return capabilities;
}

export function getModelCapabilities(modelId: string): ModelConfig['capabilities'] {
  const capabilities: ModelConfig['capabilities'] = [...DEFAULT_CAPABILITIES];

  if (hasVisionCapability(modelId)) {
    capabilities.push('vision');
  }

  return capabilities;
}
