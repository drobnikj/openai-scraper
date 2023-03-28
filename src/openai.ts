import { encode } from 'gpt-3-encoder';
import { Configuration, OpenAIApi } from 'openai';
import { OpenaiAPIError } from './errors.js';

export const getOpenAIClient = (apiKey: string) => {
    const configuration = new Configuration({
        apiKey,
    });
    return new OpenAIApi(configuration);
};

interface GPTModelConfig {
    maxTokens: number;
    interface: 'text' | 'chat';
}

export const GPT_MODEL_LIST: {[key: string]: GPTModelConfig} = {
    'text-davinci-003': {
        maxTokens: 4097,
        interface: 'text',
    },
    'gpt-3.5-turbo': {
        maxTokens: 4096,
        interface: 'chat',
    },
    'text-davinci-002': {
        maxTokens: 4096,
        interface: 'text',
    },
    'code-davinci-002': {
        maxTokens: 8001,
        interface: 'text',
    },
    'gpt-4': {
        maxTokens: 8192,
        interface: 'chat',
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
    return {
        model,
        ...modelConfig,
    };
};

export const rethrowOpenaiError = (error: any) => {
    if (error?.response?.data?.error) {
        return new OpenaiAPIError(error.response.data.error.message);
    }
    return error;
};
