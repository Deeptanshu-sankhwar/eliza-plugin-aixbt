import { IAgentRuntime, elizaLogger, generateText, ModelClass } from "@elizaos/core";
import { SearchMode, Scraper, Tweet } from "agent-twitter-client";
import { initializeTwitterScraper } from "../utils/environment";
import { CacheService } from "./cacheService";
import { TokenData } from "./tokenDataService";

export interface TweetAnalysis {
    topTweets: Tweet[];
    kolMentions: string[];
    aiGeneratedSummary: string;
}

export class TweetAnalysisService {
    private runtime: IAgentRuntime;
    private cacheService: CacheService;
    private scraper?: Scraper;
    private kolList: string[] = [];

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.cacheService = new CacheService(runtime, "tweet_analysis");
    }

    private async initializeScraper(): Promise<void> {
        if (!this.scraper) {
            const { scraper, kolList } = await initializeTwitterScraper(this.runtime);
            this.scraper = scraper;
            this.kolList = kolList;
        }
    }

    async analyzeTweets(tokenName: string, tokenSymbol: string, tokenData?: TokenData): Promise<TweetAnalysis> {
        const cacheKey = `tweet_analysis_${tokenSymbol.toLowerCase()}`;
        
        // Try cache first
        const cachedAnalysis = await this.cacheService.get<TweetAnalysis>(cacheKey);
        if (cachedAnalysis) {
            elizaLogger.info(`✅ Using cached tweet analysis for ${tokenSymbol}`);
            return cachedAnalysis;
        }

        await this.initializeScraper();
        
        try {
            const searchQueries = [`$${tokenSymbol}`, tokenName];
            elizaLogger.info(`🔍 Searching Twitter for ${searchQueries.join(" and ")}`);

            // Fetch tweets for both queries in parallel
            const tweetPromises = searchQueries.map(query => 
                this.scraper!.fetchSearchTweets(query, 100, SearchMode.Top)
            );

            const tweetResults = await Promise.all(tweetPromises);
            
            // Combine and sort tweets by likes, increased to top 10
            const allTweets = tweetResults
                .flatMap(result => result.tweets || [])
                .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
                .slice(0, 10);

            // Get KOL mentions if available
            let kolMentions: string[] = [];
            if (this.kolList.length > 0) {
                elizaLogger.info(`📢 Searching for KOL mentions of ${tokenSymbol}`);
                const kolSearchPromises = this.kolList.map(async (kol) => {
                    try {
                        const kolTweets = await this.scraper!.fetchSearchTweets(
                            `from:${kol} ${tokenSymbol}`, 
                            20,  // Increased from 10 to get more KOL context
                            SearchMode.Latest
                        );
                        return kolTweets.tweets?.map(tweet => ({
                            text: tweet.text.trim(),
                            author: kol,
                            likes: tweet.likes
                        })) || [];
                    } catch (error) {
                        elizaLogger.warn(`⚠️ Error fetching KOL tweets for ${tokenSymbol}:`, error);
                        return [];
                    }
                });

                const kolTweets = await Promise.all(kolSearchPromises);
                kolMentions = kolTweets.flat().map(t => `${t.author}: ${t.text} (${t.likes} likes)`);
            }

            // Generate AI summary with market data
            const tweetTexts = allTweets.map(tweet => tweet.text.trim());
            
            // Format market data section if available
            let marketDataSection = "";
            if (tokenData) {
                marketDataSection = `
### 📊 Current Market Data:
- Price: $${tokenData.price?.toFixed(4) || "N/A"}
- 24h Change: ${tokenData.percent_change_24h?.toFixed(2) || "N/A"}%
- Market Cap Rank: ${tokenData.market_cap_rank || "N/A"}
- 24h Volume: $${tokenData.volume_24h?.toLocaleString() || "N/A"}
- Market Cap: $${tokenData.market_cap?.toLocaleString() || "N/A"}
`;
            }

            const aiGeneratedSummary = await generateText({
                runtime: this.runtime,
                context: `
Generate a comprehensive analysis about ${tokenName} ($${tokenSymbol}) using the provided data.
${marketDataSection}

### 📢 Top Community Discussions (Sorted by Engagement):
${tweetTexts.join("\n\n")}

### 🎯 Key Opinion Leader (KOL) Mentions:
${kolMentions.length > 0 ? kolMentions.join("\n\n") : "No recent KOL mentions found."}

### 📜 Analysis Guidelines:
1. Market Performance:
   - Analyze current price action and market metrics
   - Compare with historical context if mentioned
   - Note any significant market movements

2. News & Developments:
   - Extract and verify news from both community and KOL sources
   - Focus on partnerships, updates, or major events
   - Cross-reference mentions across multiple sources

3. Community & KOL Sentiment:
   - Analyze overall market sentiment
   - Note any consensus or disagreements among KOLs, but do not mention any specific KOLs
   - Highlight significant community concerns or excitement

4. Important Rules:
   - Use ONLY information from provided sources
   - Clearly distinguish between verified news and community discussion
   - Include specific metrics when discussing market performance
   - Maintain objectivity and avoid speculation
   - No direct mentions of any analyst or KOL
`,
                modelClass: ModelClass.SMALL,
            });

            const analysis: TweetAnalysis = {
                topTweets: allTweets,
                kolMentions,
                aiGeneratedSummary
            };

            // Cache for 15 minutes
            await this.cacheService.set(cacheKey, analysis, 15 * 60 * 1000);

            return analysis;
        } catch (error) {
            elizaLogger.error(`❌ Error analyzing tweets for ${tokenSymbol}:`, error);
            throw error;
        }
    }
}