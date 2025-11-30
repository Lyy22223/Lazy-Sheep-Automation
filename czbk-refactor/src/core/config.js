/**
 * 懒羊羊自动化平台 - 配置管理器
 * @author 懒羊羊
 * @description 负责加载、保存和管理所有配置项
 */

class Config {
    constructor() {
        this.config = {};
        this.defaultConfig = {
            // API配置
            api: {
                baseUrl: 'http://localhost:8000',
                key: '',  // API密钥
                searchEndpoint: '/api/search',
                aiEndpoint: '/api/ai/answer',
                keyInfoEndpoint: '/api/key/info',
                uploadEndpoint: '/api/upload',
                timeout: 90000,
                retryCount: 3
            },

            // 答题配置
            answer: {
                delay: 500,              // 答题延迟（毫秒）
                retryCount: 3,           // 重试次数
                retryDelay: 1000,        // 重试延迟
                answerInterval: 1        // 答题间隔（秒）
            },

            // AI配置
            ai: {
                enabled: true,
                timeout: 90000,
                model: 'deepseek-chat',
                temperature: 0.3,
                presetModels: [
                    {
                        id: 'deepseek-chat',
                        name: 'DeepSeek-V3',
                        description: '快速响应模式',
                        features: ['快速', '准确']
                    },
                    {
                        id: 'deepseek-reasoner',
                        name: 'DeepSeek-R1',
                        description: '深度思考模式',
                        features: ['深度推理', '逻辑思维强']
                    }
                ]
            },

            // 正确率配置
            correctRate: {
                threshold: 85,
                autoSubmit: true
            },

            // 防作弊配置
            antiCheat: {
                bypass: true,            // 是否绕过防作弊检测
                bypassMethods: {
                    windowSwitch: true,  // 绕过窗口切换检测
                    visibility: true,    // 绕过页面可见性检测
                    keyboard: true,      // 解除键盘锁定
                    contextMenu: true    // 允许右键菜单
                }
            },

            // UI配置
            ui: {
                useVueUI: true,
                theme: 'light',
                position: { x: 100, y: 100 }
            },

            // 调试配置
            debug: false
        };

        this.load();
    }

    /**
     * 加载配置
     * 优先从 GM_getValue 加载,如果没有则使用默认配置
     */
    load() {
        try {
            const savedConfig = GM_getValue('czbk_config_v2');
            if (savedConfig) {
                this.config = JSON.parse(savedConfig);
                this.merge(this.defaultConfig, this.config);
            } else {
                // 尝试从旧版本迁移
                this.migrateFromOldVersion();
            }
        } catch (error) {
            console.error('加载配置失败:', error);
            this.config = { ...this.defaultConfig };
        }
    }

    /**
     * 从旧版本迁移配置
     */
    migrateFromOldVersion() {
        try {
            const oldApiKey = GM_getValue('czbk_api_key');
            const oldAutoCorrect = GM_getValue('autoCorrect');

            this.config = { ...this.defaultConfig };

            if (oldApiKey) {
                this.config.api.key = oldApiKey;
            }

            if (oldAutoCorrect !== undefined) {
                this.config.correction = this.config.correction || {};
                this.config.correction.enabled = oldAutoCorrect;
            }

            console.log('✅ 已从旧版本迁移配置');
            this.save();
        } catch (error) {
            console.error('迁移配置失败:', error);
            this.config = { ...this.defaultConfig };
        }
    }

    /**
     * 保存配置
     */
    save() {
        try {
            GM_setValue('czbk_config_v2', JSON.stringify(this.config));
        } catch (error) {
            console.error('保存配置失败:', error);
        }
    }

    /**
     * 获取配置项
     * @param {string} path - 配置路径,支持点号分隔,如 'api.baseUrl'
     * @param {*} defaultValue - 默认值
     * @returns {*}
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value !== undefined ? value : defaultValue;
    }

    /**
     * 设置配置项
     * @param {string} path - 配置路径
     * @param {*} value - 配置值
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let obj = this.config;

        for (const key of keys) {
            if (!(key in obj)) {
                obj[key] = {};
            }
            obj = obj[key];
        }

        obj[lastKey] = value;
        this.save();
    }

    /**
     * 获取所有配置
     * @returns {object}
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * 重置为默认配置
     */
    reset() {
        this.config = { ...this.defaultConfig };
        this.save();
    }

    /**
     * 合并配置
     * @param {object} target - 目标对象
     * @param {object} source - 源对象
     */
    merge(target, source) {
        for (const key in target) {
            if (!(key in source)) {
                source[key] = target[key];
            } else if (typeof target[key] === 'object' && !Array.isArray(target[key])) {
                this.merge(target[key], source[key]);
            }
        }
    }
}

// 导出单例
export default new Config();
