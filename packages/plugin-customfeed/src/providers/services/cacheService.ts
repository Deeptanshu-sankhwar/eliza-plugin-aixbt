import { IAgentRuntime, elizaLogger } from "@elizaos/core";

export class CacheService {
    private runtime: IAgentRuntime;
    private namespace: string;

    constructor(runtime: IAgentRuntime, namespace: string) {
        this.runtime = runtime;
        this.namespace = namespace;
    }

    private getKey(key: string): string {
        return `${this.namespace}/${key}`;
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const data = await this.runtime.cacheManager.get<{ 
                timestamp: number;
                data: T;
                expires: number;
            }>(this.getKey(key));

            if (!data) {
                return null;
            }

            const currentTime = Date.now();
            if (data.expires && currentTime > data.expires) {
                elizaLogger.warn(`⚠️ Cache expired for key: ${key}`);
                await this.delete(key);
                return null;
            }

            return data.data;
        } catch (error) {
            elizaLogger.error(`❌ Error retrieving cache for key ${key}:`, error);
            return null;
        }
    }

    async set<T>(key: string, data: T, ttlMs?: number): Promise<void> {
        try {
            const currentTime = Date.now();
            const cacheData = {
                timestamp: currentTime,
                data,
                expires: ttlMs ? currentTime + ttlMs : undefined
            };

            await this.runtime.cacheManager.set(
                this.getKey(key),
                cacheData,
                { expires: cacheData.expires }
            );

            elizaLogger.info(`✅ Successfully cached data for key: ${key}`);
        } catch (error) {
            elizaLogger.error(`❌ Error setting cache for key ${key}:`, error);
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.runtime.cacheManager.delete(this.getKey(key));
            elizaLogger.info(`✅ Successfully deleted cache for key: ${key}`);
        } catch (error) {
            elizaLogger.error(`❌ Error deleting cache for key ${key}:`, error);
        }
    }

    async getTimeToExpiry(key: string): Promise<number | null> {
        const data = await this.runtime.cacheManager.get<{ 
            timestamp: number;
            expires: number;
        }>(this.getKey(key));

        if (!data || !data.expires) {
            return null;
        }

        return Math.max(0, data.expires - Date.now());
    }
}