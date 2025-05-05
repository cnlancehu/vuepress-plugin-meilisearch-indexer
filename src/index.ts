import { createHash } from 'crypto'
import { load } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'
import { MeiliSearch } from 'meilisearch'
import type { App, Page } from 'vuepress/core'
import fs from 'fs/promises'
import path from 'path'

export type DeployTrigger = 'deploy = true' | 'everytime'
export type DeployType = 'full' | 'incremental'

let isFirstLog = true;

const FOLLOWING = '\u{1b}[38;2;255;92;178mMeiliIndexer\u{1b}[0m |';
const FOLLOWING_BLANK = '             |';

function following() {
    if (isFirstLog) {
        isFirstLog = false;
        return FOLLOWING;
    }
    return FOLLOWING_BLANK;
}

export interface MeiliSearchDeployConfig {
    /**
     * Deploy trigger, determines when the deployment to Meilisearch should happen
     * - 'deploy = true': Deploy only when the DEPLOY environment variable is set to 'true'
     * - 'everytime': Deploy every time the index is generated
     *
     * 部署触发器，决定何时将索引部署到 Meilisearch
     * - 'deploy = true': 仅当环境变量 DEPLOY 设置为 'true' 时触发部署
     * - 'everytime': 每次生成索引时都进行部署
     */
    trigger: DeployTrigger,

    /**
     * Meilisearch server host URL
     * 
     * Meilisearch 服务器地址
     */
    host: string,

    /**
     * Meilisearch API key
     * If not provided, will try to use the MEILISEARCH_API_KEY environment variable
     * 
     * Meilisearch API 密钥
     * 如果未提供，将尝试使用 MEILISEARCH_API_KEY 环境变量
     */
    key?: string | null,

    /**
     * The unique identifier for the Meilisearch index
     * 
     * Meilisearch 索引的唯一标识符
     */
    index_uid: string,

    /**
     * Deployment type:
     * - 'full': Deletes all existing documents before adding new ones (complete reindex)
     * - 'incremental': Updates existing documents and adds new ones without removing unmatched documents
     *
     * 部署类型：
     * - 'full': 删除所有现有文档后添加新文档（完全重建索引）
     * - 'incremental': 更新现有文档并添加新文档，不删除未匹配的文档
     */
    type: DeployType
}

/**
 * Configuration options for the MeiliSearch indexer plugin.
 * 
 * MeiliSearch 索引器插件的配置选项。
 */
export interface MeiliSearchIndexerPluginOptions {
    /**
     * Output path for the generated JSON index file.
     * If not set, no file will be generated.
     * 
     * 输出的JSON文件路径。
     * 不设置则不输出文件。
     */
    indexOutputFile?: string

    /**
     * Whether to index the full content of pages.
     * 
     * 是否索引页面的全文内容。
     */
    indexContent?: boolean

    /**
     * Page filter function. Pages will be indexed only if this function returns true.
     * Return true to include the page in the index.
     * 
     * 页面过滤器函数。返回true表示页面需要被索引。
     */
    filter?: (page: Page) => boolean

    /**
     * Base URL of the site. Used to generate complete URLs for indexed pages.
     * 
     * 站点基础URL，用于为索引页面生成完整URL。
     */
    baseUrl?: string

    /**
     * MeiliSearch deployment configuration.
     * If not set, deployment will not occur.
     * 
     * Meilisearch部署配置。
     * 不设置则不进行部署。
     */
    deploy?: MeiliSearchDeployConfig
}

interface MeiliSearchDocument {
    content: string
    url: string
    anchor: string | null
    objectID: string
    hierarchy_lvl0: string | null
    hierarchy_lvl1: string | null
    hierarchy_lvl2: string | null
    hierarchy_lvl3: string | null
    hierarchy_lvl4: string | null
    hierarchy_lvl5: string | null
    hierarchy_lvl6: string | null
    hierarchy_radio_lvl0: string | null
    hierarchy_radio_lvl1: string | null
    hierarchy_radio_lvl2: string | null
    hierarchy_radio_lvl3: string | null
    hierarchy_radio_lvl4: string | null
    hierarchy_radio_lvl5: string | null
    lang: string
    level: number
    position: number
    page_rank?: number
}

/**
 * Generate and optionally deploy Meilisearch index
 */
export const generateMeiliSearchIndex = async (
    app: App,
    options: MeiliSearchIndexerPluginOptions = {}
): Promise<void> => {
    const {
        indexOutputFile,
        indexContent = true,
        filter = (): boolean => true,
        baseUrl = '',
        deploy
    } = options

    // Skip index generation if no output file and no deployment is configured
    if (!indexOutputFile && !deploy) {
        console.log(following(), '\u{1b}[90mskipped\u{1b}[0m')
        return
    }

    // Skip if deploy is configured but won't be triggered
    if (!indexOutputFile && deploy && deploy.trigger === 'deploy = true' && process.env.DEPLOY !== 'true') {
        console.log(following(), '\u{1b}[90mskipped\u{1b}[0m')
        return
    }

    // Generate documents from pages
    const documents: MeiliSearchDocument[] = []
    app.pages.forEach((page) => {
        if (filter(page) && page.frontmatter.search !== false) {
            const pageDocuments = generatePageDocuments(page, baseUrl, indexContent)
            documents.push(...pageDocuments)
        }
    })

    // Output index to file if specified
    if (indexOutputFile) {
        const outputDir = path.dirname(indexOutputFile)
        try {
            await fs.mkdir(outputDir, { recursive: true })
            await fs.writeFile(
                indexOutputFile,
                JSON.stringify(documents, null, 2),
                'utf-8'
            )
            console.log(following(), `Index saved to ${indexOutputFile}`)
        } catch (err) {
            console.log(following(), `Failed to save index to file`)
            console.error(following(), err)
        }
    }

    // Deploy to Meilisearch if configured and triggered
    if (deploy && ((deploy.trigger === 'deploy = true' && process.env.DEPLOY === 'true') || deploy.trigger === 'everytime')) {
        await deployToMeilisearch(documents, deploy)
    }
}

/**
 * Deploy documents to Meilisearch
 */
async function deployToMeilisearch(
    documents: MeiliSearchDocument[],
    config: MeiliSearchDeployConfig
): Promise<void> {
    try {
        const { host, key, index_uid, type } = config

        // Use environment variable as fallback if key is not provided
        const apiKey = key || process.env.MEILISEARCH_API_KEY;

        if (!apiKey) {
            console.error(following(), 'API key not provided and MEILISEARCH_API_KEY environment variable not set')
            return
        }

        // Replace the key with the resolved API key
        if (!host || !index_uid) {
            console.error(following(), 'Missing required Meilisearch configuration')
            return
        }

        console.log(following(), `Deploying to Meilisearch`)

        const client = new MeiliSearch({
            host,
            apiKey,
        })

        const index = client.index(index_uid)

        if (type === 'full') {
            await index.deleteAllDocuments()
            await index.addDocuments(documents)
        } else {
            await index.updateDocuments(documents)
        }

        console.log(following(), `Finished`)
    } catch (error) {
        console.log(following(), 'Failed to deploy to Meilisearch')
        console.error(following(), error)
    }
}

// HTML parsing constants
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
const CONTENT_BLOCK_TAGS =
    'header,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,li,main,ol,p,ul,caption,table,thead,tbody,tfoot,th,tr,td,datalist,fieldset,form,legend,optgroup,option,select,details,dialog,menu,menuitem,summary,blockquote,pre'.split(',')
const CONTENT_INLINE_TAGS =
    'routelink,routerlink,a,b,abbr,bdi,bdo,cite,code,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,del,ins,button,label,legend,meter,optgroup,option,output,progress,select'.split(',')

const isExcerptMarker = (node: AnyNode): boolean =>
    node.type === 'comment' && node.data.trim() === 'more'

const $ = load('')

/**
 * Render header text content
 */
const renderHeader = (node: Element): string => {
    if (
        node.children.length === 1 &&
        node.children[0].type === 'tag' &&
        node.children[0].tagName === 'a' &&
        node.children[0].attribs.class === 'header-anchor'
    )
        node.children = (node.children[0].children[0] as Element).children

    return node.children
        .map((childNode) => (childNode.type === 'text' ? childNode.data : null))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim()
}

/**
 * Generate a unique object ID for a document
 */
const generateObjectID = (url: string, anchor: string | null, position: number): string => {
    const idSource = anchor ? `${url}#${anchor}-${position}` : url
    return createHash('sha1').update(idSource).digest('hex')
}

/**
 * Generate search documents from a page
 */
const generatePageDocuments = (
    page: Page<{ excerpt?: string }>,
    baseUrl: string,
    indexContent = false,
): MeiliSearchDocument[] => {
    const { contentRendered, data, title, lang } = page
    const documents: MeiliSearchDocument[] = []

    const hasExcerpt = Boolean(data.excerpt?.length)

    let shouldIndexContent = hasExcerpt || indexContent
    let currentHeading: { level: number; text: string; id: string | null }[] = []
    let indexedText = ''
    let position = 0

    currentHeading[0] = {
        level: 0,
        text: title,
        id: null,
    }

    const pageUrl = `${baseUrl}${page.path}`

    const addTextToIndex = (): void => {
        if (shouldIndexContent) {
            const content = indexedText.replace(/[\n\s]+/gu, ' ').trim()

            const hierarchy: Record<string, string | null> = {
                hierarchy_lvl0: null,
                hierarchy_lvl1: null,
                hierarchy_lvl2: null,
                hierarchy_lvl3: null,
                hierarchy_lvl4: null,
                hierarchy_lvl5: null,
                hierarchy_lvl6: null
            }

            const hierarchyRadio: Record<string, string | null> = {
                hierarchy_radio_lvl0: null,
                hierarchy_radio_lvl1: null,
                hierarchy_radio_lvl2: null,
                hierarchy_radio_lvl3: null,
                hierarchy_radio_lvl4: null,
                hierarchy_radio_lvl5: null
            }

            for (let i = 0; i <= 6; i++) {
                const heading = currentHeading.find(h => h.level === i)
                hierarchy[`hierarchy_lvl${i}`] = heading?.text || null
                if (i <= 5) {
                    hierarchyRadio[`hierarchy_radio_lvl${i}`] = heading?.text || null
                }
            }

            const currentLevel = currentHeading.length > 0 ?
                Math.max(...currentHeading.map(h => h.level)) : 0

            const currentAnchor = currentHeading
                .filter(h => h.id !== null)
                .sort((a, b) => b.level - a.level)[0]?.id || null

            const currentPosition = position++;
            const document: MeiliSearchDocument = {
                content,
                url: pageUrl,
                anchor: currentAnchor,
                objectID: generateObjectID(pageUrl, currentAnchor, currentPosition),
                lang: lang || 'en',
                level: currentLevel,
                position: currentPosition,
                ...hierarchy as any,
                ...hierarchyRadio as any,
                page_rank: typeof page.frontmatter.page_rank === 'number' ? page.frontmatter.page_rank : 0,
            }

            documents.push(document)

            indexedText = ''
        }
    }

    const render = (node: AnyNode, preserveSpace = false): void => {
        if (node.type === 'tag') {
            const tagName = node.name.toLowerCase()

            if (HEADING_TAGS.includes(tagName)) {
                const { id } = node.attribs
                const headerText = renderHeader(node)
                addTextToIndex()

                const level = parseInt(tagName.substring(1), 10)

                currentHeading = currentHeading.filter(h => h.level < level)

                currentHeading.push({
                    level,
                    text: headerText,
                    id,
                })
            }
            else if (CONTENT_BLOCK_TAGS.includes(tagName)) {
                addTextToIndex()
                node.childNodes.forEach((item) => {
                    render(item, preserveSpace || tagName === 'pre')
                })
            }
            else if (CONTENT_INLINE_TAGS.includes(tagName)) {
                node.childNodes.forEach((item) => {
                    render(item, preserveSpace)
                })
            }
        }
        else if (node.type === 'text') {
            indexedText += preserveSpace || node.data.trim() ? node.data : ''
        }
        else if (
            hasExcerpt &&
            !indexContent &&
            isExcerptMarker(node)
        ) {
            shouldIndexContent = false
        }
    }

    const nodes = $.parseHTML(contentRendered) ?? []

    if (!nodes.length) return []

    nodes.forEach((node) => {
        render(node)
    })

    addTextToIndex()

    // Filter out empty content documents if there are non-empty ones
    const nonEmptyDocuments = documents.filter(doc => doc.content.trim() !== '');

    // If we have non-empty documents, return only those
    if (nonEmptyDocuments.length > 0) {
        return nonEmptyDocuments;
    }

    // Otherwise, ensure we have at least one document (even with empty content)
    if (documents.length === 0) {
        const hierarchy = {
            hierarchy_lvl0: title || null,
            hierarchy_lvl1: null,
            hierarchy_lvl2: null,
            hierarchy_lvl3: null,
            hierarchy_lvl4: null,
            hierarchy_lvl5: null,
            hierarchy_lvl6: null
        };

        const hierarchyRadio = {
            hierarchy_radio_lvl0: title || null,
            hierarchy_radio_lvl1: null,
            hierarchy_radio_lvl2: null,
            hierarchy_radio_lvl3: null,
            hierarchy_radio_lvl4: null,
            hierarchy_radio_lvl5: null
        };

        documents.push({
            content: '',
            url: pageUrl,
            anchor: null,
            objectID: generateObjectID(pageUrl, null, 0),
            lang: lang || 'en',
            level: 0,
            position: 0,
            ...hierarchy,
            ...hierarchyRadio,
            page_rank: typeof page.frontmatter.page_rank === 'number' ? page.frontmatter.page_rank : 0,
        });
    }

    return documents
}

/**
 * VuePress plugin definition
 */
export default (options: MeiliSearchIndexerPluginOptions = {}) => {
    return {
        name: 'vuepress-plugin-meilisearch-indexer',

        onGenerated: (app: App) => {
            return generateMeiliSearchIndex(app, options)
        }
    }
}