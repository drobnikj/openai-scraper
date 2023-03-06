const { readFile, writeFile } = require('fs/promises');
const { convert } = require('html-to-text');

const shrinkHtml = (html) => {
    return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/g, '')
    .replace(/\n/g, '').replace(/\s{2,}/g, ' ')
    .replace(/(?:ht|f)tps?:\/\/[-a-zA-Z0-9.]+\.[a-zA-Z]{2,3}(\/[^"<]*)?/g, '12345678')
    .replace(/>\s+</g, '><')
    .replace(/class=".*"/g, '')
};

(async () => {
    try {
        const { convert } = require('html-to-text');
// There is also an alias to `convert` called `htmlToText`.

        const options = {
            wordwrap: null,
            ignoreHref: true,
            // ...
        };
        const html = await readFile('test.html', 'utf-8');;
        const text = convert(html, options);
        console.log(text.length); // Hello World
        await writeFile('text.txt', text);
        const newText = text.replace(/https:\/\/www.alza.cz/g, 'http://a.cz')
        console.log(newText.length); // Hello World
        await writeFile('text2.txt', newText);
        // const data = await readFile('test.html', 'utf-8');
        // console.log(data.length);
        // const updated = shrinkHtml(data)
        // console.log(updated.length);
        // await writeFile('test2.html', updated);
    } catch (err) {
        console.error(err);
    }
})();
