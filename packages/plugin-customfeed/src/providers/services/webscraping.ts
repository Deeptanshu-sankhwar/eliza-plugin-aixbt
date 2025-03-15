import { IAgentRuntime, elizaLogger, generateText, ModelClass } from "@elizaos/core";
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface WebscrapingArticle {
    title: string;
    author: string;
    timeAgo: string;
    views: number;
    url: string;
    content: string;
    summary?: string;
}

export class WebscrapingService {
    private runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
    }

    async getTopArticles(): Promise<WebscrapingArticle[]> {
        elizaLogger.info("🔍 Fetching News articles...");
        
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
            
            await page.goto('https://cointelegraph.com/category/latest-news', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            const articles = await page.evaluate(() => {
                const articleElements = document.querySelectorAll('article, .post-card-inline');
                
                return Array.from(articleElements).map(article => {
                    const allText = (article as HTMLElement).innerText;
                    const viewsMatch = allText.match(/\s(\d+)$/);
                    const views = viewsMatch ? parseInt(viewsMatch[1]) : 0;

                    return {
                        title: (article.querySelector('.post-card-inline__title-link') as HTMLElement)?.innerText || '',
                        author: (article.querySelector('.post-card-inline__link') as HTMLElement)?.innerText || '',
                        url: (article.querySelector('.post-card-inline__title-link') as HTMLAnchorElement)?.href || '',
                        timeAgo: allText.match(/(\d+\s+(?:MINUTE|HOUR|DAY|MONTH|YEAR)S?\s+AGO)/i)?.[0] || '',
                        views: views,
                        content: '',
                        summary: '' // Initialize summary field
                    };
                });
            });

            const filteredArticles = articles
                .filter(article => article.views >= 500)
                .sort((a, b) => b.views - a.views)
                .slice(0, 5); // Reduced to 5 articles for efficiency

            // Fetch content for each article
            for (const article of filteredArticles) {
                try {
                    await page.goto(article.url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 15000
                    });

                    const content = await page.evaluate(() => {
                        const articleText = (document.querySelector('.post__content') as HTMLElement)?.innerText 
                            || (document.querySelector('article') as HTMLElement)?.innerText
                            || (document.querySelector('main') as HTMLElement)?.innerText;

                        if (!articleText) return '';

                        return articleText
                            .replace(/\d+\s*Total views\s*\d+\s*Total shares\s*Listen to article\s*0:00/g, '')
                            .replace(/COINTELEGRAPH IN YOUR SOCIAL FEED\s*Follow our\s*Subscribe on/g, '')
                            .replace(/#[A-Za-z]+(\s*#[A-Za-z]+)*\s*Add reaction/g, '')
                            .replace(/\n{3,}/g, '\n\n')
                            .trim();
                    });

                    article.content = content;

                    // Generate AI summary using the correct generateText function
                    const summary = await generateText({
                        runtime: this.runtime,
                        context: `
Summarize the following crypto news article:

Title: ${article.title}

Content: ${content.substring(0, 1000)}...

Guidelines:
- Focus on key facts and developments
- Avoid speculation or opinions
- Be clear and concise
`,
                        modelClass: ModelClass.SMALL,
                    });

                    article.summary = summary.trim();

                } catch (error) {
                    elizaLogger.error(`Failed to process article: ${article.url}`, error);
                    article.content = "Error fetching content";
                    article.summary = "Summary unavailable";
                }
            }

            await browser.close();
            return filteredArticles;

        } catch (error) {
            elizaLogger.error("Error in getTopArticles:", error);
            await browser.close();
            throw error;
        }
    }
}