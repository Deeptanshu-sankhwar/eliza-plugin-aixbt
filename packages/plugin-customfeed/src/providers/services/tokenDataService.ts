import { IAgentRuntime, elizaLogger } from "@elizaos/core";
import { CoinGeckoAPI } from "../apis/coingeckoAPI";
import { CoinMarketCapAPI } from "../apis/coinmarketcapAPI";
import { CacheService } from "./cacheService";

export interface TokenData {
    name: string;
    symbol: string;
    market_cap_rank: number | string;
    price?: number;
    volume_24h?: number;
    percent_change_24h?: number;
    market_cap?: number;
}

export class TokenDataService {
    private coinGeckoAPI: CoinGeckoAPI;
    private coinMarketCapAPI: CoinMarketCapAPI;
    private cacheService: CacheService;
    private static readonly MAX_TOKENS = 8;

    constructor(
        runtime: IAgentRuntime,
        coinGeckoApiKey: string,
        coinMarketCapApiKey: string
    ) {
        this.coinGeckoAPI = new CoinGeckoAPI(coinGeckoApiKey);
        this.coinMarketCapAPI = new CoinMarketCapAPI(coinMarketCapApiKey);
        this.cacheService = new CacheService(runtime, "token_data");
    }

    async getTrendingTokens(): Promise<TokenData[]> {
        try {
            // Try to get from cache first
            const cachedTokens = await this.cacheService.get<TokenData[]>("trending_tokens");
            if (cachedTokens) {
                elizaLogger.info("✅ Using cached trending tokens data");
                return cachedTokens;
            }

            // Fetch new data from CoinGecko
            const trendingTokens = await this.coinGeckoAPI.fetchTrendingTokens();
            if (!trendingTokens || trendingTokens.length === 0) {
                throw new Error("No trending tokens found from CoinGecko");
            }

            // Limit to MAX_TOKENS
            const limitedTokens = trendingTokens.slice(0, TokenDataService.MAX_TOKENS);
            elizaLogger.info(`📊 Retrieved ${limitedTokens.length} trending tokens from CoinGecko`);

            // Get market data from CoinMarketCap
            const symbols = limitedTokens.map(token => token.symbol.toUpperCase());
            const marketData = await this.coinMarketCapAPI.fetchTokenStats(symbols);

            // Combine the data
            const enrichedTokens = limitedTokens.map(token => ({
                ...token,
                ...marketData[token.symbol.toUpperCase()]
            }));

            // Cache the results for 1 hour
            await this.cacheService.set("trending_tokens", enrichedTokens, 60 * 60 * 1000);

            return enrichedTokens;
        } catch (error) {
            elizaLogger.error("❌ Error fetching trending tokens:", error);
            throw error;
        }
    }

    async getTokenMarketData(symbol: string): Promise<TokenData | null> {
        try {
            const cacheKey = `market_data_${symbol.toLowerCase()}`;
            
            // Try cache first
            const cachedData = await this.cacheService.get<TokenData>(cacheKey);
            if (cachedData) {
                return cachedData;
            }

            // Fetch fresh data
            const marketData = await this.coinMarketCapAPI.fetchTokenStats([symbol]);
            if (!marketData || !marketData[symbol.toUpperCase()]) {
                return null;
            }

            const tokenData = marketData[symbol.toUpperCase()];
            
            // Cache for 5 minutes
            await this.cacheService.set(cacheKey, tokenData, 5 * 60 * 1000);
            
            return tokenData;
        } catch (error) {
            elizaLogger.error(`❌ Error fetching market data for ${symbol}:`, error);
            return null;
        }
    }
}