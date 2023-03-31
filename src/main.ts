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
import { chunkText, htmlToMarkdown, htmlToText, shortsText, shrinkHtml } from './processors.js';

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
const openai = await getOpenAIClient(process.env.OPENAI_API_KEY);
const modelConfig = validateGPTModel(input.model);

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            // TODO: Just headless
            headless: true,
        },
    },
    proxyConfiguration: input.proxyConfiguration && await Actor.createProxyConfiguration(input.proxyConfiguration),
    maxRequestsPerCrawl: input.maxPagesPerCrawl || MAX_REQUESTS_PER_CRAWL,

    async requestHandler({ request, page, enqueueLinks }) {
        log.info(`Opening ${request.url}...`);

        // Enqueue links
        const { processedRequests } = await enqueueLinks({
            selector: input.linkSelector || 'a[href]',
            globs: input.globs,
        });
        const enqueuedLinks = processedRequests.filter(({ wasAlreadyPresent }) => !wasAlreadyPresent);
        const alreadyPresentLinksCount = processedRequests.length - enqueuedLinks.length;
        log.info(
            `Page ${request.url} enqueued ${enqueuedLinks.length} new URLs.`,
            { foundLinksCount: enqueuedLinks.length, enqueuedLinksCount: enqueuedLinks.length, alreadyPresentLinksCount },
        );

        // A function to be evaluated by Playwright within the browser context.
        const originalContentHtml = input.targetSelector
            ? await page.$eval(input.targetSelector, (el) => el.innerHTML)
            : await page.content();

        let pageContent = '';
        switch (input.content) {
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

        let answer = '';
        const openaiUsage = new OpenaiAPIUsage(input.model);
        if (contentTokenLength > modelConfig.maxTokens) {
            if (input.longContentConfig === 'skip') {
                log.info(
                    `Skipping page ${request.url} because content is too long for the ${input.model} model.`,
                    { contentLength: pageContent.length, contentTokenLength, url: input.content },
                );
                return;
            } if (input.longContentConfig === 'shorten') {
                const contentMaxTokens = modelConfig.maxTokens * 0.9; // 10% buffer for answer
                const shortenContent = shortsText(pageContent, contentMaxTokens);
                log.info(
                    `Processing page ${request.url} with shorten text using GPT instruction...`,
                    { originalContentLength: pageContent.length, contentLength: shortenContent.length, contentMaxTokens, contentFormat: input.content },
                );
                const prompt = `${input.instructions}\`\`\`${shortenContent}\`\`\``;
                try {
                    const answerResult = await processInstructions({ prompt, openai, modelConfig });
                    answer = answerResult.answer;
                    openaiUsage.logApiCallUsage(answerResult.usage);
                } catch (err: any) {
                    throw rethrowOpenaiError(err);
                }
            } else if (input.longContentConfig === 'split') {
                const contentMaxTokens = modelConfig.maxTokens * 0.9; // 10% buffer for answer
                const pageChunks = chunkText(pageContent, contentMaxTokens);
                log.info(
                    `Processing page ${request.url} with split text using GPT instruction...`,
                    { originalContentLength: pageContent.length, contentMaxTokens, chunksLength: pageChunks.length, contentFormat: input.content },
                );
                const promises = [];
                for (const contentPart of pageChunks) {
                    const prompt = `${input.instructions}\`\`\`${contentPart}\`\`\``;
                    promises.push(processInstructions({ prompt, openai, modelConfig }));
                }
                try {
                    const answerList = await Promise.all(promises);
                    const joinAnswers = answerList.map(({ answer: a }) => a).join(`\n\n${MERGE_DOCS_SEPARATOR}\n\n`);
                    answerList.forEach(({ usage }) => openaiUsage.logApiCallUsage(usage));
                    const mergePrompt = `${MERGE_INSTRUCTIONS}\n${joinAnswers}`;
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
                { contentLength: pageContent.length, contentTokenLength, contentFormat: input.content },
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
            '#debug': {
                model: input.model,
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
