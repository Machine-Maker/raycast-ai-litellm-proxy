import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import imageType from 'image-type';
import {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources';
import { z } from 'zod/v4';

const RaycastRequestTool = z.discriminatedUnion('type', [
  z.object({
    name: z.string(),
    type: z.literal('remote_tool'),
  }),
  z.object({
    type: z.literal('local_tool'),
    function: z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.string(), z.any()).transform((value) => {
        if (Object.keys(value).length === 0) {
          return {
            type: 'object',
            properties: {},
            required: [],
          };
        }
        return value;
      }),
    }),
  }),
]);
type RaycastRequestTool = z.infer<typeof RaycastRequestTool>;

export const OllamaChatMessage = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  images: z.array(z.string()).optional(),
  content: z.string(),
  tool_calls: z
    .array(
      z.record(
        z.literal('function'),
        z.object({
          name: z.string(),
          arguments: z.record(z.string(), z.any()),
        }),
      ),
    )
    .optional(),
});
type OllamaChatMessage = z.infer<typeof OllamaChatMessage>;

export const OllamaChatRequest = z.object({
  model: z.string(),
  messages: z.array(OllamaChatMessage),
  tools: z.array(RaycastRequestTool).default([]),
});

export interface OllamaChunkResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: {
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }[];
  };
  done: boolean;
  done_reason?: 'stop' | 'tool_calls';
}

export function makeOllamaChunk(
  model: string,
  content: string,
  done: boolean,
  done_reason?: OllamaChunkResponse['done_reason'],
  toolCalls?: Record<number, ChatCompletionChunk.Choice.Delta.ToolCall>,
): OllamaChunkResponse {
  // Convert tools to Ollama format
  const finalToolCalls: OllamaChunkResponse['message']['tool_calls'] = [];
  if (toolCalls) {
    for (const key in toolCalls) {
      const tc = toolCalls[key];
      if (!tc.function?.name) {
        continue;
      }

      const args = tc.function.arguments || '{}';
      try {
        const parsedArgs = JSON.parse(args);
        finalToolCalls.push({
          function: {
            name: tc.function.name,
            arguments: parsedArgs,
          },
        });
      } catch {
        continue;
      }
    }
  }

  return {
    model,
    created_at: new Date().toISOString(),
    message: {
      role: 'assistant',
      content,
      tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
    },
    done,
    done_reason,
  };
}

async function detectImageMimeType(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const result = await imageType(buffer);
  return result?.mime ?? 'image/jpeg';
}

export async function convertOllamaMessagesToOpenAI(
  messages: OllamaChatMessage[],
): Promise<ChatCompletionMessageParam[]> {
  // Store all tool call IDs in order
  const toolCallIds: string[] = [];

  const makeToolCallId = (): string => {
    return randomBytes(5).toString('hex').slice(0, 9);
  };

  return Promise.all(
    messages.map(async (msg): Promise<ChatCompletionMessageParam> => {
      // Handle tool calls in assistant messages
      if (msg.role === 'assistant' && msg.tool_calls) {
        // Clear previous tool call IDs and generate new ones
        toolCallIds.length = 0;

        return {
          role: 'assistant',
          content: msg.content,
          tool_calls: msg.tool_calls.map((tc) => {
            const toolCallId = makeToolCallId();
            toolCallIds.push(toolCallId); // Store each tool call ID
            return {
              id: toolCallId,
              type: 'function',
              function: {
                name: tc.function.name,
                arguments: JSON.stringify(tc.function.arguments),
              },
            };
          }),
        };
      }

      // Handle tool responses
      if (msg.role === 'tool') {
        // Use the next available tool call ID in sequence
        const toolCallId = toolCallIds.shift() || makeToolCallId();
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: toolCallId,
        };
      }

      // Handle images if present
      if (msg.images && msg.images.length > 0 && msg.role === 'user') {
        const imageParts = await Promise.all(
          msg.images.map(async (img) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${await detectImageMimeType(img)};base64,${img}` },
          })),
        );
        return {
          role: 'user',
          content: [{ type: 'text', text: msg.content }, ...imageParts],
        };
      }

      // Handle regular messages
      return {
        role: msg.role,
        content: msg.content,
      };
    }),
  );
}

export function convertRaycastToolsToOpenAI(
  raycastTools?: RaycastRequestTool[],
): ChatCompletionTool[] | undefined {
  const filteredTools = raycastTools?.filter((tool) => tool.type === 'local_tool');

  if (!filteredTools || filteredTools.length === 0) {
    return undefined;
  }

  return filteredTools.map((tool) => {
    return {
      type: 'function',
      function: tool.function,
    };
  });
}

export function makeSSEMessage(message: OllamaChunkResponse): string {
  return `${JSON.stringify(message)}\n\n`;
}
