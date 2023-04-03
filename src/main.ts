import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset, log } from 'crawlee';
import { createRequestDebugInfo } from '@crawlee/utils';
import { Input } from './input.js';
import {
    processInstructions,
    getNumberOfTextTokens,
    getOpenAIClient,
    validateGPTModel,
    rethrowOpenaiError,
    OpenaiAPIUsage,
} from './openai.js';
import {
    chunkTextByTokenLenght,
    htmlToMarkdown,
    htmlToText,
    shortsTextByTokenLength,
    shrinkHtml,
    tryToParseJsonFromString,
} from './processors.js';

// We used just one model and markdown content to simplify pricing, but we can test with other models and contents, but it cannot be set in input for now.
const DEFAULT_OPENAI_MODEL = 'gpt-3.5-turbo';
const DEFAULT_CONTENT = 'markdown';

const MAX_REQUESTS_PER_CRAWL = 100;

const MERGE_DOCS_SEPARATOR = '----';

// TODO: We can make this configurable
const MERGE_INSTRUCTIONS = `Merge the following text separated by ${MERGE_DOCS_SEPARATOR} into a single text. The final text should have same format.`;

// Initialize the Apify SDK
await Actor.init();

if (!process.env.OPENAI_API_KEY) {
    await Actor.fail('OPENAI_API_KEY is not set!');
}

const input = await Actor.getInput() as Input;

if (!input) throw new Error('INPUT cannot be empty!');
// @ts-ignore
const openai = await getOpenAIClient(process.env.OPENAI_API_KEY, process.env.OPENAI_ORGANIZATION_ID);
const modelConfig = validateGPTModel(input.model || DEFAULT_OPENAI_MODEL);

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            // TODO: Just headless
            headless: true,
        },
    },
    sessionPoolOptions: {
        blockedStatusCodes: [401, 429],
    },
    preNavigationHooks: [
        async ({ blockRequests }) => {
            // By default blocks [".css", ".jpg", ".jpeg", ".png", ".svg", ".gif", ".woff", ".pdf", ".zip"]
            await blockRequests();
        },
    ],
    // NOTE: GPT-4 is very slow, so we need to increase the timeout
    requestHandlerTimeoutSecs: 3 * 60,
    proxyConfiguration: input.proxyConfiguration && await Actor.createProxyConfiguration(input.proxyConfiguration),
    maxRequestsPerCrawl: input.maxPagesPerCrawl || MAX_REQUESTS_PER_CRAWL,

    async requestHandler({ request, page, enqueueLinks }) {
        const { depth = 0 } = request.userData;
        log.info(`Opening ${request.url}...`);

        // Enqueue links
        // If maxCrawlingDepth is not set or 0 the depth is infinite.
        const isDepthLimitReached = !!input.maxCrawlingDepth && depth < input.maxCrawlingDepth;
        if (input.linkSelector && input?.globs?.length && !isDepthLimitReached) {
            const { processedRequests } = await enqueueLinks({
                selector: input.linkSelector,
                globs: input.globs,
                userData: {
                    depth: depth + 1,
                },
            });
            const enqueuedLinks = processedRequests.filter(({ wasAlreadyPresent }) => !wasAlreadyPresent);
            const alreadyPresentLinksCount = processedRequests.length - enqueuedLinks.length;
            log.info(
                `Page ${request.url} enqueued ${enqueuedLinks.length} new URLs.`,
                { foundLinksCount: enqueuedLinks.length, enqueuedLinksCount: enqueuedLinks.length, alreadyPresentLinksCount },
            );
        }

        // A function to be evaluated by Playwright within the browser context.
        const originalContentHtml = input.targetSelector
            ? await page.$eval(input.targetSelector, (el) => el.innerHTML)
            : await page.content();

        let pageContent = '';
        const content = input.content || DEFAULT_CONTENT;
        switch (content) {
            case 'markdown':
                pageContent = htmlToMarkdown(originalContentHtml);
                break;
            case 'text':
                pageContent = htmlToText(originalContentHtml);
                break;
            case 'html':
            default:
                pageContent = shrinkHtml(originalContentHtml);
                break;
        }
        const contentTokenLength = getNumberOfTextTokens(pageContent);
        const instructionTokenLength = getNumberOfTextTokens(input.instructions);

        let answer = '';
        const openaiUsage = new OpenaiAPIUsage(modelConfig.model);
        if (contentTokenLength > modelConfig.maxTokens) {
            if (input.longContentConfig === 'skip') {
                log.info(
                    `Skipping page ${request.url} because content is too long for the ${modelConfig.model} model.`,
                    { contentLength: pageContent.length, contentTokenLength, url: content },
                );
                return;
            } if (input.longContentConfig === 'truncate') {
                const contentMaxTokens = (modelConfig.maxTokens * 0.9) - instructionTokenLength; // 10% buffer for answer
                const truncatedContent = shortsTextByTokenLength(pageContent, contentMaxTokens);
                log.info(
                    `Processing page ${request.url} with truncated text using GPT instruction...`,
                    { originalContentLength: pageContent.length, contentLength: truncatedContent.length, contentMaxTokens, contentFormat: content },
                );
                const prompt = `${input.instructions}\`\`\`${truncatedContent}\`\`\``;
                log.debug(
                    `Truncated content for ${request.url}`,
                    { promptTokenLength: getNumberOfTextTokens(prompt), contentMaxTokens, truncatedContentLength: getNumberOfTextTokens(truncatedContent) },
                );
                try {
                    const answerResult = await processInstructions({ prompt, openai, modelConfig });
                    answer = answerResult.answer;
                    openaiUsage.logApiCallUsage(answerResult.usage);
                } catch (err: any) {
                    throw rethrowOpenaiError(err);
                }
            } else if (input.longContentConfig === 'split') {
                const contentMaxTokens = (modelConfig.maxTokens * 0.9) - instructionTokenLength; // 10% buffer for answer
                const pageChunks = chunkTextByTokenLenght(pageContent, contentMaxTokens);
                log.info(
                    `Processing page ${request.url} with split text using GPT instruction...`,
                    { originalContentLength: pageContent.length, contentMaxTokens, chunksLength: pageChunks.length, contentFormat: content },
                );
                const promises = [];
                for (const contentPart of pageChunks) {
                    const prompt = `${input.instructions}\`\`\`${contentPart}\`\`\``;
                    log.debug(
                        `Chunk content for ${request.url}`,
                        {
                            promptTokenLength: getNumberOfTextTokens(prompt),
                            contentMaxTokens,
                            truncatedContentPartLength: getNumberOfTextTokens(contentPart),
                            pageChunksCount: pageChunks.length,
                        },
                    );
                    promises.push(processInstructions({ prompt, openai, modelConfig }));
                }
                try {
                    const answerList = await Promise.all(promises);
                    const joinAnswers = answerList.map(({ answer: a }) => a).join(`\n\n${MERGE_DOCS_SEPARATOR}\n\n`);
                    answerList.forEach(({ usage }) => openaiUsage.logApiCallUsage(usage));
                    const mergePrompt = `${MERGE_INSTRUCTIONS}\n${joinAnswers}`;
                    log.debug(
                        `Merge instructions for ${request.url}`,
                        { promptTokenLength: getNumberOfTextTokens(mergePrompt), joinAnswersTokenLength: getNumberOfTextTokens(joinAnswers) },
                    );
                    const answerResult = await processInstructions({ prompt: mergePrompt, openai, modelConfig });
                    answer = answerResult.answer;
                    openaiUsage.logApiCallUsage(answerResult.usage);
                } catch (err: any) {
                    throw rethrowOpenaiError(err);
                }
            }
        } else {
            log.info(
                `Processing page ${request.url} with GPT instruction...`,
                { contentLength: pageContent.length, contentTokenLength, contentFormat: content },
            );
            const prompt = `${input.instructions}\`\`\`${pageContent}\`\`\``;
            try {
                const answerResult = await processInstructions({ prompt, openai, modelConfig });
                answer = answerResult.answer;
                openaiUsage.logApiCallUsage(answerResult.usage);
            } catch (err: any) {
                throw rethrowOpenaiError(err);
            }
        }

        if (!answer) {
            log.error('No answer was returned.', { url: request.url });
            return;
        }
        if (answer.toLocaleLowerCase().includes('skip this page')) {
            log.info(`Skipping page ${request.url} from output, the key word "skip this page" was found in answer.`, { answer });
            return;
        }

        log.info(`Page ${request.url} processed.`, {
            openaiUsage: openaiUsage.usage,
            usdUsage: openaiUsage.finalCostUSD,
            apiCallsCount: openaiUsage.apiCallsCount,
        });

        // Store the results
        await Dataset.pushData({
            url: request.loadedUrl,
            answer,
            jsonAnswer: tryToParseJsonFromString(answer),
            '#debug': {
                model: modelConfig.model,
                openaiUsage: openaiUsage.usage,
                usdUsage: openaiUsage.finalCostUSD,
                apiCallsCount: openaiUsage.apiCallsCount,
            },
        });
    },

    async failedRequestHandler({ request }, error: Error) {
        const errorMessage = error.message || 'no error';
        log.error(`Request ${request.url} failed and will not be retried anymore. Marking as failed.\nLast Error Message: ${errorMessage}`);
        if (error.name === 'UserFacedError') {
            await Dataset.pushData({
                url: request.loadedUrl,
                answer: `ERROR: ${errorMessage}`,
            });
            return;
        }
        await Dataset.pushData({
            '#error': true,
            '#debug': createRequestDebugInfo(request),
        });
    },
});

await crawler.run(input.startUrls);
log.info('Configuration completed. Starting the scrape.');
await crawler.run();
log.info(`Crawler finished.`);

// Exit successfully
await Actor.exit();
