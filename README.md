# GPT Scraper

The GPT Scraper is a powerful tool that leverages OpenAI's API to modify text or HTML obtained from a scraper.
You can use the scraper to extract content from a website and then pass that content to the OpenAI API to make the magic.

## Limits

The models themselves have a limit on the number of tokens they can handle, but there is an option to overcome this limit.
You can check the limits for each model on the [OpenAI API documentation](https://platform.openai.com/docs/models/overview).

## Pricing

TBD

## Usage

To get started with GPT Scraper, you need to set up the pages you want to scrape using [**Start URLs**](#start-urls)
and then set up instructions on how the GTP scraper should handle each page. The simplest scraper, which can load the page with
URL https://apify.com instruct GPT to extract information from it will look:

![img.png](img/example_input.png)

You can configure the scraper and GTP using Input configuration if you need to set up a more complex workflow.

## Input Configuration

On input, the GPT Scraper actor accepts some configuration settings.
These can be entered either manually in the user interface in [Apify Console](https://console.apify.com)
or programmatically in a JSON object using the [Apify API](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor).
For a complete list of input fields and their types, please see the outline of the actor's [Input-schema](https://apify.com/apify/playwright-scraper/input-schema).

### Start URLs

The **Start URLs** (`startUrls`) field represent the initial list of URLs of pages that the scraper will visit. You can either enter these URLs manually one by one.

The scraper supports adding new URLs to scrape on the fly, either using the **[Link selector](#link-selector)** and **[Glob Patterns](#glob-patterns)** options.

### Link selector

The **Link selector** (`linkSelector`) field contains a CSS selector that is used to find links to other web pages (items with `href` attributes, e.g. `<div class="my-class" href="...">`).

On every page loaded, the scraper looks for all links matching **Link selector**, and checks that the target URL matches one of the [**Glob Patterns**](#glob-patterns). If it is a match, it then adds the URL to the request queue so that it's loaded by the scraper later on.

If **Link selector** is empty, the page links are ignored, and the scraper only loads pages specified in **[Start URLs](#start-urls)**.

### Glob Patterns

The **Glob Patterns** (`globs`) field specifies which types of URLs found by **[Link selector](#link-selector)** should be added to the request queue.

A glob pattern is simply a string with wildcard characters.

For example, a glob pattern `http://www.example.com/pages/**/*` will match all the
following URLs:

-   `http://www.example.com/pages/deeper-level/page`
-   `http://www.example.com/pages/my-awesome-page`
-   `http://www.example.com/pages/something`

### Instructions

This option instructs GPT how to handle page content, for example:

- "Summarize this page into three sentences."
- "Find a sentence that contains 'Apify Proxy' and return them as a list."

You can instruct OpenAI to answer with "skip this page", which will skip the page from the final output, for example:

- "Summarize this page into three sentences. If the page is about Proxy, answer with 'skip this page'.".

### GPT model

Select the GPT model the scraper uses. See <a href='https://platform.openai.com/docs/models/overview' target='_blank' rel='noopener'>models overview</a>.

### Page Content

You can configure how to process the page using GPT. The options are:

- **Markdown** - The scraper will pass the Markdown of the page to GPT.
- **HTML** - The scraper will pass the HTML of the page to GPT.
- **Text** - The scraper will pass the page's text to GPT.

The Markdown is set by default as it works best as input for GPT chat.

### Long content handling

The GPT has a limit on the number of tokens it can handle, but there is the option to overcome this limit.
The options are:

- Truncate content
- Split content
- Skip page

### Max pages per run

The maximum number of pages that the scraper will open. 0 means unlimited.

### Proxy configuration

The **Proxy configuration** (`proxyConfiguration`) option enables you to set proxies
the scraper will use that to prevent its detection by target websites.
You can use both [Apify Proxy](https://apify.com/proxy) and custom HTTP or SOCKS5 proxy servers.

## Tips & Tricks

A few hidden features that you might find helpful.

### Skip pages from the output

You can skip pages from the output by asking GPT to answer with `skip this page`, for example:

- "Summarize this page into three sentences. If the page is about Proxy, answer with 'skip this page'.".

### Structured data answer with JSON

You can instruct GPT to answer with JSON, and the scraper under the hood parse this JSON and stores it as a structured answer, for example:

- "Find all links on this page and return them as JSON. There will be one attribute, `links`, containing an array of URLs.."

### Handle with long content with splitting

You can instruct the scraper to split long content into smaller chunks using the 'Split content' option.
This way scraper will split the content into smaller chunks and pass them to GPT with the same instruction.
The scraper will then ask GPT to merge the chunk's answers into one result.
