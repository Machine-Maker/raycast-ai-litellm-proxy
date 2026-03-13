import { ModelConfig } from './models.js';

export class ModelStore {
  private modelMap = new Map<string, ModelConfig>();
  private models: ModelConfig[] = [];

  constructor(models: ModelConfig[]) {
    this.updateModels(models);
  }

  updateModels(models: ModelConfig[]): void {
    this.models = models;
    this.modelMap.clear();

    for (const model of models) {
      this.modelMap.set(model.name, model);
    }
  }

  findByName(modelName: string): ModelConfig | undefined {
    return this.modelMap.get(modelName);
  }

  getAll(): ModelConfig[] {
    return [...this.models];
  }

  size(): number {
    return this.models.length;
  }
}
