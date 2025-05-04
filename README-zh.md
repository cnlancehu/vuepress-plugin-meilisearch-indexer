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
      indexOutputFile: './meilisearch-index.json', // 可选：将索引输出到文件
      indexContent: true,                          // 是否索引页面完整内容
      baseUrl: 'https://yoursite.com',             // 站点的基础 URL
      // 可选：直接部署到 Meilisearch
      deploy: {
        trigger: 'deploy = true',  // 仅在 DEPLOY=true 环境变量时部署
        host: 'http://localhost:7700', // Meilisearch 服务地址
        key: 'masterKey',           // 可选：Meilisearch API 密钥（若未设置，使用 MEILISEARCH_API_KEY 环境变量）
        index_uid: 'docs',          // 索引名称
        type: 'full'                // 'full' 或 'incremental'
      }
    })
  ]
}
```

## 配置选项

### 插件选项

| 参数              | 类型                                   | 默认         | 描述                                                  |
| ----------------- | -------------------------------------- | ------------ | ----------------------------------------------------- |
| `indexOutputFile` | `string \| undefined`                  | `undefined`  | 保存 JSON 索引文件的路径。如未提供，则不会生成文件。  |
| `indexContent`    | `boolean`                              | `true`       | 是否索引页面的全文内容。                              |
| `filter`          | `(page: Page) => boolean`              | `() => true` | 过滤应被索引的页面的函数。                            |
| `baseUrl`         | `string`                               | `''`         | 站点的基础 URL，用于生成绝对 URL。                    |
| `deploy`          | `MeiliSearchDeployConfig \| undefined` | `undefined`  | 部署到 Meilisearch 的配置。如未提供，则不会执行部署。 |

### MeiliSearchDeployConfig 选项

| 参数        | 类型                             | 描述                                                                      |
| ----------- | -------------------------------- | ------------------------------------------------------------------------- |
| `trigger`   | `'deploy = true' \| 'everytime'` | 何时触发部署：仅当 DEPLOY=true 或每次构建时。                             |
| `host`      | `string`                         | Meilisearch 服务地址。                                                    |
| `key`       | `string \| undefined`            | Meilisearch API 密钥。如未提供，则从 MEILISEARCH\_API\_KEY 环境变量获取。 |
| `index_uid` | `string`                         | Meilisearch 索引的名称。                                                  |
| `type`      | `'full' \| 'incremental'`        | 执行全量更新（先删除所有文档）还是增量更新。                              |

## Frontmatter 选项

```yaml
---
search: false # 使这个页面不被索引
---
```
