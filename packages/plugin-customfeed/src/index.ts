import { Plugin } from "@elizaos/core";
import { trendingTokensProvider } from "./providers/customFeed.ts";

export * as providers from "./providers/index.ts";

export const customfeedPlugin: Plugin = {
    name: "customfeed",
    description: "A custom plugin that gives current token news from twitter",
    providers: [trendingTokensProvider],
};

