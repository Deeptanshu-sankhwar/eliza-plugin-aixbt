import { elizaLogger } from "@elizaos/core";

class CoinMarketCapAPI {
    private baseURL: string;
    private apiKey: string;

    constructor(apiKey: string) {
        this.baseURL = "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest";
        this.apiKey = apiKey;
    }

    async fetchTokenStats(symbols: string[]) {
        const url = `${this.baseURL}?symbol=${symbols.join(",")}&convert=USD`;
        const options = {
            method: "GET",
            headers: {
                "X-CMC_PRO_API_KEY": this.apiKey,
                "Accept": "application/json",
            },
        };

        try {
            elizaLogger.info(`🔹 Fetching market data from CoinMarketCap for: ${symbols.join(", ")}`);
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`❌ HTTP error! Status: ${response.status}`);

            const data = await response.json();
            elizaLogger.info("✅ Market data fetched successfully.");

            const filterMostKnown = (symbolData: any) => {
                if (!Array.isArray(symbolData)) return symbolData;
                return symbolData
                    .filter((token) => token.is_active === 1)
                    .sort((a, b) => (a.cmc_rank || 99999) - (b.cmc_rank || 99999))[0];
            };

            const extractImportantData = (token: any) => ({
                name: token.name,
                symbol: token.symbol,
                price: token.quote.USD.price,
                volume_24h: token.quote.USD.volume_24h,
                percent_change_24h: token.quote.USD.percent_change_24h,
                market_cap: token.quote.USD.market_cap,
            });

            const filteredData: Record<string, any> = {};
            for (const symbol in data.data) {
                const mostKnownToken = filterMostKnown(data.data[symbol]);
                if (mostKnownToken) {
                    filteredData[symbol] = extractImportantData(mostKnownToken);
                }
            }

            return filteredData;
        } catch (error) {
            elizaLogger.error("❌ Error fetching token stats:", error);
            throw error;
        }
    }
}

export { CoinMarketCapAPI };