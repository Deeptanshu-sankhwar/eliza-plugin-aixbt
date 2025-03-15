import { IAgentRuntime, elizaLogger } from "@elizaos/core";
import { Scraper } from "agent-twitter-client";

/**
 * Helper to convert an array of cookie objects into the
 * "key=value; Domain=...; ..." format that Scraper expects.
 */
function cookieArrayToStringList(cookiesArray: any[]): string[] {
    return cookiesArray.map(
        (cookie) =>
            `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ${
                cookie.secure ? "Secure" : ""
            }; ${cookie.httpOnly ? "HttpOnly" : ""}; SameSite=${
                cookie.sameSite || "Lax"
            }`
    );
}

export async function initializeTwitterScraper(runtime: IAgentRuntime): Promise<{ scraper: Scraper; kolList: string[] }> {
    const TWITTER_USERNAME = runtime.getSetting("TWITTER_USERNAME") || process.env.TWITTER_USERNAME;
    const TWITTER_PASSWORD = runtime.getSetting("TWITTER_PASSWORD") || process.env.TWITTER_PASSWORD;
    const TWITTER_EMAIL = runtime.getSetting("TWITTER_EMAIL") || process.env.TWITTER_EMAIL;
    const TWITTER_KOLS = (runtime.getSetting("TWITTER_KOLS") || process.env.TWITTER_KOLS || "").split(",");

    elizaLogger.info(`🔹 Using Twitter Username: ${TWITTER_USERNAME}`);
    elizaLogger.info(`🔹 Using Twitter Email: ${TWITTER_EMAIL}`);

    if (!TWITTER_USERNAME || !TWITTER_PASSWORD || !TWITTER_EMAIL) {
        throw new Error("❌ Missing Twitter credentials in environment settings.");
    }

    const scraper = new Scraper();
    let cookiesLoaded = false;

    try {
        const cachedCookies = await runtime.cacheManager.get<any[]>(`twitter/${TWITTER_USERNAME}/cookies`);

        if (cachedCookies) {
            elizaLogger.info("✅ Using cached Twitter cookies for authentication.");
            const cookieStrings = cookieArrayToStringList(cachedCookies);
            await scraper.setCookies(cookieStrings);

            if (await scraper.isLoggedIn()) {
                cookiesLoaded = true;
            } else {
                elizaLogger.warn("⚠️ Cached cookies were invalid or expired. Will log in manually...");
            }
        } else {
            elizaLogger.warn("⚠️ No cached cookies found. Will log in manually...");
        }
    } catch (error) {
        elizaLogger.error("⚠️ Error retrieving cached cookies:", error);
    }

    if (!cookiesLoaded) {
        try {
            elizaLogger.info("🔹 Attempting Twitter login...");
            await scraper.login(TWITTER_USERNAME, TWITTER_PASSWORD, TWITTER_EMAIL);
            elizaLogger.info("✅ Twitter login successful.");

            const newCookies = await scraper.getCookies();
            await runtime.cacheManager.set(`twitter/${TWITTER_USERNAME}/cookies`, newCookies);
            elizaLogger.info("✅ Twitter cookies cached successfully.");
        } catch (error) {
            elizaLogger.error("❌ Twitter login failed:", error);
            throw error;
        }
    }

    if (TWITTER_KOLS.length > 0) {
        elizaLogger.info(`🔹 Using KOL list: ${TWITTER_KOLS.join(", ")}`);
    } else {
        elizaLogger.warn("⚠️ No KOLs specified. KOL searches will be skipped.");
    }

    return { scraper, kolList: TWITTER_KOLS };
}