/**
 * 懒羊羊自动化平台 - UI管理器
 * @author 懒羊羊
 * @description 负责初始化和管理Vue UI组件
 */

import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import Panel from './panel.vue';
import { logger } from '../core/utils.js';

class UIManager {
    constructor() {
        this.app = null;
        this.mounted = false;
        this.container = null;
    }

    /**
     * 初始化UI
     */
    init() {
        if (this.mounted) {
            logger.warn('[UI] UI已初始化');
            return;
        }

        try {
            // 创建容器
            this.container = document.createElement('div');
            this.container.id = 'lazy-sheep-ui-container';
            document.body.appendChild(this.container);

            // 创建Vue应用
            this.app = createApp(Panel);
            this.app.use(Antd);

            // 挂载到容器
            this.app.mount(this.container);

            this.mounted = true;
            logger.info('[UI] UI已初始化');

            // 添加Ant Design样式
            this.injectStyles();

        } catch (error) {
            logger.error('[UI] UI初始化失败:', error);
        }
    }

    /**
     * 注入样式
     * @private
     */
    injectStyles() {
        // Ant Design Vue CSS
        const antdCSS = document.createElement('link');
        antdCSS.rel = 'stylesheet';
        antdCSS.href = 'https://cdn.jsdelivr.net/npm/ant-design-vue@4/dist/reset.css';
        document.head.appendChild(antdCSS);

        // 自定义样式
        const customStyle = document.createElement('style');
        customStyle.textContent = `
            #lazy-sheep-ui-container {
                position: fixed;
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            }
            
            /* 确保浮动按钮在最上层 */
            .ant-float-btn {
                z-index: 99999 !important;
            }
            
            /* Drawer样式优化 */
            .ant-drawer {
                z-index: 99999 !important;
            }
            
            .ant-drawer-body {
                padding: 16px;
                position: relative;
            }
            
            /* 下拉框弹出层样式 */
            .ant-select-dropdown {
                z-index: 100001 !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            
            /* 下拉框选项 */
            .ant-select-item {
                cursor: pointer !important;
                pointer-events: auto !important;
            }
            
            /* 确保下拉框可点击 */
            .ant-select {
                position: relative;
                z-index: 1;
                pointer-events: auto !important;
            }
            
            .ant-select-selector {
                cursor: pointer !important;
                pointer-events: auto !important;
                user-select: none !important;
            }
            
            .ant-select-arrow {
                pointer-events: none !important;
            }
            
            /* 确保下拉框不被遮挡 */
            .ant-drawer .ant-select {
                z-index: 10 !important;
            }
            
            /* 模态框样式 */
            .ant-modal {
                z-index: 100000 !important;
            }
            
            /* 消息提示样式 */
            .ant-message {
                z-index: 100002 !important;
            }
            
            /* 避免与页面样式冲突 */
            #lazy-sheep-ui-container * {
                box-sizing: border-box;
            }
        `;
        document.head.appendChild(customStyle);
    }

    /**
     * 销毁UI
     */
    destroy() {
        if (!this.mounted) return;

        try {
            if (this.app) {
                this.app.unmount();
                this.app = null;
            }

            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
                this.container = null;
            }

            this.mounted = false;
            logger.info('[UI] UI已销毁');

        } catch (error) {
            logger.error('[UI] UI销毁失败:', error);
        }
    }

    /**
     * 显示UI
     */
    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }

    /**
     * 隐藏UI
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    /**
     * 切换UI显示状态
     */
    toggle() {
        if (this.container) {
            const isHidden = this.container.style.display === 'none';
            this.container.style.display = isHidden ? 'block' : 'none';
        }
    }
}

// 导出单例
export default new UIManager();
