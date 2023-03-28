import TurndownService, { Node, Options, Rule } from 'turndown';
import { HTML_TAGS_TO_IGNORE } from './consts.js';

const cleanWhitespaces = (attribute?: string) => {
    return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : '';
};

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
        return content;
    },
};

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
});
HTML_TAGS_TO_IGNORE.forEach((tag: any) => htmlToMarkdownProcessor.remove(tag));
htmlToMarkdownProcessor.addRule('ignoreHrefSrc', ignoreHrefSrc);
htmlToMarkdownProcessor.addRule('ignoreImageSrc', ignoreImageSrc);
