/**
 * 视频处理模块
 * 负责视频播放、倍速、快进等功能
 */

import { logger } from '../core/utils.js';

export default class VideoHandler {
    /**
     * 检测是否为视频页面
     */
    static isVideoPage() {
        const hasVideo = !!document.querySelector('video');
        const hasQuestion = !!document.querySelector('.answer-questions-box, .questions-lists-box');
        return hasVideo && !hasQuestion;
    }

    /**
     * 获取视频元素
     */
    static getVideo() {
        return document.querySelector('video');
    }

    /**
     * 播放视频（支持倍速）
     * @param {number} speed - 播放速度（1.0-3.0）
     * @returns {Promise<boolean>}
     */
    static async play(speed = 2.0) {
        try {
            const video = this.getVideo();
            if (!video) {
                logger.warn('[Video] 未找到视频元素');
                return false;
            }

            logger.info(`[Video] 开始播放视频，倍速: ${speed}x`);

            // 自动播放
            if (video.paused) {
                try {
                    await video.play();
                    logger.debug('[Video] 视频已开始播放');
                } catch (e) {
                    logger.error('[Video] 播放失败:', e);
                    return false;
                }
            }

            // 设置倍速
            video.playbackRate = speed;
            logger.debug(`[Video] 播放速度设置为 ${speed}x`);

            // 等待播放结束
            await new Promise((resolve) => {
                if (video.ended) {
                    logger.debug('[Video] 视频已结束');
                    resolve();
                    return;
                }

                const onEnded = () => {
                    video.removeEventListener('ended', onEnded);
                    logger.info('[Video] 视频播放完成');
                    resolve();
                };

                video.addEventListener('ended', onEnded);

                // 超时保护（最长等待时间 = 视频时长 / 速度 + 10秒）
                const timeout = video.duration ? (video.duration / speed + 10) * 1000 : 300000;
                setTimeout(() => {
                    video.removeEventListener('ended', onEnded);
                    logger.warn('[Video] 播放超时，强制结束');
                    resolve();
                }, timeout);
            });

            return true;
        } catch (e) {
            logger.error('[Video] 播放视频失败:', e);
            return false;
        }
    }

    /**
     * 一键完成（快进到结尾）
     * @returns {Promise<boolean>}
     */
    static async instantFinish() {
        try {
            const video = this.getVideo();
            if (!video) {
                logger.warn('[Video] 未找到视频元素');
                return false;
            }

            if (!video.duration) {
                logger.warn('[Video] 视频时长未知，无法快进');
                return false;
            }

            logger.info('[Video] 一键完成：快进到结尾');

            // 快进到结尾（留0.5秒确保触发ended事件）
            video.currentTime = Math.max(0, video.duration - 0.5);

            // 如果视频暂停，先播放
            if (video.paused) {
                await video.play();
            }

            // 等待ended事件或超时
            await new Promise((resolve) => {
                if (video.ended) {
                    resolve();
                    return;
                }

                const onEnded = () => {
                    video.removeEventListener('ended', onEnded);
                    logger.info('[Video] 一键完成成功');
                    resolve();
                };

                video.addEventListener('ended', onEnded);

                // 超时保护
                setTimeout(() => {
                    video.removeEventListener('ended', onEnded);
                    logger.debug('[Video] 等待ended事件超时');
                    resolve();
                }, 3000);
            });

            return true;
        } catch (e) {
            logger.error('[Video] 一键完成失败:', e);
            return false;
        }
    }

    /**
     * 获取视频信息
     */
    static getVideoInfo() {
        const video = this.getVideo();
        if (!video) return null;

        return {
            duration: video.duration || 0,
            currentTime: video.currentTime || 0,
            paused: video.paused,
            ended: video.ended,
            playbackRate: video.playbackRate,
            progress: video.duration ? (video.currentTime / video.duration * 100).toFixed(2) : 0
        };
    }

    /**
     * 暂停视频
     */
    static pause() {
        const video = this.getVideo();
        if (video && !video.paused) {
            video.pause();
            logger.debug('[Video] 视频已暂停');
            return true;
        }
        return false;
    }

    /**
     * 设置播放速度
     * @param {number} speed 
     */
    static setPlaybackSpeed(speed) {
        const video = this.getVideo();
        if (video) {
            video.playbackRate = speed;
            logger.debug(`[Video] 播放速度设置为 ${speed}x`);
            return true;
        }
        return false;
    }
}
