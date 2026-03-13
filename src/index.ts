import OpenAI from 'openai';
import { makeApp } from './app.js';
import { getConfig } from './config.js';
import { loadModels } from './data/models.js';
import { ModelStore } from './data/model-store.js';
import { makeLogger } from './logger.js';
import { makeMiddleware } from './middleware/index.js';

async function main() {
  const config = getConfig();
  const logger = makeLogger();

  // Load models from LiteLLM
  const models = await loadModels(config.baseUrl, config.apiKey, config.modelRefreshInterval);
  const modelStore = new ModelStore(models);

  const middleware = makeMiddleware(logger);
  const openai = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });
  const app = makeApp({ config, middleware, models, modelStore, openai });

  app.listen(config.port, () => {
    logger.info(`Server is up on port ${config.port}`);
    logger.info(`Loaded ${models.length} models from LiteLLM`);
  });
}

main().catch((error) => {
  console.log(error);
  process.exit(1);
});
