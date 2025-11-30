/**
 * 刷课管理器
 * 负责自动刷课的整体流程控制
 */

import { logger } from '../core/utils.js';
import Config from '../core/config.js';
import VideoHandler from './video-handler.js';
import AutoAnswer from './auto-answer.js';

export default class CourseAuto {
    constructor() {
        this.isRunning = false;
        this.config = {
            playbackSpeed: Config.get('course.playbackSpeed', 2.0),
            instantFinish: Config.get('course.instantFinish', false),
            autoNext: Config.get('course.autoNext', true)
        };
        this.stats = {
            videosCompleted: 0,
            exercisesCompleted: 0,
            totalTime: 0
        };
    }

    /**
     * 检测页面类型
     */
    detectPageType() {
        const hasVideo = !!document.querySelector('video');
        const hasQuestion = !!document.querySelector('.answer-questions-box, .questions-lists-box, .question-info-box');

        if (hasVideo && !hasQuestion) return 'video';
        if (hasQuestion) return 'exercise';
        return 'unknown';
    }

    /**
     * 检测是否为习题页面
     */
    static isExercisePage() {
        return !!document.querySelector('.answer-questions-box, .questions-lists-box, .question-info-box');
    }

    /**
     * 获取当前课程点元素
     */
    getCurrentPointItem() {
        const selector = '.point-item-box .point-name-box.playing-status, ' +
            '.point-item-box .point-topic-box.playing-status, ' +
            '.point-item-box.active, .point-item-box.current';
        return document.querySelector(selector)?.closest('.point-item-box');
    }

    /**
     * 获取下一个课程点
     */
    getNextPointItem() {
        let currentPoint = this.getCurrentPointItem();
        if (!currentPoint) {
            // 如果找不到当前节点，从第一个开始
            return document.querySelector('.point-item-box');
        }

        let nextPoint = currentPoint.nextElementSibling;
        
        while (nextPoint) {
            if (nextPoint.classList.contains('point-item-box') && !this.isPointCompleted(nextPoint)) {
                return nextPoint;
            }
            nextPoint = nextPoint.nextElementSibling;
        }

        return null;
    }

    /**
     * 检查课程点是否已完成
     */
    isPointCompleted(pointItem) {
        if (!pointItem) return true;

        // 检查视频进度
        const videoProgress = pointItem.querySelector('.point-name-box .point-progress-box')?.textContent.trim();
        const videoCompleted = videoProgress === '100%' || 
                              pointItem.querySelector('.point-name-box')?.textContent.includes('100%') || 
                              pointItem.classList.contains('completed');

        // 检查习题进度
        const exerciseBox = pointItem.querySelector('.point-topic-box');
        const exerciseCompleted = !exerciseBox || 
                                 exerciseBox.querySelector('.point-progress-box')?.textContent.trim() === '100%' || 
                                 exerciseBox.textContent.includes('100%');

        return videoCompleted && exerciseCompleted;
    }

    /**
     * 点击课程点
     */
    async clickPointItem(pointItem, isExercise = false) {
        try {
            const targetBox = isExercise 
                ? pointItem.querySelector('.point-topic-box') 
                : pointItem.querySelector('.point-name-box');
            
            if (targetBox) {
                targetBox.click();
                logger.debug(`[Course] 点击${isExercise ? '习题' : '视频'}节点`);
                await this.sleep(1500);
                return true;
            }
            return false;
        } catch (e) {
            logger.error('[Course] 点击节点失败:', e);
            return false;
        }
    }

    /**
     * 处理视频页面
     */
    async handleVideoPage() {
        try {
            logger.info('[Course] 处理视频页面...');

            const currentPoint = this.getCurrentPointItem();
            if (currentPoint && this.isPointCompleted(currentPoint)) {
                logger.info('[Course] 当前视频已完成，跳过');
                return await this.navigateToNext();
            }

            const startTime = Date.now();

            // 根据配置选择处理方式
            const success = this.config.instantFinish 
                ? await VideoHandler.instantFinish() 
                : await VideoHandler.play(this.config.playbackSpeed);

            if (success) {
                this.stats.videosCompleted++;
                this.stats.totalTime += (Date.now() - startTime) / 1000;
                logger.info(`[Course] 视频完成 (${this.stats.videosCompleted}个)`);

                // 调用平台完成接口（如果存在）
                if (typeof window.finishWxCourse === 'function') {
                    try {
                        window.finishWxCourse();
                        logger.debug('[Course] 调用平台完成接口');
                    } catch (e) {
                        logger.warn('[Course] 平台完成接口调用失败:', e);
                    }
                }

                await this.sleep(2000);

                // 检查是否有习题
                const updatedPoint = this.getCurrentPointItem();
                if (updatedPoint) {
                    const exerciseBox = updatedPoint.querySelector('.point-topic-box');
                    if (exerciseBox && exerciseBox.querySelector('.point-progress-box')?.textContent.trim() !== '100%') {
                        logger.info('[Course] 检测到习题，准备处理...');
                        await this.clickPointItem(updatedPoint, true);
                        await this.sleep(2000);
                        return await this.handleExercisePage();
                    }
                }

                return await this.navigateToNext();
            }

            return false;
        } catch (e) {
            logger.error('[Course] 处理视频失败:', e);
            return false;
        }
    }

    /**
     * 处理习题页面
     */
    async handleExercisePage() {
        try {
            logger.info('[Course] 处理习题页面...');
            await this.sleep(1000);

            if (!document.querySelector('.question-item, .question-info-box')) {
                logger.warn('[Course] 未找到题目，跳过');
                return await this.navigateToNext();
            }

            // 调用自动答题
            logger.info('[Course] 开始自动答题...');
            try {
                await AutoAnswer.start();
                this.stats.exercisesCompleted++;
                logger.info(`[Course] 习题完成 (${this.stats.exercisesCompleted}个)`);
            } catch (e) {
                logger.error('[Course] 自动答题失败:', e);
            }

            await this.sleep(2000);

            // 查找并点击提交按钮
            const submitBtn = this.findButton('提交');
            if (submitBtn) {
                submitBtn.click();
                logger.info('[Course] 已提交习题');
                await this.sleep(2000);
            }

            return await this.navigateToNext();
        } catch (e) {
            logger.error('[Course] 处理习题失败:', e);
            return false;
        }
    }

    /**
     * 导航到下一个课程点
     */
    async navigateToNext() {
        try {
            if (!this.config.autoNext) {
                logger.info('[Course] 自动跳转已禁用，停止');
                return false;
            }

            logger.info('[Course] 准备进入下一个课程点...');
            const nextPoint = this.getNextPointItem();

            if (nextPoint) {
                await this.clickPointItem(nextPoint, false);
                await this.sleep(2000);

                // 等待页面加载
                for (let i = 0; i < 10; i++) {
                    const pageType = this.detectPageType();
                    if (pageType !== 'unknown') break;
                    await this.sleep(500);
                }

                return true; // 继续主循环
            } else {
                logger.info('[Course] 🎉 所有课程已完成！');
                return false; // 结束主循环
            }
        } catch (e) {
            logger.error('[Course] 导航失败:', e);
            return false;
        }
    }

    /**
     * 开始刷课
     */
    async start() {
        if (this.isRunning) {
            logger.warn('[Course] 刷课已在运行中');
            return;
        }

        this.isRunning = true;
        this.stats = {
            videosCompleted: 0,
            exercisesCompleted: 0,
            totalTime: 0
        };

        logger.info('[Course] 🚀 开始自动刷课...');
        const startTime = Date.now();

        try {
            while (this.isRunning) {
                const pageType = this.detectPageType();
                logger.debug(`[Course] 当前页面类型: ${pageType}`);

                let shouldContinue = false;

                switch (pageType) {
                    case 'video':
                        shouldContinue = await this.handleVideoPage();
                        break;
                    case 'exercise':
                        shouldContinue = await this.handleExercisePage();
                        break;
                    default:
                        logger.warn('[Course] 未识别的页面类型，尝试跳转下一个');
                        shouldContinue = await this.navigateToNext();
                }

                if (!shouldContinue) {
                    logger.info('[Course] 刷课流程结束');
                    break;
                }

                await this.sleep(1000);
            }
        } catch (e) {
            logger.error('[Course] 刷课异常:', e);
        } finally {
            this.isRunning = false;
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.info(`[Course] ✅ 刷课完成！视频: ${this.stats.videosCompleted}, 习题: ${this.stats.exercisesCompleted}, 耗时: ${totalTime}秒`);
        }
    }

    /**
     * 停止刷课
     */
    stop() {
        if (!this.isRunning) {
            logger.warn('[Course] 刷课未在运行中');
            return;
        }

        this.isRunning = false;
        logger.info('[Course] 🛑 已停止刷课');
    }

    /**
     * 更新配置
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        
        // 保存到配置
        if (config.playbackSpeed !== undefined) {
            Config.set('course.playbackSpeed', config.playbackSpeed);
        }
        if (config.instantFinish !== undefined) {
            Config.set('course.instantFinish', config.instantFinish);
        }
        if (config.autoNext !== undefined) {
            Config.set('course.autoNext', config.autoNext);
        }

        Config.save();
        logger.debug('[Course] 配置已更新:', this.config);
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return { ...this.stats, isRunning: this.isRunning };
    }

    /**
     * 查找按钮
     */
    findButton(text) {
        const buttons = document.querySelectorAll('button, a, .el-button, .ant-btn');
        for (const btn of buttons) {
            if (btn.textContent.includes(text)) {
                return btn;
            }
        }
        return null;
    }

    /**
     * 延时函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
