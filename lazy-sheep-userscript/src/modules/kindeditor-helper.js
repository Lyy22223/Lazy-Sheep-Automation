/**
 * 懒羊羊自动化平台 - KindEditor辅助工具
 * @author 懒羊羊
 * 
 * 实际测试发现:
 * - KindEditor实例存储在 window.KindEditor.instances (数组)
 * - 通过 container 匹配 textarea
 * - 使用 editor.html() 设置/获取内容
 * - 使用 editor.sync() 同步到textarea和Vue
 */

import { logger } from '../core/utils.js';

class KindEditorHelper {
    /**
     * 获取所有KindEditor实例
     * @returns {Array} KindEditor实例数组
     */
    getAllInstances() {
        return window.KindEditor?.instances || [];
    }

    /**
     * 查找textarea对应的KindEditor实例
     * 
     * 实际测试匹配方式:
     * instances.find(inst => inst.container.contains(textarea))
     * 
     * @param {HTMLTextAreaElement} textarea - 文本框元素
     * @returns {object|null} KindEditor实例
     */
    findEditorByTextarea(textarea) {
        if (!textarea) return null;

        const instances = this.getAllInstances();

        return instances.find(inst => {
            // 实际测试: container可能是 elm 或直接是 DOM元素
            const containerEl = inst.container?.elm || inst.container;
            return containerEl && containerEl.contains(textarea);
        }) || null;
    }

    /**
     * 查找题目元素对应的KindEditor实例
     * @param {Element} questionItem - 题目容器元素
     * @returns {object|null} KindEditor实例
     */
    findEditorByQuestion(questionItem) {
        const textarea = questionItem.querySelector('textarea');
        return this.findEditorByTextarea(textarea);
    }

    /**
     * 获取编辑器内容
     * @param {object} editor - KindEditor实例
     * @returns {string} HTML内容
     */
    getContent(editor) {
        if (!editor) return '';

        try {
            return editor.html() || '';
        } catch (error) {
            logger.error('[KindEditor] 获取内容失败:', error);
            return '';
        }
    }

    /**
     * 设置编辑器内容
     * 
     * 实际测试API:
     * - editor.html(content) - 设置HTML内容
     * - editor.sync() - 同步到textarea和Vue
     * 
     * @param {object} editor - KindEditor实例
     * @param {string} content - HTML内容
     * @returns {boolean} 是否成功
     */
    setContent(editor, content) {
        if (!editor) return false;

        try {
            // 设置HTML内容
            editor.html(content);

            // 同步到textarea和Vue数据
            editor.sync();

            logger.debug('[KindEditor] 设置内容成功');
            return true;
        } catch (error) {
            logger.error('[KindEditor] 设置内容失败:', error);
            return false;
        }
    }

    /**
     * 获取编辑器文本内容（无HTML标签）
     * @param {object} editor - KindEditor实例
     * @returns {string} 文本内容
     */
    getText(editor) {
        if (!editor) return '';

        try {
            return editor.text() || '';
        } catch (error) {
            logger.error('[KindEditor] 获取文本失败:', error);
            return '';
        }
    }

    /**
     * 清空编辑器内容
     * @param {object} editor - KindEditor实例
     * @returns {boolean} 是否成功
     */
    clear(editor) {
        return this.setContent(editor, '');
    }

    /**
     * 检查KindEditor是否可用
     * @returns {boolean}
     */
    isAvailable() {
        return typeof window.KindEditor !== 'undefined' &&
            Array.isArray(window.KindEditor.instances);
    }

    /**
     * 获取KindEditor统计信息
     * @returns {object}
     */
    getStats() {
        const instances = this.getAllInstances();
        return {
            total: instances.length,
            available: this.isAvailable()
        };
    }
}

// 导出单例
export default new KindEditorHelper();
