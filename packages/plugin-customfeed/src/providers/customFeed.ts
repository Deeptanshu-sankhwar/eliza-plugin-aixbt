import { 
    Provider, 
    IAgentRuntime, 
    Memory, 
    State, 
    elizaLogger
} from "@elizaos/core";
import { TokenDataService, TokenData } from "./services/tokenDataService";
import { TweetAnalysisService, TweetAnalysis } from "./services/tweetAnalysisService";
import { CacheService } from "./services/cacheService";
import { WebscrapingService, WebscrapingArticle } from "./services/webscraping";

const CACHE_KEY = "trending_tokens_data";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache
const MAX_TOKENS = 8; // Ensure we only process & save 8 tokens

export const trendingTokensProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
        elizaLogger.info("🚀 TrendingTokensProvider called!");

        const COIN_GECKO_API_KEY = runtime.getSetting("COINGECKO_API_KEY") || process.env.COIN_GECKO_API_KEY;
        const COINMARKETCAP_API_KEY = runtime.getSetting("COINMARKETCAP_API_KEY") || process.env.COINMARKETCAP_API_KEY;

        if (!COIN_GECKO_API_KEY || !COINMARKETCAP_API_KEY) {
            elizaLogger.error("❌ Missing API keys. Ensure both COIN_GECKO_API_KEY and COINMARKETCAP_API_KEY are set.");
            return "Error: Missing API keys.";
        }

        try {
            // Initialize services
            const tokenDataService = new TokenDataService(runtime, COIN_GECKO_API_KEY, COINMARKETCAP_API_KEY);
            const tweetAnalysisService = new TweetAnalysisService(runtime);
            const cointelegraphService = new WebscrapingService(runtime);
            const cacheService = new CacheService(runtime, "trending_tokens");

            // Check cache first
            const cachedData = await cacheService.get<{
                tokens: TokenData[];
                tweetAnalyses: Record<string, TweetAnalysis>;
                articles: WebscrapingArticle[];
            }>(CACHE_KEY);

            let trendingTokens: TokenData[];
            let tweetAnalyses: Record<string, TweetAnalysis> = {};
            let cryptoArticles: WebscrapingArticle[] = [];

            if (cachedData) {
                elizaLogger.info("✅ Using cached data");
                trendingTokens = cachedData.tokens;
                tweetAnalyses = cachedData.tweetAnalyses;
                cryptoArticles = cachedData.articles;
            } else {
                // Get fresh data
                [trendingTokens, cryptoArticles] = await Promise.all([
                    tokenDataService.getTrendingTokens(),
                    cointelegraphService.getTopArticles()
                ]);

                // Store trending tokens with market data in memory
                for (const token of trendingTokens) {
                    const { name, symbol, market_cap_rank, price, percent_change_24h, volume_24h, market_cap } = token;
                    await runtime.messageManager.createMemory({
                        roomId: message.roomId,
                        userId: message.userId,
                        agentId: runtime.agentId,
                        content: {
                            text: `📊 **Market Data for ${name} ($${symbol})**\n\n` +
                                `Market Cap Rank: ${market_cap_rank}\n` +
                                `Price: $${price?.toFixed(4) || "N/A"}\n` +
                                `24h Change: ${percent_change_24h?.toFixed(2) || "N/A"}%\n` +
                                `24h Volume: $${volume_24h?.toLocaleString() || "N/A"}\n` +
                                `Market Cap: $${market_cap?.toLocaleString() || "N/A"}`,
                            category: "TokenMarketData",
                            metadata: {
                                symbol,
                                price,
                                market_cap_rank,
                                percent_change_24h,
                                volume_24h,
                                market_cap
                            }
                        },
                    });
                }

                // Store trending tokens in memory only for fresh data
                const trendingTokensList = trendingTokens.map(t => `${t.name} ($${t.symbol})`);
                await runtime.messageManager.createMemory({
                    roomId: message.roomId,
                    userId: message.userId,
                    agentId: runtime.agentId,
                    content: {
                        text: `📈 **Trending Tokens:**\n${trendingTokensList.join("\n")}`,
                        category: "TrendingTokens"
                    },
                });

                // Process tokens and create memories only for fresh data
                for (const token of trendingTokens) {
                    const { name, symbol } = token;
                    const analysis = await tweetAnalysisService.analyzeTweets(name, symbol, token);
                    tweetAnalyses[symbol] = analysis;

                    await runtime.messageManager.createMemory({
                        roomId: message.roomId,
                        userId: message.userId,
                        agentId: runtime.agentId,
                        content: {
                            text: `📰 **Trending Token News for ${name} ($${symbol})**\n\n${analysis.aiGeneratedSummary}`,
                            category: "TrendingTokensNews"
                        },
                    });
                }

                // Create memories for crypto news articles
                for (const article of cryptoArticles) {
                    await runtime.messageManager.createMemory({
                        roomId: message.roomId,
                        userId: message.userId,
                        agentId: runtime.agentId,
                        content: {
                            text: `📰 **Crypto News Update**\n\n**${article.title}**\n\n${article.summary}`,
                            category: "CryptoNews"
                        },
                    });
                }

                // Cache all the fresh data
                await cacheService.set(CACHE_KEY, {
                    tokens: trendingTokens,
                    tweetAnalyses,
                    articles: cryptoArticles
                }, CACHE_TTL);
            }

            // Format output
            let output = "🔹 **Trending Tokens on CoinGecko (with Market Stats):**\n\n";
            output += trendingTokens.map(token => {
                const { name, symbol, market_cap_rank } = token;
                const analysis = tweetAnalyses[symbol];

                return `🔸 **${name} ($${symbol})**\n` +
                    `📊 **Market Cap Rank:** ${market_cap_rank}\n` +
                    `💰 **Price:** $${token.price?.toFixed(4) || "N/A"}\n` +
                    `📈 **24h Change:** ${token.percent_change_24h?.toFixed(2) || "N/A"}%\n` +
                    `📉 **24h Volume:** $${token.volume_24h?.toLocaleString() || "N/A"}\n` +
                    `🔹 **Market Cap:** $${token.market_cap?.toLocaleString() || "N/A"}\n` +
                    `📰 **News Summary:** ${analysis?.aiGeneratedSummary || "No analysis available"}\n\n`;
            }).join("\n");

            // Add news section
            output += "\n\n📰 **Latest Crypto News Headlines:**\n\n";
            output += cryptoArticles.map(article => 
                `🔸 **${article.title}**\n` +
                `📝 ${article.summary}\n` +
                `⏰ ${article.timeAgo} | 👀 ${article.views} views\n`
            ).join("\n\n");

            return output;
        } catch (error) {
            elizaLogger.error(`❌ Error in trending tokens provider: ${error.message}`);
            return "Error fetching or processing data.";
        }
    },
};
