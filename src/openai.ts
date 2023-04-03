import { log } from 'crawlee';
import { encode } from 'gpt-3-encoder';
import { Configuration, OpenAIApi, CreateCompletionResponseUsage } from 'openai';
import { OpenaiAPIError } from './errors.js';

export const getOpenAIClient = (apiKey: string, organization?: string) => {
    const configuration = new Configuration({
        apiKey,
        organization,
    });
    return new OpenAIApi(configuration);
};

interface GPTModelConfig {
    model: string;
    maxTokens: number;
    interface: 'text' | 'chat';
    cost?: number; // USD cost per 1000 tokens
}

export const GPT_MODEL_LIST: {[key: string]: GPTModelConfig} = {
    'text-davinci-003': {
        model: 'text-davinci-003',
        maxTokens: 4097,
        interface: 'text',
    },
    'gpt-3.5-turbo': {
        model: 'gpt-3.5-turbo',
        maxTokens: 4097,
        interface: 'chat',
        cost: 0.002,
    },
    'text-davinci-002': {
        model: 'text-davinci-002',
        maxTokens: 4096,
        interface: 'text',
    },
    'code-davinci-002': {
        model: 'code-davinci-002',
        maxTokens: 8001,
        interface: 'text',
    },
    'gpt-4': {
        model: 'gpt-4',
        maxTokens: 8192,
        interface: 'chat',
        cost: 0.03,
    },
};

export const getNumberOfTextTokens = (text: string) => {
    const encodedText = encode(text);
    return encodedText.length;
};

export const validateGPTModel = (model: string) => {
    const modelConfig = GPT_MODEL_LIST[model];
    if (!modelConfig) {
        throw new Error(`Model ${model} is not supported`);
    }
    return modelConfig;
};

export const rethrowOpenaiError = (error: any) => {
    if (error?.response?.data?.error) {
        return new OpenaiAPIError(error.response.data.error.message);
    }
    return error;
};

export const processInstructions = async ({
    modelConfig,
    openai,
    prompt,
} : { modelConfig: GPTModelConfig, openai: OpenAIApi, prompt: string }) => {
    let answer = '';
    let usage = {} as CreateCompletionResponseUsage;
    const promptTokenLength = getNumberOfTextTokens(prompt);
    const maxTokens = modelConfig.maxTokens - promptTokenLength - 150;
    log.debug(`Calling Openai API with model ${modelConfig.model}`, { promptTokenLength });
    if (modelConfig.interface === 'text') {
        const completion = await openai.createCompletion({
            model: modelConfig.model,
            prompt,
            max_tokens: maxTokens,
        });
        answer = completion?.data?.choices[0]?.text || '';
        if (completion?.data?.usage) usage = completion?.data?.usage;
    } else if (modelConfig.interface === 'chat') {
        const conversation = await openai.createChatCompletion({
            model: modelConfig.model,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            max_tokens: maxTokens,
        });
        answer = conversation?.data?.choices[0]?.message?.content || '';
        if (conversation?.data?.usage) usage = conversation?.data?.usage;
    } else {
        throw new Error(`Unsupported interface ${modelConfig.interface}`);
    }
    return {
        answer,
        usage,
    };
};

export class OpenaiAPIUsage {
    model: string;
    apiCallsCount: number;
    usage: CreateCompletionResponseUsage;
    finalCostUSD: number;
    cost: number;
    constructor(model: string) {
        this.model = model;
        this.cost = GPT_MODEL_LIST[model].cost || 0;
        this.apiCallsCount = 0;
        this.finalCostUSD = 0;
        this.usage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
    }

    logApiCallUsage(usage: CreateCompletionResponseUsage) {
        this.apiCallsCount += 1;
        Object.keys(this.usage).forEach((key: string) => {
            // @ts-ignore
            this.usage[key] += usage[key] || 0;
        });
        this.finalCostUSD += this.cost * (usage.total_tokens / 1000);
    }
}
