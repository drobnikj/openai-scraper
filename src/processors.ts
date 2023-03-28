import { convert } from 'html-to-text';
import { htmlToMarkdownProcessor } from './markdown.js';
import { HTML_TAGS_TO_IGNORE } from './consts.js';

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
