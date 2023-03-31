import { convert } from 'html-to-text';
import { htmlToMarkdownProcessor } from './markdown.js';
import { HTML_TAGS_TO_IGNORE } from './input.js';
import { getNumberOfTextTokens } from './openai.js';

/**
 * Converts HTML to text
 * @param html
 */
export const htmlToText = (html: string) => {
    const options: any = {
        wordwrap: false,
        selectors: HTML_TAGS_TO_IGNORE.map((tag) => ({ selector: tag, format: 'skip' })),
        // ignoreHref: true, // ignore href targets
    };
    const text = convert(html, options);
    return text
        .replace(/\n{2,}/g, '\n\n'); // remove extra new lines
};

/**
 * Shrinks HTML by removing script, style and no script tags and whitespaces
 * @param html
 */
export const shrinkHtml = (html: string) => {
    return html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/g, '') // remove all script tags
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/g, '') // remove all style tags
        .replace(/<noscript[\s\S]*?>[\s\S]*?<\/noscript>/g, '') // remove all no script tags
        .replace(/\n/g, '') // remove all new lines
        .replace(/\s{2,}/g, ' ') // remove extra spaces
        .replace(/>\s+</g, '><'); // remove all spaces between tags
};

/**
 * Converts HTML to markdown
 * @param html
 */
export const htmlToMarkdown = (html: string) => {
    return htmlToMarkdownProcessor.turndown(html);
};

export const chunkText = (text: string, maxLength: number) => {
    const chunks: string[] = [];
    let chunk = '';
    for (const line of text.split('\n')) {
        if (chunk.length + line.length > maxLength) {
            chunks.push(chunk);
            chunk = '';
        }
        chunk += `${line}\n`;
    }
    chunks.push(chunk);
    return chunks;
};

export const shortsText = (text: string, maxTokenLength: number) => {
    let shortText = '';
    for (const line of text.split('\n')) {
        if (getNumberOfTextTokens(shortText) + getNumberOfTextTokens(line) > maxTokenLength) {
            break;
        }
        shortText += `${line}\n`;
    }
    return shortText;
};
