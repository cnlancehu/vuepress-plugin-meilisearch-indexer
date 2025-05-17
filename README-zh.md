# VuePress 插件 - Meilisearch 索引器

[English](./README.md) | **简体中文**

一个用于 VuePress 2 的 Meilisearch 索引生成插件，为 VuePress 站点生成适用于 Meilisearch 的索引文件。

同时支持自动部署到 Meilisearch。

## 安装

```bash
pnpm add -D vuepress-plugin-meilisearch-indexer
````

## 使用

将插件添加到你的 VuePress 配置：

```js
// config.js 或 config.ts
import meilisearchIndexer from 'vuepress-plugin-meilisearch-indexer'

export default {
  // ...其他选项
  plugins: [
    meilisearchIndexer({
      indexOutputFile: './meilisearch-index.json', // 可选: 将索引输出到文件
      indexContent: true,                          // 是否索引页面全文内容
      baseUrl: 'https://yoursite.com',             // 站点基础 URL，留空则为相对 URL
      // 可选: 直接部署到 Meilisearch 服务器
      deploy: {
        trigger: 'meilideploy = true',  // 仅当环境变量 MEILIDEPLOY=true 时部署
        host: 'http://localhost:7700',   // Meilisearch 服务器地址
        key: 'masterKey',               // 可选: Meilisearch API 密钥 (如未提供则使用环境变量 MEILISEARCH_API_KEY)
        index_uid: 'docs',              // 索引名称
        type: 'full'                    // 'full' 或 'incremental'
      }
    })
  ]
}
```

## 配置选项

### 插件选项

| 选项              | 类型                                   | 默认值                                | 说明                                                |
| ----------------- | -------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `indexOutputFile` | `string \| undefined`                  | `undefined`                           | 保存 JSON 索引文件的路径。如不提供，则不生成文件。  |
| `indexContent`    | `boolean`                              | `true`                                | 是否索引页面的全文内容。                            |
| `filter`          | `(page: Page) => boolean`              | `(page) => page.path !== '/404.html'` | 用于过滤哪些页面应被索引的函数。                    |
| `baseUrl`         | `string`                               | `''`                                  | 站点的基础 URL，用于生成绝对 URL。                  |
| `deploy`          | `MeiliSearchDeployConfig \| undefined` | `undefined`                           | 部署到 Meilisearch 的配置。如不提供，则不执行部署。 |

### MeiliSearchDeployConfig 选项

| 选项        | 类型                                  | 说明                                                                        |
| ----------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `trigger`   | `'meilideploy = true' \| 'everytime'` | 何时触发部署：仅当 `MEILIDEPLOY=true` 时，或每次构建时。                    |
| `host`      | `string`                              | Meilisearch 服务器地址。                                                    |
| `key`       | `string \| undefined \| null`         | Meilisearch API 密钥。如未提供，将从环境变量 `MEILISEARCH_API_KEY` 中读取。 |
| `index_uid` | `string`                              | Meilisearch 索引名称。                                                      |
| `type`      | `'full' \| 'incremental'`             | 执行完全更新（先删除所有文档）或增量更新。                                  |

## Frontmatter 选项

```yaml
---
search: false # 阻止该页面被索引
page_rank: 10 # 设置自定义页面排名（更高的数值排在前面）
---
```

`page_rank` 属性允许你提升特定页面在搜索结果中的排名。