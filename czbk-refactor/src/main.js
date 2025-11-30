/**
 * 懒羊羊自动化平台 - 主入口文件
 * @author 懒羊羊
 * @description 初始化并启动自动答题系统
 */

import Config from './core/config.js';
import { logger } from './core/utils.js';
import PlatformManager from './platforms/manager.js';
import CZBKAdapter from './platforms/czbk/adapter.js';
import NetworkInterceptor from './network/interceptor.js';
import UIManager from './ui/index.js';
import AntiCheatBypass from './core/anti-cheat-bypass.js';

class AutoAnswerSystem {
    constructor() {
        this.initialized = false;
        this.currentPlatform = null;
    }

    /**
     * 初始化系统
     */
    async init() {
        if (this.initialized) {
            logger.warn('[System] 系统已初始化');
            return;
        }

        try {
            logger.info('[System] 🚀 懒羊羊自动化平台启动中...');

            // 1. 解除平台限制（最优先）
            AntiCheatBypass.enable();
            logger.info('[System] ✓ 平台限制已解除');

            // 2. 加载配置
            Config.load();
            logger.info('[System] ✓ 配置加载完成');

            // 3. 注册平台适配器
            PlatformManager.registerAdapter(new CZBKAdapter());
            logger.info('[System] ✓ 平台适配器注册完成');

            // 4. 检测当前平台
            this.currentPlatform = PlatformManager.detectPlatform();

            if (!this.currentPlatform) {
                logger.warn('[System] ⚠️ 当前页面不是支持的平台');
                return;
            }

            logger.info(`[System] ✓ 检测到平台: ${this.currentPlatform.getPlatformName()}`);

            // 5. 启动网络拦截器
            NetworkInterceptor.start();
            logger.info('[System] ✓ 网络拦截器已启动');

            // 6. 初始化UI
            await this.initUI();
            logger.info('[System] ✓ UI已初始化');

            // 7. 注册菜单命令
            this.registerMenuCommands();

            this.initialized = true;
            logger.info('[System] ✅ 系统初始化完成');

            // 显示欢迎消息
            this.showWelcome();

        } catch (error) {
            logger.error('[System] 系统初始化失败:', error);
            throw error;
        }
    }

    /**
     * 初始化UI
     */
    async initUI() {
        try {
            // 等待DOM加载完成
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            // 初始化UI管理器
            UIManager.init();

        } catch (error) {
            logger.error('[System] UI初始化失败:', error);
        }
    }

    /**
     * 注册菜单命令
     */
    registerMenuCommands() {
        if (typeof GM_registerMenuCommand === 'undefined') {
            return;
        }

        GM_registerMenuCommand('🎯 打开控制面板', () => {
            UIManager.show();
        });

        GM_registerMenuCommand('⚙️ 设置', () => {
            UIManager.show();
        });

        GM_registerMenuCommand('ℹ️ 关于', () => {
            alert(`懒羊羊自动化平台 v2.0.0-alpha.3\n作者: 懒羊羊\n当前平台: ${this.currentPlatform.getPlatformName()}`);
        });
    }

    /**
     * 显示欢迎消息
     */
    showWelcome() {
        console.log(
            '%c懒羊羊自动化平台',
            'color: #1890ff; font-size: 20px; font-weight: bold;'
        );
        console.log(
            '%c版本: 2.0.0-alpha.3 | 作者: 懒羊羊',
            'color: #52c41a; font-size: 12px;'
        );
        console.log(
            `%c当前平台: ${this.currentPlatform.getPlatformName()}`,
            'color: #faad14; font-size: 12px;'
        );
        console.log(
            '%c点击右下角按钮开始使用',
            'color: #ff4d4f; font-size: 14px; font-weight: bold;'
        );
    }

    /**
     * 获取当前平台
     */
    getCurrentPlatform() {
        return this.currentPlatform;
    }
}

// 创建全局实例
const system = new AutoAnswerSystem();

// 自动初始化
(async () => {
    try {
        await system.init();
    } catch (error) {
        console.error('系统启动失败:', error);
    }
})();

// 导出到全局 (方便调试)
if (typeof unsafeWindow !== 'undefined') {
    unsafeWindow.AutoAnswerSystem = system;
} else {
    window.AutoAnswerSystem = system;
}

export default system;
