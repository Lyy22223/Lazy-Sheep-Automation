/**
 * 懒羊羊自动化平台 - 传智播客平台DOM选择器
 * @author 懒羊羊
 * @description 基于实际测试验证 ✅
 * 
 * 数据来源:
 * - docs/app.js作业功能总结.md
 * - docs/testing-findings.md
 * - test/实际DOM结构信息
 */

export default {
    // ==================== 题目容器 ====================

    /**
     * 题目容器
     * - 答题页面: .question-item-box[data-id] （91个题目，每个都有data-id和__vue__）
     * - 刷课习题页: .question-item, .question-info-box, .questionItem （旧版兼容）
     */
    questionItem: '.question-item-box[data-id], .question-item, .question-info-box, .questionItem',

    /**
     * 题目内容容器
     */
    questionContent: '.question-content',

    /**
     * 各题型容器
     * 基于 app.js 第 8258-8269 行的题型导航
     */
    questionTypeBoxes: {
        danxuan: '#danxuanQuestionBox',     // 单选题容器
        duoxuan: '#duoxuanQuestionBox',     // 多选题容器
        panduan: '#panduanQuestionBox',     // 判断题容器
        tiankong: '#tiankongQuestionBox',   // 填空题容器
        jianda: '#jiandaQuestionBox',       // 简答题容器
        biancheng: '#bianchengQuestionBox'  // 编程题容器
    },

    // ==================== 选项（实际测试验证）====================

    /**
     * 单选题选项
     * 实际测试: value="A", "B", "C", "D" (字母格式)
     */
    radio: 'input[type="radio"]',
    radioLabel: 'label.el-radio',

    /**
     * 多选题选项
     * 实际测试: 194个选项结构
     */
    checkbox: 'input[type="checkbox"]',
    checkboxLabel: 'label.el-checkbox',

    /**
     * 选项容器
     */
    optionItem: '.question-option-item',

    // ==================== 输入框 ====================

    /**
     * 填空题输入框
     */
    fillInput: 'input.tk_input',

    /**
     * 简答题文本框
     * 实际测试: value为空（由KindEditor管理）
     */
    textarea: 'textarea',

    // ==================== KindEditor（实际测试发现）====================

    /**
     * KindEditor编辑器容器
     */
    editorBox: '.editor-box',

    /**
     * KindEditor的textarea
     */
    kindEditorTextarea: 'textarea.ke-edit-textarea',

    /**
     * KindEditor的iframe
     * 实际测试: 3个KindEditor实例
     */
    kindEditorIframe: 'iframe.ke-edit-iframe',

    // ==================== 按钮 ====================

    /**
     * 提交按钮
     */
    submitButton: '.submit .el-button',

    /**
     * 保存按钮（仅作业可用）
     */
    saveButton: '.save .el-button',

    // ==================== 对话框 ====================

    /**
     * 确认对话框（提交时出现）
     */
    confirmDialog: '.el-message-box, .el-dialog',

    /**
     * 确认按钮文本
     */
    confirmButtonTexts: ['坚持交卷', '确认交卷', '确定'],

    /**
     * 成功提示
     */
    successMessage: '.el-message--success',

    // ==================== 作业列表页面 ====================

    /**
     * 作业列表表格
     */
    busyworkTable: '.el-table',
    busyworkTableRow: '.el-table__row',
    busyworkTableCell: '.el-table__cell',

    // ==================== 答题卡 ====================

    /**
     * 答题卡容器
     */
    answerCard: '.answer-card',
    answerCardItem: '.answer-card-item',

    // ==================== 导航 ====================

    /**
     * 题目导航
     */
    questionNav: '.question-nav',
    questionNavItem: '.question-nav-item'
};
