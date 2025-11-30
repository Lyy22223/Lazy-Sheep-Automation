/**
 * 懒羊羊自动化平台 - 平台管理器
 * @author 懒羊羊
 * @description 负责检测和管理所有平台适配器
 */

import { logger } from '../core/utils.js';
import CzbkAdapter from './czbk/adapter.js';

class PlatformManager {
    constructor() {
        this.adapters = [];
        this.currentAdapter = null;

        // 注册所有平台适配器
        this.registerDefaultAdapters();
    }

    /**
     * 注册默认的平台适配器
     */
    registerDefaultAdapters() {
        // 传智播客
        this.registerAdapter(new CzbkAdapter());

        // TODO: 添加更多平台
        // this.registerAdapter(new ChaoxingAdapter());
    }

    /**
     * 注册平台适配器
     * @param {PlatformAdapter} adapter - 平台适配器实例
     */
    registerAdapter(adapter) {
        if (!adapter) {
            logger.error('[PlatformManager] 无效的适配器');
            return;
        }

        this.adapters.push(adapter);
        logger.debug(`[PlatformManager] 注册平台: ${adapter.getPlatformName()}`);
    }

    /**
     * 检测并选择当前平台
     * @returns {PlatformAdapter|null} 匹配的平台适配器
     */
    detectPlatform() {
        for (const adapter of this.adapters) {
            if (adapter.matchPage()) {
                this.currentAdapter = adapter;
                logger.info(`[PlatformManager] 检测到平台: ${adapter.getPlatformName()}`);
                return adapter;
            }
        }

        logger.warn('[PlatformManager] 未检测到支持的平台');
        return null;
    }

    /**
     * 获取当前平台适配器
     * @returns {PlatformAdapter|null} 当前平台适配器
     */
    getCurrentAdapter() {
        if (!this.currentAdapter) {
            this.detectPlatform();
        }
        return this.currentAdapter;
    }

    /**
     * 根据ID获取平台适配器
     * @param {string} platformId - 平台ID
     * @returns {PlatformAdapter|null}
     */
    getAdapterById(platformId) {
        return this.adapters.find(adapter =>
            adapter.getPlatformId() === platformId
        ) || null;
    }

    /**
     * 获取所有已注册的平台
     * @returns {Array<object>} 平台列表
     */
    getAllPlatforms() {
        return this.adapters.map(adapter => ({
            id: adapter.getPlatformId(),
            name: adapter.getPlatformName(),
            matched: adapter.matchPage()
        }));
    }

    /**
     * 重置当前平台
     */
    reset() {
        this.currentAdapter = null;
    }
}

// 导出单例
export default new PlatformManager();
