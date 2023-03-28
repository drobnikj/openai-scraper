import { ProxyConfigurationOptions, GlobInput, RequestOptions } from '@crawlee/core';

/**
 * Input schema in TypeScript format.
 */
export interface Consts {
    startUrls: RequestOptions[];
    globs: GlobInput[];
    linkSelector?: string;
    instructions: string;
    openaiApiKey?: string;
    model: string;
    targetSelector?: string;
    content?: string;
    maxPagesPerCrawl: number;
    proxyConfiguration: ProxyConfigurationOptions;
}

export const HTML_TAGS_TO_IGNORE = ['script', 'style', 'noscript'];
