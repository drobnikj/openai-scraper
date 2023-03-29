import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset, log } from 'crawlee';
import { createRequestDebugInfo } from '@crawlee/utils';
import { Consts } from './consts.js';
import {
    getNumberOfTextTokens,
    getOpenAIClient,
    validateGPTModel,
    rethrowOpenaiError,
} from './openai.js';
import { htmlToMarkdown, htmlToText, shrinkHtml } from './processors.js';
import { UserFacedError } from './errors.js';

const MAX_REQUESTS_PER_CRAWL = 100;

// Initialize the Apify SDK
await Actor.init();

const input = await Actor.getInput() as Consts;

if (!input) throw new Error('INPUT cannot be empty!');
// @ts-ignore
const openai = await getOpenAIClient(input.openaiApiKey || process.env.OPENAI_API_KEY);
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

        if (contentTokenLength > modelConfig.maxTokens) {
            // TODO: Some explanation what user can with long content.
            const message = `Page content is too long for the ${input.model}. Model can handle up to ${modelConfig.maxTokens} tokens.`;
            log.error(message);
            throw new UserFacedError(message);
        }

        log.info(
            `Processing page ${request.url} with OpenAI instruction...`,
            { contentLength: pageContent.length, contentTokenLength, contentFormat: input.content },
        );

        const prompt = `${input.instructions}\`\`\`${pageContent}\`\`\``;
        let answer = '';
        try {
            if (modelConfig.interface === 'text') {
                const completion = await openai.createCompletion({
                    model: modelConfig.model,
                    prompt,
                    max_tokens: modelConfig.maxTokens - contentTokenLength - 1,
                });
                answer = completion?.data?.choices[0]?.text || '';
            } else if (modelConfig.interface === 'chat') {
                const conversation = await openai.createChatCompletion({
                    model: modelConfig.model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                });
                answer = conversation?.data?.choices[0]?.message?.content || '';
            } else {
                throw new Error(`Unsupported interface ${modelConfig.interface}`);
            }
            if (!answer) throw new Error('No answer was returned.');
            if (answer.toLocaleLowerCase().includes('skip this page')) {
                log.info(`Skipping page ${request.url} from output, the key word "skip this page" was found in answer.`);
                return;
            }
        } catch (err: any) {
            throw rethrowOpenaiError(err);
        }

        // Store the results
        await Dataset.pushData({
            url: request.loadedUrl,
            answer,
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
