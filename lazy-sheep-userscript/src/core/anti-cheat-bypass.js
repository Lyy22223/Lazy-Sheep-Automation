/**
 * 反作弊机制绕过
 * 解除平台的复制粘贴限制、右键菜单限制等
 */

import { logger } from './utils.js';

class AntiCheatBypass {
    constructor() {
        this.isEnabled = false;
    }

    /**
     * 启用绕过
     */
    enable() {
        if (this.isEnabled) {
            logger.debug('[AntiCheat] 已启用，跳过重复初始化');
            return;
        }

        logger.info('[AntiCheat] 解除平台限制...');
        
        // 1. 解除复制粘贴限制
        this.enableCopyPaste();
        
        // 2. 解除右键菜单限制
        this.enableContextMenu();
        
        // 3. 解除文本选择限制
        this.enableTextSelection();
        
        // 4. 解除拖拽限制
        this.enableDragDrop();
        
        // 5. 移除输入框限制
        this.removeInputRestrictions();
        
        this.isEnabled = true;
        logger.info('[AntiCheat] ✅ 所有限制已解除');
    }

    /**
     * 解除复制粘贴限制
     */
    enableCopyPaste() {
        const events = ['copy', 'cut', 'paste'];
        
        events.forEach(eventName => {
            // 移除现有的事件监听器
            document.addEventListener(eventName, (e) => {
                // 不拦截我们自己UI组件的事件
                if (e.target.closest('#lazy-sheep-ui-container')) {
                    return;
                }
                e.stopImmediatePropagation();
            }, true);
            
            // 允许默认行为
            document.addEventListener(eventName, (e) => {
                // 不阻止默认行为
            }, false);
        });
        
        logger.debug('[AntiCheat] 已解除复制粘贴限制');
    }

    /**
     * 解除右键菜单限制
     */
    enableContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            // 不拦截我们自己UI组件的事件
            if (e.target.closest('#lazy-sheep-ui-container')) {
                return;
            }
            e.stopImmediatePropagation();
        }, true);
        
        // 移除所有 oncontextmenu 属性
        const removeContextMenuBlock = () => {
            document.body.oncontextmenu = null;
            document.oncontextmenu = null;
            
            // 移除所有元素的 oncontextmenu
            document.querySelectorAll('[oncontextmenu]').forEach(el => {
                el.oncontextmenu = null;
                el.removeAttribute('oncontextmenu');
            });
        };
        
        removeContextMenuBlock();
        
        // 持续监控并移除
        setInterval(removeContextMenuBlock, 1000);
        
        logger.debug('[AntiCheat] 已解除右键菜单限制');
    }

    /**
     * 解除文本选择限制
     */
    enableTextSelection() {
        // 移除禁止选择的CSS
        const style = document.createElement('style');
        style.textContent = `
            * {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }
            input, textarea {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }
        `;
        document.head.appendChild(style);
        
        // 移除 onselectstart 限制
        document.onselectstart = null;
        document.body.onselectstart = null;
        
        // 移除所有元素的 onselectstart
        const removeSelectBlock = () => {
            document.querySelectorAll('[onselectstart]').forEach(el => {
                el.onselectstart = null;
                el.removeAttribute('onselectstart');
            });
        };
        
        removeSelectBlock();
        setInterval(removeSelectBlock, 1000);
        
        logger.debug('[AntiCheat] 已解除文本选择限制');
    }

    /**
     * 解除拖拽限制
     */
    enableDragDrop() {
        const events = ['drag', 'dragstart', 'dragend', 'drop'];
        
        events.forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                e.stopImmediatePropagation();
            }, true);
        });
        
        logger.debug('[AntiCheat] 已解除拖拽限制');
    }

    /**
     * 移除输入框限制
     */
    removeInputRestrictions() {
        const removeRestrictions = () => {
            // 查找所有输入框
            const inputs = document.querySelectorAll('input, textarea');
            
            inputs.forEach(input => {
                // 移除只读属性
                if (input.hasAttribute('readonly') && !input.dataset.originalReadonly) {
                    // 保留原本就是只读的
                    input.removeAttribute('readonly');
                }
                
                // 移除禁用属性
                if (input.hasAttribute('disabled') && !input.dataset.originalDisabled) {
                    input.removeAttribute('disabled');
                }
                
                // 移除事件限制
                input.onpaste = null;
                input.oncopy = null;
                input.oncut = null;
                input.ondrop = null;
                input.oncontextmenu = null;
                
                // 移除属性限制
                input.removeAttribute('onpaste');
                input.removeAttribute('oncopy');
                input.removeAttribute('oncut');
                input.removeAttribute('ondrop');
                input.removeAttribute('oncontextmenu');
                
                // 允许自动完成
                if (input.hasAttribute('autocomplete') && input.getAttribute('autocomplete') === 'off') {
                    input.setAttribute('autocomplete', 'on');
                }
            });
        };
        
        // 立即执行
        removeRestrictions();
        
        // 持续监控新增的输入框
        const observer = new MutationObserver(() => {
            removeRestrictions();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        logger.debug('[AntiCheat] 已移除输入框限制');
    }

    /**
     * 强制启用键盘快捷键
     */
    enableKeyboardShortcuts() {
        // 拦截所有 keydown 事件
        document.addEventListener('keydown', (e) => {
            // 允许常用快捷键
            const allowedKeys = {
                'KeyC': true,  // Ctrl+C
                'KeyV': true,  // Ctrl+V
                'KeyX': true,  // Ctrl+X
                'KeyA': true,  // Ctrl+A
                'KeyZ': true,  // Ctrl+Z
                'KeyY': true,  // Ctrl+Y
                'KeyF': true,  // Ctrl+F
            };
            
            if (e.ctrlKey && allowedKeys[e.code]) {
                e.stopImmediatePropagation();
            }
        }, true);
        
        logger.debug('[AntiCheat] 已启用键盘快捷键');
    }

    /**
     * 清除所有控制台错误（某些平台会检测）
     */
    clearConsoleErrors() {
        // 覆盖 console.error
        const originalError = console.error;
        console.error = function(...args) {
            // 过滤掉平台的检测错误
            const message = args.join(' ');
            if (!message.includes('防作弊') && !message.includes('检测到')) {
                originalError.apply(console, args);
            }
        };
    }
}

// 导出单例
const antiCheatBypass = new AntiCheatBypass();

export default antiCheatBypass;
