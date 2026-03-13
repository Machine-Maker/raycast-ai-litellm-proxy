import { NextFunction, Request, Response } from 'express';
import { generateModelsList, generateModelInfo } from '../data/models.js';
import { ModelNotFoundError } from '../errors/custom-errors.js';
import { AppContext } from '../app.js';
import {
  convertOllamaMessagesToOpenAI,
  convertRaycastToolsToOpenAI,
  makeOllamaChunk,
  makeSSEMessage,
  OllamaChatRequest,
  OllamaChunkResponse,
} from '../util.js';
import { ChatCompletionCreateParamsStreaming, ChatCompletionChunk } from 'openai/resources';
import { z } from 'zod/v4';

export interface ApiController {
  getTags(req: Request, res: Response, next: NextFunction): void;
  getModelInfo(req: Request, res: Response, next: NextFunction): void;
  chatCompletion(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const makeApiController = ({
  openai,
  models,
  modelStore,
  config,
}: AppContext): ApiController => {
  return {
    getTags: (req, res) => {
      res.send(generateModelsList(models));
    },

    getModelInfo: (req, res) => {
      const { model } = z.object({ model: z.string() }).parse(req.body);
      const modelInfo = generateModelInfo(models, model);
      res.send(modelInfo);
    },

    chatCompletion: async (req, res) => {
      const { messages, model: requestedModel, tools } = OllamaChatRequest.parse(req.body);

      const modelConfig = modelStore.findByName(requestedModel);

      if (!modelConfig) {
        throw new ModelNotFoundError(requestedModel);
      }

      const openaiMessages = await convertOllamaMessagesToOpenAI(messages);
      const openaiTools = convertRaycastToolsToOpenAI(tools);

      const chatConfig: ChatCompletionCreateParamsStreaming = {
        ...modelConfig.extra,
        model: modelConfig.id,
        messages: openaiMessages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: modelConfig.temperature,
        top_p: modelConfig.topP,
        max_completion_tokens: modelConfig.max_tokens,
        ...(openaiTools && { tools: openaiTools }),
      };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { messages: _, ...configWithoutMessages } = chatConfig;
      req.log.info({ configWithoutMessages }, 'ChatCompletionRequest');

      let pingInterval: NodeJS.Timeout | undefined = undefined;
      const abortController = new AbortController();

      const cleanup = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = undefined;
        }
        req.log.info('ConnectionCleanup');
      };

      try {
        const stream = await openai.chat.completions.create(chatConfig, {
          signal: abortController.signal,
        });

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        pingInterval = setInterval(() => {
          res.write('\n');
          req.log.info('ConnectionPing');
        }, config.pingInterval);

        res.on('close', () => {
          cleanup();
        });

        const finalToolCalls: Record<number, ChatCompletionChunk.Choice.Delta.ToolCall> = {};
        let finish_reason: OllamaChunkResponse['done_reason'] = undefined;

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          const toolCalls = chunk.choices[0]?.delta?.tool_calls;

          if (content) {
            const ollamaChunk = makeOllamaChunk(requestedModel, content, false);
            res.write(makeSSEMessage(ollamaChunk));
          }

          if (toolCalls) {
            for (const toolCall of toolCalls) {
              const { index } = toolCall;

              if (!finalToolCalls[index]) {
                finalToolCalls[index] = {
                  index: toolCall.index,
                  id: toolCall.id,
                  type: toolCall.type,
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: toolCall.function?.arguments || '',
                  },
                };
              } else {
                if (finalToolCalls[index]?.function) {
                  finalToolCalls[index].function.arguments += toolCall.function?.arguments || '';
                }
              }
            }
          }

          const reason = chunk.choices[0]?.finish_reason;
          if (reason) {
            if (reason === 'stop' || reason === 'tool_calls') {
              finish_reason = reason;
            } else {
              finish_reason = 'stop';
            }
          }

          if (chunk.usage) {
            req.log.info({ usage: chunk.usage }, 'CompletionUsage');
          }
        }

        // Send final chunk with tool calls
        const finalChunk = makeOllamaChunk(requestedModel, '', true, finish_reason, finalToolCalls);
        res.write(makeSSEMessage(finalChunk));
        res.end();
      } catch (error) {
        req.log.error(error, 'ChatCompletionError');
        if (!res.headersSent) {
          throw error;
        }
      } finally {
        cleanup();
      }
    },
  };
};
