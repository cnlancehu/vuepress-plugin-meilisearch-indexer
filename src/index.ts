import { createHash } from 'crypto'
import { load } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'
import { MeiliSearch } from 'meilisearch'
import type { App, Page } from 'vuepress/core'
import fs from 'fs/promises'
import path from 'path'

export type DeployTrigger = 'deploy = true' | 'everytime'
export type DeployType = 'full' | 'incremental'

export interface MeiliSearchDeployConfig {
    // 部署触发器，deploy = true 表示环境变量 `DEPLOY` 为 true 时触发，everytime表示每次生成时都部署
    trigger: DeployTrigger,

    // Meilisearch 服务器地址
    host: string
    // Meilisearch API 密钥，如果留空则从环境变量MEILISEARCH_API_KEY中获取
    key?: string
    // 索引名称
    index_uid: string
    // 部署类型，full表示全量更新，incremental表示增量更新
    type: DeployType
}

export interface MeiliSearchIndexerPluginOptions {
    // 输出的JSON文件路径
    // 不设置则不输出文件
    indexOutputFile?: string
    // 是否索引全文内容
    indexContent?: boolean
    // 页面过滤器，返回true表示页面需要被索引
    filter?: (page: Page) => boolean
    // 站点基础URL，用于生成完整URL
    baseUrl?: string
    // Meilisearch部署配置
    // 不设置则不进行部署
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
            console.log(`Meilisearch index saved to ${indexOutputFile}`)
        } catch (err) {
            console.error(`Failed to save Meilisearch index to file: ${err}`)
        }
    }

    // Deploy to Meilisearch if configured
    if (deploy) {
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
        const apiKey = key || process.env.MEILISEARCH_API_KEY

        if (!apiKey) {
            console.error('Meilisearch API key not provided and MEILISEARCH_API_KEY environment variable not set')
            return
        }

        // Replace the key with the resolved API key
        if (!host || !index_uid) {
            console.error('Missing required Meilisearch configuration')
            return
        }

        console.log(`Deploying ${documents.length} documents to Meilisearch (${type} update)`)

        const client = new MeiliSearch({
            host,
            apiKey,
        })

        const index = client.index(index_uid)

        if (type === 'full') {
            // Full update: delete all documents first
            console.log('Performing full update - deleting all existing documents...')
            const deleteResponse = await index.deleteAllDocuments()
            console.log('Delete response task ID:', deleteResponse.taskUid)

            // Add all documents
            const addResponse = await index.addDocuments(documents)
            console.log('Add documents response task ID:', addResponse.taskUid)
        } else {
            // Incremental update: just add or update documents
            console.log('Performing incremental update...')
            const updateResponse = await index.updateDocuments(documents)
            console.log('Update documents response task ID:', updateResponse.taskUid)
        }

        console.log('Meilisearch deployment completed successfully')
    } catch (error) {
        console.error('Failed to deploy to Meilisearch:', error)
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