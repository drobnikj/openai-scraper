import { describe, expect, test } from '@jest/globals';
import { shrinkHtml } from '../src/processors';
import { readFile, writeFile } from 'node:fs/promises';

describe('html', () => {
    test('shrink html', async () => {
        const html = await readFile('test/fixtures/apify.html', 'utf-8');
        const shrinkHtmlResult = shrinkHtml(html);
        await writeFile('test/fixtures/apify.shrink.html', shrinkHtmlResult);
    });
});
