import TurndownService, { Node, Options, Rule } from 'turndown';
import plugin from 'joplin-turndown-plugin-gfm';
import { HTML_TAGS_TO_IGNORE } from './input.js';

const cleanWhitespaces = (attribute?: string) => {
    return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : '';
};

/**
 * Ignore href attribute in links and replace it with just link content.
 * Instead of [link text](https://example.com) it will be [link text]
 */
const ignoreHrefSrc: Rule = {
    filter(node: Node, options: Options) {
        return (
            options.linkStyle === 'inlined'
            && node.nodeName === 'A'
            // @ts-ignore
            && node.getAttribute('href')
        );
    },
    replacement(content: string) {
        return `[${content}]()`;
    },
};

/**
 * Ignore src attribute in images and replace it with just image alt text.
 * Instead of ![alt text](https://example.com/image.png) it will be ![alt text]
 */
const ignoreImageSrc: Rule = {
    filter: 'img',
    replacement(_content: string, node: Node) {
        // @ts-ignore
        const alt = cleanWhitespaces(node.getAttribute('alt'));
        return alt ? `![${alt}]` : '';
    },
};

export const htmlToMarkdownProcessor = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',

});
HTML_TAGS_TO_IGNORE.forEach((tag: any) => htmlToMarkdownProcessor.remove(tag));
htmlToMarkdownProcessor.use(plugin.gfm); // Use Github Flavored Markdown
// Ignore href and src attributes for save tokens
htmlToMarkdownProcessor.addRule('ignoreHrefSrc', ignoreHrefSrc);
htmlToMarkdownProcessor.addRule('ignoreImageSrc', ignoreImageSrc);
