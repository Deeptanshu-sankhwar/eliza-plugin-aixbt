import { elizaLogger } from "@elizaos/core";

class CoinGeckoAPI {
    private baseURL: string;
    private apiKey: string;

    constructor(apiKey: string) {
        this.baseURL = "https://api.coingecko.com/api/v3";
        this.apiKey = apiKey;
    }

    async fetchTrendingTokens() {
        const url = `${this.baseURL}/search/trending`;
        const options = {
            method: "GET",
            headers: {
                accept: "application/json",
                "x-cg-demo-api-key": this.apiKey,
            },
        };

        try {
            elizaLogger.info("🔹 Fetching trending tokens from CoinGecko...");
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`❌ HTTP error! Status: ${response.status}`);

            const data = await response.json();
            elizaLogger.info("✅ Trending tokens fetched successfully.");

            return data.coins.map((token: any) => ({
                name: token.item.name,
                symbol: token.item.symbol,
                market_cap_rank: token.item.market_cap_rank || "N/A"
            }));
        } catch (error) {
            elizaLogger.error("❌ Error fetching trending tokens:", error);
            throw error;
        }
    }
}

export { CoinGeckoAPI };
