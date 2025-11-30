/**
 * 懒羊羊自动化平台 - Vue工具库
 * @author 懒羊羊
 * @description 基于实际测试修正，支持 Vue 2 和 Vue 3
 * 
 * 🔍 重要发现（实际测试）:
 * - Vue实例: element.__vue__ 直接可用
 * - 数据位置: vue.data (不是 vue.$data.data)
 * - 多选题格式: 数组 ['null', 'A', 'B'] (不是字符串 "012")
 */

class VueUtils {
    constructor() {
        this._instanceCache = new WeakMap();
    }

    /**
     * 获取元素的Vue实例
     * 
     * 🔍 实际测试发现:
     * - element.__vue__ 直接可用，不需要向上查找
     * - 但保留向上查找作为备用方案
     * 
     * @param {Element} element - DOM元素
     * @returns {object|null} Vue实例或null
     */
    getInstance(element) {
        if (!element) return null;

        // 检查缓存
        if (this._instanceCache.has(element)) {
            return this._instanceCache.get(element);
        }

        // 🔍 实际测试: __vue__ 直接可用
        let instance = element.__vue__ || null;

        // 备用方案: 向上查找 (保留兼容性)
        if (!instance) {
            let el = element.parentElement;
            for (let i = 0; i < 10 && el; i++) {
                if (el.__vue__) {
                    instance = el.__vue__;
                    break;
                }

                // Vue 2: _vnode.context
                if (el._vnode && el._vnode.context) {
                    instance = el._vnode.context;
                    break;
                }

                // Vue 3: __vueParentComponent
                if (el.__vueParentComponent) {
                    instance = el.__vueParentComponent.proxy;
                    break;
                }

                el = el.parentElement;
            }
        }

        // 缓存结果
        if (instance && element) {
            this._instanceCache.set(element, instance);
        }

        return instance;
    }

    /**
     * 获取题目数据
     * 
     * 🔍 实际测试发现:
     * - 数据在 vue.data (不是 vue.$data.data)
     * - vue.$props.data 也存在 (可能是同一引用)
     * 
     * @param {Element} questionItem - 题目元素
     * @returns {object|null} 题目数据
     */
    getQuestionData(questionItem) {
        const vue = this.getInstance(questionItem);
        if (!vue) return null;

        // 🔍 实际测试: 数据在 vue.data
        return vue.data || null;
    }

    /**
     * 获取答案
     * @param {Element} questionItem - 题目元素
     * @returns {*} 答案值
     */
    getAnswer(questionItem) {
        const data = this.getQuestionData(questionItem);
        return data?.stuAnswer || null;
    }

    /**
     * 更新Vue数据
     * 
     * 🔍 实际测试发现:
     * - 更新 vue.data.stuAnswer 即可
     * - 平台会自动监听变化并发送请求
     * 
     * @param {Element} element - DOM元素
     * @param {string} key - 数据键名
     * @param {*} value - 数据值
     * @returns {boolean} 是否更新成功
     */
    updateData(element, key, value) {
        const vue = this.getInstance(element);
        if (!vue || !vue.data) {
            return false;
        }

        try {
            // 🔍 实际测试: 直接更新 vue.data
            if (vue.$set) {
                // Vue 2: 使用 $set 确保响应式
                vue.$set(vue.data, key, value);
            } else {
                // Vue 3: 直接赋值
                vue.data[key] = value;
            }

            // 强制更新视图
            if (vue.$forceUpdate) {
                vue.$forceUpdate();
            }

            return true;
        } catch (error) {
            console.error('[VueUtils] 更新数据失败:', error);
            return false;
        }
    }

    /**
     * 批量更新数据
     * 减少 $forceUpdate 调用次数
     * @param {Array} updates - 更新列表 [{element, key, value}, ...]
     * @returns {number} 成功更新的数量
     */
    batchUpdate(updates) {
        if (!Array.isArray(updates) || updates.length === 0) {
            return 0;
        }

        const instanceUpdates = new Map();
        let successCount = 0;

        // 按实例分组
        for (const { element, key, value } of updates) {
            const instance = this.getInstance(element);
            if (!instance) continue;

            if (!instanceUpdates.has(instance)) {
                instanceUpdates.set(instance, []);
            }

            instanceUpdates.get(instance).push({ key, value });
        }

        // 批量更新每个实例
        for (const [instance, updateList] of instanceUpdates.entries()) {
            try {
                // 🔍 实际测试: 数据在 vue.data
                const data = instance.data;
                if (!data) continue;

                for (const { key, value } of updateList) {
                    if (instance.$set) {
                        instance.$set(data, key, value);
                    } else {
                        data[key] = value;
                    }
                    successCount++;
                }

                // 所有更新完成后,只调用一次 $forceUpdate
                if (instance.$forceUpdate) {
                    instance.$forceUpdate();
                }
            } catch (error) {
                console.error('[VueUtils] 批量更新失败:', error);
            }
        }

        return successCount;
    }

    /**
     * 检查题目是否已答
     * 
     * 🔍 实际测试发现:
     * - 多选题格式: ['null', 'A', 'B'] (数组)
     * - 第一个元素是字符串 'null'
     * 
     * @param {Element} questionItem - 题目元素
     * @returns {boolean} 是否已答
     */
    isAnswered(questionItem) {
        const answer = this.getAnswer(questionItem);
        if (!answer) return false;

        // 🔍 实际测试: 多选题是数组格式，第一个元素是 'null'
        if (Array.isArray(answer)) {
            return answer.some(v => v !== 'null' && v !== null && v !== '');
        }

        // 其他类型: 检查字符串是否有内容
        return String(answer).trim().length > 0;
    }

    /**
     * 触发Vue事件
     * @param {Element} element - DOM元素
     * @param {string} eventName - 事件名称
     * @param {*} payload - 事件数据
     * @returns {boolean} 是否触发成功
     */
    emit(element, eventName, payload = null) {
        const instance = this.getInstance(element);
        if (!instance || !instance.$emit) {
            return false;
        }

        try {
            instance.$emit(eventName, payload);
            return true;
        } catch (error) {
            console.error('[VueUtils] 触发事件失败:', error);
            return false;
        }
    }

    /**
     * 清理缓存
     */
    clearCache() {
        this._instanceCache = new WeakMap();
    }
}

// 导出单例
export default new VueUtils();
