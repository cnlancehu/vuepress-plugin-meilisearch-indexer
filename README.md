# VuePress Plugin - Meilisearch Indexer

**English** | [简体中文](./README-zh.md)

A Meilisearch index generation plugin for VuePress 2 that generates index files suitable for Meilisearch from your VuePress site content.

It also supports automatic deployment to Meilisearch.

## Installation

```bash
pnpm add -D vuepress-plugin-meilisearch-indexer
```

## Usage

Add the plugin to your VuePress config:

```js
// config.js or config.ts
import meilisearchIndexer from 'vuepress-plugin-meilisearch-indexer'

export default {
  // ...other options
  plugins: [
    meilisearchIndexer({
      indexOutputFile: './meilisearch-index.json', // Optional: output the index to a file
      indexContent: true,                          // Whether to index full page content
      baseUrl: 'https://yoursite.com',             // Base URL of your site, leave empty for relative URLs
      // Optional: deploy directly to Meilisearch Server
      deploy: {
        trigger: 'meilideploy = true',    // Deploy only when MEILIDEPLOY=true environment variable is set
        host: 'http://localhost:7700',     // Meilisearch server address
        key: 'masterKey',                 // Optional: Meilisearch API key (falls back to MEILISEARCH_API_KEY env var)
        index_uid: 'docs',                // Index name
        type: 'full'                      // 'full' or 'incremental'
      }
    })
  ]
}
```

## Configuration Options

### Plugin Options

| Option            | Type                                   | Default                                                       | Description                                                                                    |
| ----------------- | -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `indexOutputFile` | `string \| undefined`                  | `undefined`                                                   | Path to save the JSON index file. If not provided, no file will be generated.                  |
| `indexContent`    | `boolean`                              | `true`                                                        | Whether to index the full content of each page.                                                |
| `filter`          | `(page: Page) => boolean`              | `(page) => page.path !== '/404.html'` | Function to filter which pages should be indexed.                                              |
| `baseUrl`         | `string`                               | `''`                                                          | Base URL of the site, used to generate absolute URLs.                                          |
| `deploy`          | `MeiliSearchDeployConfig \| undefined` | `undefined`                                                   | Configuration for deploying to Meilisearch. If not provided, deployment will not be performed. |

### MeiliSearchDeployConfig Options

| Option      | Type                                  | Description                                                                                                |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `trigger`   | `'meilideploy = true' \| 'everytime'` | When to trigger deployment: only if `MEILIDEPLOY=true`, or on every build.                                 |
| `host`      | `string`                              | Meilisearch server address.                                                                                |
| `key`       | `string \| undefined \| null`         | Meilisearch API key. If not provided, it will be read from the environment variable `MEILISEARCH_API_KEY`. |
| `index_uid` | `string`                              | The name of the Meilisearch index.                                                                         |
| `type`      | `'full' \| 'incremental'`             | Perform a full update (deletes all documents first) or an incremental update.                              |

## Frontmatter Options

You can control search indexing at the page level with frontmatter:

```yaml
---
search: false # Prevent this page from being indexed
page_rank: 10 # Optional: Set a custom page ranking (higher numbers appear first)
---
```

The `page_rank` frontmatter property allows you to boost certain pages in search results.