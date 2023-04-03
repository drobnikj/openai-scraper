import { convert } from 'html-to-text';
import { htmlToMarkdownProcessor } from './markdown.js';
import { HTML_TAGS_TO_IGNORE } from './input.js';
import { getNumberOfTextTokens } from './openai.js';

const JSON_REGEX = /\{(?:[^{}]|())*\}/;

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
        .replace(/<path[\s\S]*?>[\s\S]*?<\/path>/g, '') // remove all no script tags
        .replace(/xlink:href="([^"]*)"/g, '') // remove all no script tags
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

const chunkText = (text:string, maxLength: number) => {
    const numChunks = Math.ceil(text.length / maxLength);
    const chunks = new Array(numChunks);

    for (let i = 0, o = 0; i < numChunks; ++i, o += maxLength) {
        chunks[i] = text.substr(o, maxLength);
    }

    return chunks;
};

export const chunkTextByTokenLenght = (text: string, maxTokenLength: number) => {
    const chunks: string[] = [];
    let chunk = '';
    for (const textPart of chunkText(text, 100)) {
        if (getNumberOfTextTokens(chunk) + getNumberOfTextTokens(textPart) < maxTokenLength) {
            chunk += textPart;
        } else {
            chunks.push(chunk);
            chunk = textPart;
        }
    }
    chunks.push(chunk);
    return chunks;
};

export const shortsTextByTokenLength = (text: string, maxTokenLength: number) => {
    let shortText = '';
    for (const textPart of chunkText(text, 100)) {
        if (getNumberOfTextTokens(shortText) + getNumberOfTextTokens(textPart) < maxTokenLength) {
            shortText += textPart;
        } else {
            break;
        }
    }
    return shortText;
};

export const tryToParseJsonFromString = (str: string) => {
    try {
        return JSON.parse(str);
    } catch (err) {
        // Let's try to match json in text
        const jsonMatch = str.match(JSON_REGEX);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (err2) {
                // Ignore
            }
        }
    }
    return null;
};
