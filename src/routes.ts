import { Dataset, createPlaywrightRouter } from 'crawlee';
import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
export const router = createPlaywrightRouter();

const MAX_PROMPT_LENGTH = 1 * 4000;

export const shrinkHtml = (html: string) => {
    return html.replace(/<script.*?<\/script>/g, '').replace(/<style.*?<\/style>/g, '');
};

router.addDefaultHandler(async ({ enqueueLinks, log, page, request }) => {
    log.info(`enqueueing new URLs`);
    await enqueueLinks({
        globs: ['https://example.com/*'],
    });

    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });

    try {
        const html = await page.content();
        console.log(html.length);
        const updatedHtml = shrinkHtml(html);
        console.log(updatedHtml.length);
        await Dataset.pushData({
            updatedHtml
        });
        const prompt = `Get page product name and product price the html page.\`\`\`${updatedHtml}\`\`\``;
        const completion = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: prompt,
        });

        const completion2 = await openai.createCompletion({
            model: 'text-ada-001',
            prompt: prompt,
        });

        console.log(completion.data.choices[0].text);
        console.log(completion2.data.choices[0].text);
        await Dataset.pushData({
            url: request.loadedUrl,
            content: completion.data,
            content2: completion2.data,
        });
    } catch (err) {
        console.error(err);
        throw err;
    }
});

// router.addHandler('detail', async ({ request, page, log }) => {
//
// });
